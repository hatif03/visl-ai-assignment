from pydantic import BaseModel
from typing import Optional


class EvaluationRequest(BaseModel):
    job_id: str
    candidate_ids: Optional[list[str]] = None


class ScoreBreakdown(BaseModel):
    jd_match: Optional[float] = None
    project_relevance: Optional[float] = None
    research_relevance: Optional[float] = None
    github_score: Optional[float] = None
    cgpa_percentile: Optional[float] = None
    test_la_percentile: Optional[float] = None
    test_code_percentile: Optional[float] = None
    composite_score: Optional[float] = None
    rank: Optional[int] = None


class EvaluationResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    resume_score: Optional[float] = None
    project_score: Optional[float] = None
    research_score: Optional[float] = None
    github_score: Optional[float] = None
    jd_match_score: Optional[float] = None
    explanation: Optional[dict] = None
    created_at: str


class ScoreResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    cgpa_z: Optional[float] = None
    test_la_z: Optional[float] = None
    test_code_z: Optional[float] = None
    semantic_score: Optional[float] = None
    github_score: Optional[float] = None
    composite_score: Optional[float] = None
    rank: Optional[int] = None
    score_breakdown: Optional[dict] = None


class RankingResponse(BaseModel):
    job_id: str
    rankings: list[dict]
    total: int
