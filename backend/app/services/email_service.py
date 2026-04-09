import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from app.config import settings
from app.database import get_supabase

TEST_EMAIL_TEMPLATE = """
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">Assessment Invitation</h1>
  </div>
  <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
    <p>Dear <strong>{candidate_name}</strong>,</p>
    <p>Congratulations! Based on our initial screening, you have been shortlisted for the next stage of our hiring process for the <strong>{job_title}</strong> position.</p>
    <p>Please complete the following assessment at your earliest convenience:</p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="{test_link}" style="background: #667eea; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">Take Assessment</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this link: {test_link}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="color: #6b7280; font-size: 12px;">This is an automated message from the AI Candidate Screening Platform.</p>
  </div>
</body>
</html>
"""

INTERVIEW_EMAIL_TEMPLATE = """
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">Interview Invitation</h1>
  </div>
  <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
    <p>Dear <strong>{candidate_name}</strong>,</p>
    <p>We are pleased to invite you for an interview for the <strong>{job_title}</strong> position.</p>
    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <p><strong>Date & Time:</strong> {interview_time}</p>
      <p><strong>Duration:</strong> {duration} minutes</p>
      <p><strong>Google Meet Link:</strong> <a href="{meet_link}">{meet_link}</a></p>
    </div>
    <p>Please join the meeting on time. We look forward to speaking with you!</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="color: #6b7280; font-size: 12px;">This is an automated message from the AI Candidate Screening Platform.</p>
  </div>
</body>
</html>
"""


def _send_email(to_email: str, subject: str, html_body: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.from_email
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.from_email, to_email, msg.as_string())


def _log_email(candidate_id: str, job_id: str, email_type: str, status: str):
    db = get_supabase()
    db.table("email_logs").insert({
        "candidate_id": candidate_id,
        "job_id": job_id,
        "email_type": email_type,
        "status": status,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


async def send_test_emails(
    job_id: str,
    candidate_ids: list[str],
    test_link: str,
    subject: str | None = None,
    body_template: str | None = None,
):
    db = get_supabase()
    job = db.table("jobs").select("title").eq("id", job_id).execute().data[0]

    for cid in candidate_ids:
        candidate = db.table("candidates").select("*").eq("id", cid).execute().data
        if not candidate:
            continue
        candidate = candidate[0]

        html = TEST_EMAIL_TEMPLATE.format(
            candidate_name=candidate["name"],
            job_title=job["title"],
            test_link=test_link,
        )
        email_subject = subject or f"Assessment Invitation - {job['title']}"

        try:
            _send_email(candidate["email"], email_subject, html)
            _log_email(cid, job_id, "test_link", "sent")
            db.table("candidates").update({"pipeline_stage": "test_sent"}).eq("id", cid).execute()
        except Exception as e:
            print(f"Failed to send email to {candidate['email']}: {e}")
            _log_email(cid, job_id, "test_link", f"failed: {str(e)[:200]}")


async def send_interview_emails(job_id: str, candidate_ids: list[str]):
    db = get_supabase()
    job = db.table("jobs").select("title").eq("id", job_id).execute().data[0]

    for cid in candidate_ids:
        candidate = db.table("candidates").select("*").eq("id", cid).execute().data
        if not candidate:
            continue
        candidate = candidate[0]

        interview = db.table("interviews").select("*").eq("candidate_id", cid).eq("job_id", job_id).execute().data
        if not interview:
            continue
        interview = interview[0]

        html = INTERVIEW_EMAIL_TEMPLATE.format(
            candidate_name=candidate["name"],
            job_title=job["title"],
            interview_time=interview["scheduled_at"],
            duration=interview.get("duration_minutes", 30),
            meet_link=interview.get("google_meet_link", "N/A"),
        )

        try:
            _send_email(candidate["email"], f"Interview Invitation - {job['title']}", html)
            _log_email(cid, job_id, "interview_invitation", "sent")
        except Exception as e:
            print(f"Failed to send interview email to {candidate['email']}: {e}")
            _log_email(cid, job_id, "interview_invitation", f"failed: {str(e)[:200]}")
