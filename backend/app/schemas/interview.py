from pydantic import BaseModel
from typing import Optional


class InterviewScheduleRequest(BaseModel):
    job_id: str
    candidate_ids: list[str]
    duration_minutes: int = 30
    interviewer_email: str
    start_date: str  # ISO format: 2025-01-15
    start_hour: int = 10  # 24h format
    gap_minutes: int = 15


class InterviewResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    scheduled_at: str
    duration_minutes: int
    google_meet_link: Optional[str] = None
    calendar_event_id: Optional[str] = None
    status: str
    created_at: str


class EmailRequest(BaseModel):
    job_id: str
    candidate_ids: list[str]
    test_link: str
    subject: Optional[str] = None
    body_template: Optional[str] = None
