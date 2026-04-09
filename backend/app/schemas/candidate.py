from pydantic import BaseModel
from typing import Optional


class CandidateBase(BaseModel):
    s_no: Optional[int] = None
    name: str
    email: str
    college: Optional[str] = None
    branch: Optional[str] = None
    cgpa: Optional[float] = None
    best_ai_project: Optional[str] = None
    research_work: Optional[str] = None
    github_url: Optional[str] = None
    resume_url: Optional[str] = None


class CandidateResponse(CandidateBase):
    id: str
    job_id: str
    resume_text: Optional[str] = None
    pipeline_stage: str
    created_at: str
    scores: Optional[dict] = None


class CandidateListResponse(BaseModel):
    candidates: list[CandidateResponse]
    total: int


class PipelineStageUpdate(BaseModel):
    candidate_ids: list[str]
    stage: str
