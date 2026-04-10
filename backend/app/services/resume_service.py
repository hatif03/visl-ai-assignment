import re
import io
import httpx
import pdfplumber
from app.database import get_supabase


def extract_gdrive_file_id(url: str) -> str | None:
    patterns = [
        r"/file/d/([a-zA-Z0-9_-]+)",
        r"id=([a-zA-Z0-9_-]+)",
        r"/open\?id=([a-zA-Z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def download_resume_pdf(url: str) -> bytes | None:
    file_id = extract_gdrive_file_id(url)
    if not file_id:
        return None

    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        response = await client.get(download_url)
        if response.status_code == 200 and len(response.content) > 100:
            return response.content

        confirm_url = f"https://drive.google.com/uc?export=download&confirm=t&id={file_id}"
        response = await client.get(confirm_url)
        if response.status_code == 200:
            return response.content

    return None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def _update_status(db, candidate_id: str, stage: str, message: str, extra: dict | None = None):
    payload = {"pipeline_stage": stage, "status_message": message}
    if extra:
        payload.update(extra)
    db.table("candidates").update(payload).eq("id", candidate_id).execute()


async def process_single_resume(candidate: dict) -> dict:
    """Process a single candidate's resume. Returns updated fields dict or raises."""
    resume_url = candidate.get("resume_url")
    if not resume_url:
        return {"status_message": "No resume URL provided", "pipeline_stage": "uploaded"}

    pdf_bytes = await download_resume_pdf(resume_url)
    if not pdf_bytes:
        raise RuntimeError("Failed to download resume PDF from Google Drive")

    resume_text = extract_text_from_pdf(pdf_bytes)
    if not resume_text.strip():
        raise RuntimeError("PDF downloaded but no text could be extracted")

    return {
        "resume_text": resume_text,
        "pipeline_stage": "resume_processed",
        "status_message": f"Resume parsed — {len(resume_text)} chars extracted",
    }


async def process_resumes_for_job(job_id: str):
    db = get_supabase()
    result = db.table("candidates").select("*").eq("job_id", job_id).execute()

    for candidate in result.data:
        cid = candidate["id"]
        name = candidate.get("name", "unknown")
        try:
            _update_status(db, cid, candidate.get("pipeline_stage", "uploaded"), f"Processing resume...")
            updates = await process_single_resume(candidate)
            db.table("candidates").update(updates).eq("id", cid).execute()
        except Exception as e:
            _update_status(db, cid, "error", f"Resume processing failed: {e}")
            print(f"Error processing resume for {name}: {e}")
            continue
