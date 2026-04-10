from fastapi import APIRouter, HTTPException
from app.database import get_supabase
from app.schemas.job import JobCreate, JobResponse

router = APIRouter()


@router.post("", response_model=JobResponse)
async def create_job(job: JobCreate):
    db = get_supabase()
    data = {
        "title": job.title,
        "description": job.description,
        "weight_config": job.weight_config.model_dump(),
    }
    result = db.table("jobs").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create job")
    row = result.data[0]
    row["candidate_count"] = 0
    return JobResponse(**row)


@router.get("", response_model=list[JobResponse])
async def list_jobs():
    db = get_supabase()
    result = db.table("jobs").select("*").order("created_at", desc=True).execute()
    job_ids = [row["id"] for row in result.data]
    count_map: dict[str, int] = {}
    if job_ids:
        all_candidates = db.table("candidates").select("job_id").in_("job_id", job_ids).execute()
        for c in all_candidates.data:
            count_map[c["job_id"]] = count_map.get(c["job_id"], 0) + 1
    jobs = []
    for row in result.data:
        row["candidate_count"] = count_map.get(row["id"], 0)
        jobs.append(JobResponse(**row))
    return jobs


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    db = get_supabase()
    result = db.table("jobs").select("*").eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    row = result.data[0]
    count_result = db.table("candidates").select("id", count="exact").eq("job_id", job_id).execute()
    row["candidate_count"] = count_result.count or 0
    return JobResponse(**row)


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, job: JobCreate):
    db = get_supabase()
    data = {
        "title": job.title,
        "description": job.description,
        "weight_config": job.weight_config.model_dump(),
    }
    result = db.table("jobs").update(data).eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    row = result.data[0]
    count_result = db.table("candidates").select("id", count="exact").eq("job_id", job_id).execute()
    row["candidate_count"] = count_result.count or 0
    return JobResponse(**row)


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    db = get_supabase()
    db.table("candidates").delete().eq("job_id", job_id).execute()
    db.table("jobs").delete().eq("id", job_id).execute()
    return {"status": "deleted"}
