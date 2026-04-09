import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
import pandas as pd
from app.database import get_supabase
from app.services.scoring_engine import compute_rankings

router = APIRouter()


@router.post("/upload-results")
async def upload_test_results(
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

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    db = get_supabase()
    updated = 0

    for _, row in df.iterrows():
        email = str(row.get("email", "")).strip()
        name = str(row.get("name", "")).strip()
        test_la = row.get("test_la")
        test_code = row.get("test_code")

        if not email and not name:
            continue

        try:
            test_la = float(test_la) if pd.notna(test_la) else None
            test_code = float(test_code) if pd.notna(test_code) else None
        except (ValueError, TypeError):
            continue

        query = db.table("candidates").select("*").eq("job_id", job_id)
        if email:
            result = query.eq("email", email).execute()
        else:
            result = query.eq("name", name).execute()

        if not result.data:
            continue

        candidate = result.data[0]
        test_data = {
            "candidate_id": candidate["id"],
            "job_id": job_id,
            "test_la": test_la,
            "test_code": test_code,
        }
        db.table("test_results").upsert(test_data, on_conflict="candidate_id").execute()
        db.table("candidates").update({"pipeline_stage": "test_completed"}).eq("id", candidate["id"]).execute()
        updated += 1

    background_tasks.add_task(compute_rankings, job_id)

    return {
        "message": f"Updated test results for {updated} candidates",
        "count": updated,
        "job_id": job_id,
    }


@router.get("/results/{job_id}")
async def get_test_results(job_id: str):
    db = get_supabase()
    result = (
        db.table("test_results")
        .select("*, candidates(name, email)")
        .eq("job_id", job_id)
        .execute()
    )
    return {"results": result.data, "total": len(result.data)}
