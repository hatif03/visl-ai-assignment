from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.database import get_supabase
from app.schemas.evaluation import EvaluationRequest, RankingResponse
from app.services.evaluation_service import run_evaluation_pipeline
from app.services.scoring_engine import compute_rankings

router = APIRouter()


@router.post("/run")
async def run_evaluations(request: EvaluationRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_evaluation_pipeline, request.job_id, request.candidate_ids)
    return {"message": "Evaluation pipeline started", "job_id": request.job_id}


@router.post("/rank")
async def rank_candidates(job_id: str):
    try:
        rankings = await compute_rankings(job_id)
        return rankings
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rankings/{job_id}", response_model=RankingResponse)
async def get_rankings(job_id: str):
    db = get_supabase()
    result = (
        db.table("scores")
        .select("*, candidates(*)")
        .eq("job_id", job_id)
        .order("rank", desc=False)
        .execute()
    )
    return RankingResponse(
        job_id=job_id,
        rankings=result.data,
        total=len(result.data),
    )


@router.get("/candidate/{candidate_id}")
async def get_candidate_evaluation(candidate_id: str):
    db = get_supabase()
    eval_result = db.table("evaluations").select("*").eq("candidate_id", candidate_id).execute()
    score_result = db.table("scores").select("*").eq("candidate_id", candidate_id).execute()
    return {
        "evaluation": eval_result.data[0] if eval_result.data else None,
        "score": score_result.data[0] if score_result.data else None,
    }


@router.get("/{job_id}")
async def get_evaluations(job_id: str):
    db = get_supabase()
    result = (
        db.table("evaluations")
        .select("*, candidates(name, email)")
        .eq("job_id", job_id)
        .execute()
    )
    return {"evaluations": result.data, "total": len(result.data)}
