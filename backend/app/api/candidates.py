import io
import re
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
import pandas as pd
from app.database import get_supabase
from app.schemas.candidate import CandidateResponse, CandidateListResponse, PipelineStageUpdate
from app.services.resume_service import process_resumes_for_job, process_single_resume
from app.services.github_service import analyze_github_for_job
from app.services.evaluation_service import run_evaluation_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()

PIPELINE_STAGES = [
    "uploaded",
    "resume_processed",
    "evaluating",
    "evaluated",
    "ranked",
    "test_sent",
    "test_completed",
    "shortlisted",
    "interview_scheduled",
    "error",
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
    test_scores_df = None

    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(contents))
    else:
        xl = pd.ExcelFile(io.BytesIO(contents))
        logger.info(f"Candidate upload sheets: {xl.sheet_names}")
        df = xl.parse(0)
        found_sheets = []
        for sheet_name in xl.sheet_names:
            sheet_df = xl.parse(sheet_name)
            cols = [c.strip().lower().replace(" ", "_") for c in sheet_df.columns]
            if "test_la" in cols or "test_code" in cols:
                found_sheets.append((sheet_name, sheet_df, cols))
                logger.info(f"Sheet '{sheet_name}' has test columns: {cols}")
        if found_sheets:
            # Prefer a non-first sheet (dedicated test sheet) over the main data sheet
            chosen = found_sheets[-1] if len(found_sheets) > 1 else found_sheets[0]
            test_scores_df = chosen[1]
            test_scores_df.columns = chosen[2]
            logger.info(f"Using sheet '{chosen[0]}' for test scores ({len(test_scores_df)} rows)")

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

    if test_scores_df is not None:
        test_lookup = {}
        for _, trow in test_scores_df.iterrows():
            key_email = str(trow.get("email", "")).strip().lower()
            key_name = str(trow.get("name", "")).strip().lower()
            tla = trow.get("test_la")
            tco = trow.get("test_code")
            entry = {}
            if pd.notna(tla):
                try:
                    entry["test_la"] = float(tla)
                except (ValueError, TypeError):
                    pass
            if pd.notna(tco):
                try:
                    entry["test_code"] = float(tco)
                except (ValueError, TypeError):
                    pass
            if entry:
                if key_email:
                    test_lookup[("email", key_email)] = entry
                if key_name:
                    test_lookup[("name", key_name)] = entry

    db = get_supabase()
    candidates_created = []
    test_inserted = 0

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
            "status_message": "Uploaded, awaiting processing",
        }
        result = db.table("candidates").insert(candidate_data).execute()
        if result.data:
            candidates_created.append(result.data[0])
            cid = result.data[0]["id"]
            test_entry = None

            if test_scores_df is not None:
                raw_name = str(row.get("name", "")).strip()
                name_key = re.sub(r"\s+", " ", raw_name.lower()).strip()
                test_entry = test_lookup.get(("name", name_key))
                if not test_entry:
                    norm_key = re.sub(r"[.\-_,;:'\"]", " ", name_key)
                    norm_key = re.sub(r"\s+", " ", norm_key).strip()
                    test_entry = test_lookup.get(("name", norm_key))
            else:
                te = {}
                tla = row.get("test_la")
                tco = row.get("test_code")
                if tla is not None and pd.notna(tla):
                    try:
                        te["test_la"] = float(tla)
                    except (ValueError, TypeError):
                        pass
                if tco is not None and pd.notna(tco):
                    try:
                        te["test_code"] = float(tco)
                    except (ValueError, TypeError):
                        pass
                if te:
                    test_entry = te

            if test_entry:
                test_data = {"candidate_id": cid, "job_id": job_id, **test_entry}
                db.table("test_results").upsert(test_data, on_conflict="candidate_id").execute()
                test_inserted += 1
                logger.info(f"Inserted test scores for {candidate_data['name']}: {test_entry}")

    logger.info(f"Created {len(candidates_created)} candidates, {test_inserted} with test scores")
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

    candidate_ids = [row["id"] for row in result.data]
    scores_map = {}
    if candidate_ids:
        scores_result = db.table("scores").select("*").in_("candidate_id", candidate_ids).execute()
        scores_map = {s["candidate_id"]: s for s in scores_result.data}

    candidates = []
    for row in result.data:
        row["scores"] = scores_map.get(row["id"])
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


@router.post("/{candidate_id}/retry-resume")
async def retry_resume(candidate_id: str, background_tasks: BackgroundTasks):
    db = get_supabase()
    result = db.table("candidates").select("*").eq("id", candidate_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate = result.data[0]

    async def _retry():
        try:
            db.table("candidates").update({
                "pipeline_stage": "uploaded",
                "status_message": "Retrying resume processing...",
            }).eq("id", candidate_id).execute()
            updates = await process_single_resume(candidate)
            db.table("candidates").update(updates).eq("id", candidate_id).execute()
        except Exception as e:
            db.table("candidates").update({
                "pipeline_stage": "error",
                "status_message": f"Resume retry failed: {e}",
            }).eq("id", candidate_id).execute()

    background_tasks.add_task(_retry)
    return {"message": "Resume retry started"}


@router.post("/{candidate_id}/retry-evaluation")
async def retry_evaluation(candidate_id: str, background_tasks: BackgroundTasks):
    db = get_supabase()
    result = db.table("candidates").select("*").eq("id", candidate_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate = result.data[0]

    background_tasks.add_task(run_evaluation_pipeline, candidate["job_id"], [candidate_id])
    return {"message": "Evaluation retry started"}


@router.delete("/{candidate_id}")
async def delete_candidate(candidate_id: str):
    db = get_supabase()
    db.table("evaluations").delete().eq("candidate_id", candidate_id).execute()
    db.table("scores").delete().eq("candidate_id", candidate_id).execute()
    db.table("test_results").delete().eq("candidate_id", candidate_id).execute()
    db.table("interviews").delete().eq("candidate_id", candidate_id).execute()
    db.table("email_logs").delete().eq("candidate_id", candidate_id).execute()
    db.table("candidates").delete().eq("id", candidate_id).execute()
    return {"status": "deleted"}


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
