import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
import pandas as pd
from app.database import get_supabase
from app.schemas.candidate import CandidateResponse, CandidateListResponse, PipelineStageUpdate
from app.services.resume_service import process_resumes_for_job
from app.services.github_service import analyze_github_for_job

router = APIRouter()

PIPELINE_STAGES = [
    "uploaded",
    "resume_processed",
    "evaluated",
    "ranked",
    "test_sent",
    "test_completed",
    "shortlisted",
    "interview_scheduled",
]


@router.post("/upload")
async def upload_candidates(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    job_id: str = Form(...),
):
    if not file.filename.endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be CSV or Excel format")

    contents = await file.read()
    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(contents))
    else:
        df = pd.read_excel(io.BytesIO(contents))

    column_map = {
        "s_no": "s_no",
        "name": "name",
        "email": "email",
        "college": "college",
        "branch": "branch",
        "cgpa": "cgpa",
        "best_ai_project": "best_ai_project",
        "research_work": "research_work",
        "github": "github_url",
        "github_profile": "github_url",
        "resume": "resume_url",
        "resume_link": "resume_url",
        "test_la": "test_la",
        "test_code": "test_code",
    }

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    df = df.rename(columns={k: v for k, v in column_map.items() if k in df.columns})

    db = get_supabase()
    candidates_created = []

    for _, row in df.iterrows():
        candidate_data = {
            "job_id": job_id,
            "s_no": int(row.get("s_no", 0)) if pd.notna(row.get("s_no")) else None,
            "name": str(row.get("name", "")),
            "email": str(row.get("email", "")),
            "college": str(row.get("college", "")) if pd.notna(row.get("college")) else None,
            "branch": str(row.get("branch", "")) if pd.notna(row.get("branch")) else None,
            "cgpa": float(row["cgpa"]) if pd.notna(row.get("cgpa")) else None,
            "best_ai_project": str(row.get("best_ai_project", "")) if pd.notna(row.get("best_ai_project")) else None,
            "research_work": str(row.get("research_work", "")) if pd.notna(row.get("research_work")) else None,
            "github_url": str(row.get("github_url", "")) if pd.notna(row.get("github_url")) else None,
            "resume_url": str(row.get("resume_url", "")) if pd.notna(row.get("resume_url")) else None,
            "pipeline_stage": "uploaded",
        }
        result = db.table("candidates").insert(candidate_data).execute()
        if result.data:
            candidates_created.append(result.data[0])

    background_tasks.add_task(process_resumes_for_job, job_id)

    return {
        "message": f"Uploaded {len(candidates_created)} candidates",
        "count": len(candidates_created),
        "job_id": job_id,
    }


@router.get("", response_model=CandidateListResponse)
async def list_candidates(
    job_id: str = None,
    stage: str = None,
    limit: int = 100,
    offset: int = 0,
):
    db = get_supabase()
    query = db.table("candidates").select("*", count="exact")
    if job_id:
        query = query.eq("job_id", job_id)
    if stage:
        query = query.eq("pipeline_stage", stage)
    query = query.order("created_at", desc=False)
    query = query.range(offset, offset + limit - 1)
    result = query.execute()

    candidates = []
    for row in result.data:
        score_result = db.table("scores").select("*").eq("candidate_id", row["id"]).execute()
        row["scores"] = score_result.data[0] if score_result.data else None
        candidates.append(CandidateResponse(**row))

    return CandidateListResponse(candidates=candidates, total=result.count or len(candidates))


@router.get("/pipeline/summary")
async def pipeline_summary(job_id: str):
    db = get_supabase()
    summary = {}
    for stage in PIPELINE_STAGES:
        result = (
            db.table("candidates")
            .select("id", count="exact")
            .eq("job_id", job_id)
            .eq("pipeline_stage", stage)
            .execute()
        )
        summary[stage] = result.count or 0
    return {"job_id": job_id, "stages": summary}


@router.put("/pipeline-stage")
async def update_pipeline_stage(update: PipelineStageUpdate):
    if update.stage not in PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {PIPELINE_STAGES}")
    db = get_supabase()
    for cid in update.candidate_ids:
        db.table("candidates").update({"pipeline_stage": update.stage}).eq("id", cid).execute()
    return {"message": f"Updated {len(update.candidate_ids)} candidates to stage '{update.stage}'"}


@router.post("/process-resumes")
async def trigger_resume_processing(job_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_resumes_for_job, job_id)
    return {"message": "Resume processing started"}


@router.post("/analyze-github")
async def trigger_github_analysis(job_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(analyze_github_for_job, job_id)
    return {"message": "GitHub analysis started"}


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(candidate_id: str):
    db = get_supabase()
    result = db.table("candidates").select("*").eq("id", candidate_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Candidate not found")
    row = result.data[0]
    score_result = db.table("scores").select("*").eq("candidate_id", candidate_id).execute()
    row["scores"] = score_result.data[0] if score_result.data else None
    return CandidateResponse(**row)
