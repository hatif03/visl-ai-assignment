from app.database import get_supabase
from app.core.llm import llm_json_completion
from app.core.embeddings import get_embedding, cosine_similarity
from app.services.github_service import analyze_github_profile

EVALUATION_SYSTEM_PROMPT = """You are an expert technical recruiter AI. You evaluate candidates against job descriptions
with detailed, explainable reasoning. You must be fair, evidence-based, and specific in your assessments."""

EVALUATION_PROMPT_TEMPLATE = """Evaluate this candidate against the job description below. Return a JSON object with your assessment.

## Job Description
{job_description}

## Candidate Profile
- Name: {name}
- College: {college}
- Branch: {branch}
- CGPA: {cgpa}
- Best AI Project: {best_ai_project}
- Research Work: {research_work}
- Resume Text: {resume_text}

## Instructions
Score each dimension from 0 to 10 and provide a brief justification.

Return ONLY valid JSON in this exact format:
{{
  "technical_depth": {{
    "score": <0-10>,
    "justification": "<2-3 sentences>"
  }},
  "project_complexity": {{
    "score": <0-10>,
    "justification": "<2-3 sentences>"
  }},
  "research_quality": {{
    "score": <0-10>,
    "justification": "<2-3 sentences>"
  }},
  "jd_alignment": {{
    "score": <0-10>,
    "justification": "<2-3 sentences>"
  }},
  "overall_assessment": "<3-4 sentence summary>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "concerns": ["<concern 1>", "<concern 2>"]
}}"""


async def evaluate_single_candidate(candidate: dict, job_description: str) -> dict:
    prompt = EVALUATION_PROMPT_TEMPLATE.format(
        job_description=job_description,
        name=candidate.get("name", "N/A"),
        college=candidate.get("college", "N/A"),
        branch=candidate.get("branch", "N/A"),
        cgpa=candidate.get("cgpa", "N/A"),
        best_ai_project=candidate.get("best_ai_project", "N/A"),
        research_work=candidate.get("research_work", "N/A"),
        resume_text=(candidate.get("resume_text") or "No resume text available")[:3000],
    )

    try:
        result = await llm_json_completion(prompt, EVALUATION_SYSTEM_PROMPT)
        return result
    except Exception as e:
        print(f"LLM evaluation error for {candidate.get('name')}: {e}")
        return {
            "technical_depth": {"score": 0, "justification": "Evaluation failed"},
            "project_complexity": {"score": 0, "justification": "Evaluation failed"},
            "research_quality": {"score": 0, "justification": "Evaluation failed"},
            "jd_alignment": {"score": 0, "justification": "Evaluation failed"},
            "overall_assessment": "Evaluation could not be completed",
            "strengths": [],
            "concerns": ["Evaluation failed"],
        }


async def compute_semantic_scores(candidate: dict, jd_embedding: list[float]) -> dict:
    scores = {}

    project_text = candidate.get("best_ai_project") or ""
    research_text = candidate.get("research_work") or ""
    resume_text = candidate.get("resume_text") or ""

    if project_text.strip():
        proj_emb = await get_embedding(project_text)
        scores["project_similarity"] = cosine_similarity(proj_emb, jd_embedding)
    else:
        scores["project_similarity"] = 0.0

    if research_text.strip():
        res_emb = await get_embedding(research_text)
        scores["research_similarity"] = cosine_similarity(res_emb, jd_embedding)
    else:
        scores["research_similarity"] = 0.0

    if resume_text.strip():
        resume_emb = await get_embedding(resume_text[:8000])
        scores["resume_similarity"] = cosine_similarity(resume_emb, jd_embedding)
    else:
        scores["resume_similarity"] = 0.0

    scores["jd_match"] = max(
        scores["resume_similarity"] * 0.5 + scores["project_similarity"] * 0.3 + scores["research_similarity"] * 0.2,
        scores["resume_similarity"],
    )
    return scores


async def run_evaluation_pipeline(job_id: str, candidate_ids: list[str] | None = None):
    db = get_supabase()

    job_result = db.table("jobs").select("*").eq("id", job_id).execute()
    if not job_result.data:
        raise ValueError(f"Job {job_id} not found")
    job = job_result.data[0]
    job_description = job["description"]

    jd_embedding = await get_embedding(job_description)

    query = db.table("candidates").select("*").eq("job_id", job_id)
    if candidate_ids:
        query = query.in_("id", candidate_ids)
    candidates_result = query.execute()
    candidates = candidates_result.data

    for candidate in candidates:
        try:
            llm_eval = await evaluate_single_candidate(candidate, job_description)
            semantic_scores = await compute_semantic_scores(candidate, jd_embedding)

            github_analysis = None
            github_url = candidate.get("github_url")
            if github_url:
                github_analysis = await analyze_github_profile(github_url)

            llm_jd_score = llm_eval.get("jd_alignment", {}).get("score", 0) / 10.0
            combined_jd = (semantic_scores["jd_match"] + llm_jd_score) / 2.0

            project_score = (
                (llm_eval.get("project_complexity", {}).get("score", 0) / 10.0 + semantic_scores["project_similarity"]) / 2.0
            )
            research_score = (
                (llm_eval.get("research_quality", {}).get("score", 0) / 10.0 + semantic_scores["research_similarity"]) / 2.0
            )
            github_score = github_analysis["total_impact"] if github_analysis else 0

            explanation = {
                "llm_evaluation": llm_eval,
                "semantic_scores": semantic_scores,
                "github_analysis": github_analysis,
            }

            eval_data = {
                "candidate_id": candidate["id"],
                "job_id": job_id,
                "resume_score": round(semantic_scores.get("resume_similarity", 0), 4),
                "project_score": round(project_score, 4),
                "research_score": round(research_score, 4),
                "github_score": round(github_score, 4),
                "jd_match_score": round(combined_jd, 4),
                "explanation": explanation,
            }

            existing = db.table("evaluations").select("id").eq("candidate_id", candidate["id"]).eq("job_id", job_id).execute()
            if existing.data:
                db.table("evaluations").update(eval_data).eq("id", existing.data[0]["id"]).execute()
            else:
                db.table("evaluations").insert(eval_data).execute()

            db.table("candidates").update({"pipeline_stage": "evaluated"}).eq("id", candidate["id"]).execute()

        except Exception as e:
            print(f"Evaluation pipeline error for {candidate.get('name', 'unknown')}: {e}")
            continue
