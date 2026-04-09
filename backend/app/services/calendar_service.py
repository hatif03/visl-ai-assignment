import json
import uuid
from datetime import datetime, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import settings
from app.database import get_supabase

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _get_calendar_service():
    creds_info = json.loads(settings.google_credentials_json)
    credentials = service_account.Credentials.from_service_account_info(creds_info, scopes=SCOPES)
    return build("calendar", "v3", credentials=credentials)


async def schedule_interviews(
    job_id: str,
    candidate_ids: list[str],
    duration_minutes: int = 30,
    interviewer_email: str = "",
    start_date: str = "",
    start_hour: int = 10,
    gap_minutes: int = 15,
):
    db = get_supabase()
    job = db.table("jobs").select("title").eq("id", job_id).execute().data[0]

    try:
        service = _get_calendar_service()
    except Exception as e:
        print(f"Google Calendar auth failed: {e}")
        for cid in candidate_ids:
            _create_mock_interview(db, cid, job_id, job["title"], duration_minutes, start_date, start_hour, gap_minutes, candidate_ids.index(cid))
        return

    base_dt = datetime.fromisoformat(start_date) if start_date else datetime.now()
    current_time = base_dt.replace(hour=start_hour, minute=0, second=0, microsecond=0)
    slot_duration = timedelta(minutes=duration_minutes + gap_minutes)

    for idx, cid in enumerate(candidate_ids):
        candidate = db.table("candidates").select("*").eq("id", cid).execute().data
        if not candidate:
            continue
        candidate = candidate[0]

        start_time = current_time + (slot_duration * idx)
        end_time = start_time + timedelta(minutes=duration_minutes)

        request_id = str(uuid.uuid4())

        event = {
            "summary": f"Interview: {candidate['name']} - {job['title']}",
            "description": f"Interview for {job['title']} position.\nCandidate: {candidate['name']} ({candidate['email']})",
            "start": {"dateTime": start_time.isoformat(), "timeZone": "Asia/Kolkata"},
            "end": {"dateTime": end_time.isoformat(), "timeZone": "Asia/Kolkata"},
            "attendees": [
                {"email": candidate["email"]},
                {"email": interviewer_email},
            ],
            "conferenceData": {
                "createRequest": {
                    "requestId": request_id,
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }

        try:
            created_event = (
                service.events()
                .insert(calendarId=settings.google_calendar_id, body=event, conferenceDataVersion=1, sendUpdates="all")
                .execute()
            )
            meet_link = created_event.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri", "")

            db.table("interviews").insert({
                "candidate_id": cid,
                "job_id": job_id,
                "scheduled_at": start_time.isoformat(),
                "duration_minutes": duration_minutes,
                "google_meet_link": meet_link,
                "calendar_event_id": created_event.get("id"),
                "status": "scheduled",
            }).execute()
            db.table("candidates").update({"pipeline_stage": "interview_scheduled"}).eq("id", cid).execute()

        except Exception as e:
            print(f"Failed to create calendar event for {candidate['name']}: {e}")
            _create_mock_interview(db, cid, job_id, job["title"], duration_minutes, start_date, start_hour, gap_minutes, idx)


def _create_mock_interview(db, cid, job_id, job_title, duration_minutes, start_date, start_hour, gap_minutes, idx):
    """Fallback: create interview record without actual Google Calendar event."""
    base_dt = datetime.fromisoformat(start_date) if start_date else datetime.now()
    start_time = base_dt.replace(hour=start_hour, minute=0) + timedelta(minutes=(duration_minutes + gap_minutes) * idx)

    db.table("interviews").insert({
        "candidate_id": cid,
        "job_id": job_id,
        "scheduled_at": start_time.isoformat(),
        "duration_minutes": duration_minutes,
        "google_meet_link": "",
        "calendar_event_id": None,
        "status": "pending_calendar_setup",
    }).execute()
    db.table("candidates").update({"pipeline_stage": "interview_scheduled"}).eq("id", cid).execute()
