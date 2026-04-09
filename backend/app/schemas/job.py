from pydantic import BaseModel
from typing import Optional
from datetime import datetime


DEFAULT_WEIGHTS = {
    "jd_match": 0.25,
    "github": 0.20,
    "test_code": 0.20,
    "test_la": 0.10,
    "project_relevance": 0.10,
    "research_relevance": 0.05,
    "cgpa": 0.10,
}


class WeightConfig(BaseModel):
    jd_match: float = 0.25
    github: float = 0.20
    test_code: float = 0.20
    test_la: float = 0.10
    project_relevance: float = 0.10
    research_relevance: float = 0.05
    cgpa: float = 0.10


class JobCreate(BaseModel):
    title: str
    description: str
    weight_config: WeightConfig = WeightConfig()


class JobResponse(BaseModel):
    id: str
    title: str
    description: str
    weight_config: dict
    created_at: str
    candidate_count: Optional[int] = 0
