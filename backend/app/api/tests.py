import io
import re
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
import pandas as pd
from app.database import get_supabase
from app.services.scoring_engine import compute_rankings

router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    """Normalize a name for fuzzy matching: lowercase, collapse whitespace, strip punctuation."""
    name = name.strip().lower()
    name = re.sub(r"[.\-_,;:'\"]", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _find_test_dataframe(contents: bytes, filename: str) -> pd.DataFrame:
    """Read the correct sheet from an Excel/CSV file that contains test_la or test_code columns.
    Prefers the last matching sheet (dedicated test sheet) over the first (main data sheet)."""
    if filename.endswith(".csv"):
        return pd.read_csv(io.BytesIO(contents))

    xl = pd.ExcelFile(io.BytesIO(contents))
    sheet_names = xl.sheet_names
    logger.info(f"Excel sheets found: {sheet_names}")

    matches = []
    for name in sheet_names:
        df = xl.parse(name)
        cols = [c.strip().lower().replace(" ", "_") for c in df.columns]
        if "test_la" in cols or "test_code" in cols:
            logger.info(f"Sheet '{name}' has test columns: {cols}")
            matches.append(df)

    if matches:
        return matches[-1]

    logger.warning("No sheet has test columns. Falling back to first sheet.")
    return xl.parse(0)


def _build_candidate_name_map(db, job_id: str) -> dict[str, str]:
    """Build normalized-name->candidate_id map for a job, supporting fuzzy matching."""
    r = db.table("candidates").select("id, name").eq("job_id", job_id).execute()
    name_map = {}
    for c in r.data:
        key = _normalize_name(c["name"])
        name_map[key] = c["id"]
    return name_map


def _fuzzy_match_candidate(name: str, name_map: dict[str, str]) -> str | None:
    """Try exact normalized match first, then substring/contains match as fallback."""
    norm = _normalize_name(name)
    if not norm:
        return None

    if norm in name_map:
        return name_map[norm]

    for candidate_norm, cid in name_map.items():
        if norm in candidate_norm or candidate_norm in norm:
            logger.info(f"Fuzzy substring match: '{name}' -> '{candidate_norm}'")
            return cid

    norm_parts = set(norm.split())
    if len(norm_parts) >= 2:
        for candidate_norm, cid in name_map.items():
            cand_parts = set(candidate_norm.split())
            if norm_parts == cand_parts:
                logger.info(f"Fuzzy reorder match: '{name}' -> '{candidate_norm}'")
                return cid

    for candidate_norm, cid in name_map.items():
        cand_no_space = candidate_norm.replace(" ", "")
        norm_no_space = norm.replace(" ", "")
        if cand_no_space == norm_no_space:
            logger.info(f"Fuzzy no-space match: '{name}' -> '{candidate_norm}'")
            return cid

    return None


@router.post("/upload-results")
async def upload_test_results(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    job_id: str = Form(...),
):
    if not file.filename.endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be CSV or Excel format")

    contents = await file.read()
    df = _find_test_dataframe(contents, file.filename)

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    logger.info(f"Test upload columns: {list(df.columns)}, rows: {len(df)}")

    if "test_la" not in df.columns and "test_code" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"File does not contain 'test_la' or 'test_code' columns. Found: {list(df.columns)}",
        )

    db = get_supabase()
    name_map = _build_candidate_name_map(db, job_id)
    logger.info(f"Candidate name map has {len(name_map)} entries: {list(name_map.keys())}")

    updated = 0
    skipped = 0

    for _, row in df.iterrows():
        name = str(row.get("name", "")).strip()
        test_la = row.get("test_la")
        test_code = row.get("test_code")

        try:
            test_la = float(test_la) if pd.notna(test_la) else None
            test_code = float(test_code) if pd.notna(test_code) else None
        except (ValueError, TypeError):
            skipped += 1
            continue

        if test_la is None and test_code is None:
            skipped += 1
            continue

        candidate_id = _fuzzy_match_candidate(name, name_map)
        if not candidate_id:
            logger.warning(f"No candidate match for name='{name}' in job {job_id}")
            skipped += 1
            continue

        test_data = {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "test_la": test_la,
            "test_code": test_code,
        }
        db.table("test_results").upsert(test_data, on_conflict="candidate_id").execute()
        db.table("candidates").update({"pipeline_stage": "test_completed"}).eq("id", candidate_id).execute()
        updated += 1
        logger.info(f"Test results for {name}: la={test_la}, code={test_code}")

    if updated > 0:
        background_tasks.add_task(compute_rankings, job_id)

    return {
        "message": f"Updated test results for {updated} candidates ({skipped} skipped)",
        "count": updated,
        "skipped": skipped,
        "job_id": job_id,
    }


@router.post("/backfill-from-candidates")
async def backfill_test_from_candidates(
    background_tasks: BackgroundTasks,
    job_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Re-read test scores from the original dataset and backfill test_results by name matching."""
    contents = await file.read()
    if file.filename.endswith(".csv"):
        xl_sheets = [pd.read_csv(io.BytesIO(contents))]
    else:
        xl = pd.ExcelFile(io.BytesIO(contents))
        xl_sheets = [xl.parse(s) for s in xl.sheet_names]

    db = get_supabase()
    name_map = _build_candidate_name_map(db, job_id)
    updated = 0

    for df in xl_sheets:
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        if "test_la" not in df.columns and "test_code" not in df.columns:
            continue
        for _, row in df.iterrows():
            name = str(row.get("name", "")).strip()
            cid = _fuzzy_match_candidate(name, name_map)
            if not cid:
                continue
            tla = row.get("test_la")
            tco = row.get("test_code")
            try:
                tla = float(tla) if pd.notna(tla) else None
                tco = float(tco) if pd.notna(tco) else None
            except (ValueError, TypeError):
                continue
            if tla is None and tco is None:
                continue
            db.table("test_results").upsert(
                {"candidate_id": cid, "job_id": job_id, "test_la": tla, "test_code": tco},
                on_conflict="candidate_id",
            ).execute()
            updated += 1

    if updated > 0:
        background_tasks.add_task(compute_rankings, job_id)

    return {"message": f"Backfilled test results for {updated} candidates", "count": updated}


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
