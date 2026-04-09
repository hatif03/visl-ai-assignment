import numpy as np
from scipy.stats import norm
from app.database import get_supabase


def z_score_to_percentile(values: list[float | None]) -> list[float]:
    """Convert raw values to percentile scores via Z-score normalization + CDF."""
    clean = [v for v in values if v is not None]
    if len(clean) < 2:
        return [0.5 if v is not None else 0.0 for v in values]

    mu = np.mean(clean)
    sigma = np.std(clean)

    if sigma == 0:
        return [0.5 if v is not None else 0.0 for v in values]

    result = []
    for v in values:
        if v is None:
            result.append(0.0)
        else:
            z = (v - mu) / sigma
            percentile = float(norm.cdf(z))
            result.append(round(percentile, 4))
    return result


def normalize_to_01(values: list[float]) -> list[float]:
    """Min-max normalize a list of values to [0, 1]."""
    if not values:
        return []
    min_v = min(values)
    max_v = max(values)
    if max_v == min_v:
        return [0.5] * len(values)
    return [round((v - min_v) / (max_v - min_v), 4) for v in values]


async def compute_rankings(job_id: str) -> dict:
    db = get_supabase()

    job_result = db.table("jobs").select("*").eq("id", job_id).execute()
    if not job_result.data:
        raise ValueError(f"Job {job_id} not found")
    job = job_result.data[0]
    weights = job.get("weight_config", {})

    candidates_result = db.table("candidates").select("*").eq("job_id", job_id).execute()
    candidates = candidates_result.data
    if not candidates:
        return {"job_id": job_id, "rankings": [], "total": 0}

    evals_result = db.table("evaluations").select("*").eq("job_id", job_id).execute()
    evals_map = {e["candidate_id"]: e for e in evals_result.data}

    tests_result = db.table("test_results").select("*").eq("job_id", job_id).execute()
    tests_map = {t["candidate_id"]: t for t in tests_result.data}

    cgpa_vals = [c.get("cgpa") for c in candidates]
    cgpa_percentiles = z_score_to_percentile(cgpa_vals)

    test_la_vals = [tests_map.get(c["id"], {}).get("test_la") for c in candidates]
    test_la_percentiles = z_score_to_percentile(test_la_vals)

    test_code_vals = [tests_map.get(c["id"], {}).get("test_code") for c in candidates]
    test_code_percentiles = z_score_to_percentile(test_code_vals)

    github_raw = [evals_map.get(c["id"], {}).get("github_score", 0) or 0 for c in candidates]
    github_normalized = normalize_to_01(github_raw)

    scores_data = []
    for i, candidate in enumerate(candidates):
        eval_data = evals_map.get(candidate["id"], {})
        jd_match = eval_data.get("jd_match_score", 0) or 0
        project_relevance = eval_data.get("project_score", 0) or 0
        research_relevance = eval_data.get("research_score", 0) or 0

        w = weights
        composite = (
            w.get("jd_match", 0.25) * jd_match
            + w.get("github", 0.20) * github_normalized[i]
            + w.get("test_code", 0.20) * test_code_percentiles[i]
            + w.get("test_la", 0.10) * test_la_percentiles[i]
            + w.get("project_relevance", 0.10) * project_relevance
            + w.get("research_relevance", 0.05) * research_relevance
            + w.get("cgpa", 0.10) * cgpa_percentiles[i]
        )

        breakdown = {
            "jd_match": {"raw": round(jd_match, 4), "weight": w.get("jd_match", 0.25), "weighted": round(w.get("jd_match", 0.25) * jd_match, 4)},
            "github": {"raw": round(github_normalized[i], 4), "weight": w.get("github", 0.20), "weighted": round(w.get("github", 0.20) * github_normalized[i], 4)},
            "test_code": {"raw": round(test_code_percentiles[i], 4), "weight": w.get("test_code", 0.20), "weighted": round(w.get("test_code", 0.20) * test_code_percentiles[i], 4)},
            "test_la": {"raw": round(test_la_percentiles[i], 4), "weight": w.get("test_la", 0.10), "weighted": round(w.get("test_la", 0.10) * test_la_percentiles[i], 4)},
            "project_relevance": {"raw": round(project_relevance, 4), "weight": w.get("project_relevance", 0.10), "weighted": round(w.get("project_relevance", 0.10) * project_relevance, 4)},
            "research_relevance": {"raw": round(research_relevance, 4), "weight": w.get("research_relevance", 0.05), "weighted": round(w.get("research_relevance", 0.05) * research_relevance, 4)},
            "cgpa": {"raw": round(cgpa_percentiles[i], 4), "weight": w.get("cgpa", 0.10), "weighted": round(w.get("cgpa", 0.10) * cgpa_percentiles[i], 4)},
        }

        scores_data.append({
            "candidate_id": candidate["id"],
            "job_id": job_id,
            "cgpa_z": cgpa_percentiles[i],
            "test_la_z": test_la_percentiles[i],
            "test_code_z": test_code_percentiles[i],
            "semantic_score": round(jd_match, 4),
            "github_score": round(github_normalized[i], 4),
            "composite_score": round(composite, 4),
            "score_breakdown": breakdown,
        })

    scores_data.sort(key=lambda x: x["composite_score"], reverse=True)
    for rank, s in enumerate(scores_data, 1):
        s["rank"] = rank

    for s in scores_data:
        existing = db.table("scores").select("id").eq("candidate_id", s["candidate_id"]).eq("job_id", job_id).execute()
        if existing.data:
            db.table("scores").update(s).eq("id", existing.data[0]["id"]).execute()
        else:
            db.table("scores").insert(s).execute()
        db.table("candidates").update({"pipeline_stage": "ranked"}).eq("id", s["candidate_id"]).execute()

    return {"job_id": job_id, "rankings": scores_data, "total": len(scores_data)}
