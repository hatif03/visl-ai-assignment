from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.database import get_supabase
from app.schemas.interview import InterviewScheduleRequest, EmailRequest
from app.services.calendar_service import schedule_interviews
from app.services.email_service import send_test_emails, send_interview_emails

router = APIRouter()


@router.post("/schedule")
async def schedule_interview(request: InterviewScheduleRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        schedule_interviews,
        request.job_id,
        request.candidate_ids,
        request.duration_minutes,
        request.interviewer_email,
        request.start_date,
        request.start_hour,
        request.gap_minutes,
    )
    return {"message": f"Scheduling {len(request.candidate_ids)} interviews", "job_id": request.job_id}


@router.post("/send-test-emails")
async def send_test_link_emails(request: EmailRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        send_test_emails,
        request.job_id,
        request.candidate_ids,
        request.test_link,
        request.subject,
        request.body_template,
    )
    return {"message": f"Sending test emails to {len(request.candidate_ids)} candidates"}


@router.post("/send-interview-emails")
async def send_interview_invitation_emails(job_id: str, candidate_ids: list[str], background_tasks: BackgroundTasks):
    background_tasks.add_task(send_interview_emails, job_id, candidate_ids)
    return {"message": f"Sending interview invitations to {len(candidate_ids)} candidates"}


@router.get("/{job_id}")
async def get_interviews(job_id: str):
    db = get_supabase()
    result = (
        db.table("interviews")
        .select("*, candidates(name, email)")
        .eq("job_id", job_id)
        .order("scheduled_at", desc=False)
        .execute()
    )
    return {"interviews": result.data, "total": len(result.data)}


@router.get("/emails/{job_id}")
async def get_email_logs(job_id: str):
    db = get_supabase()
    result = (
        db.table("email_logs")
        .select("*, candidates(name, email)")
        .eq("job_id", job_id)
        .order("sent_at", desc=True)
        .execute()
    )
    return {"emails": result.data, "total": len(result.data)}
