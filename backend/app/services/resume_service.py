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

        # Handle the confirmation page for large files
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


async def process_resumes_for_job(job_id: str):
    db = get_supabase()
    result = db.table("candidates").select("*").eq("job_id", job_id).execute()

    for candidate in result.data:
        resume_url = candidate.get("resume_url")
        if not resume_url:
            continue

        try:
            pdf_bytes = await download_resume_pdf(resume_url)
            if not pdf_bytes:
                continue

            resume_text = extract_text_from_pdf(pdf_bytes)
            if resume_text.strip():
                db.table("candidates").update({
                    "resume_text": resume_text,
                    "pipeline_stage": "resume_processed",
                }).eq("id", candidate["id"]).execute()
        except Exception as e:
            print(f"Error processing resume for {candidate.get('name', 'unknown')}: {e}")
            continue
