import re
import math
from datetime import datetime, timezone
import httpx
from app.config import settings
from app.database import get_supabase

DECAY_LAMBDA = 0.002  # ~346-day half-life
FORK_WEIGHT = 2.0


def extract_github_username(url: str) -> str | None:
    if not url:
        return None
    patterns = [
        r"github\.com/([a-zA-Z0-9_-]+)/?$",
        r"github\.com/([a-zA-Z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url.strip().rstrip("/"))
        if match:
            username = match.group(1)
            if username.lower() not in ("settings", "login", "signup", "explore"):
                return username
    return None


async def fetch_user_repos(username: str) -> list[dict]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        headers["Authorization"] = f"token {settings.github_token}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"https://api.github.com/users/{username}/repos",
            params={"sort": "updated", "per_page": 15, "type": "owner"},
            headers=headers,
        )
        if response.status_code != 200:
            return []
        return response.json()


def compute_repo_impact(repo: dict) -> dict:
    stars = repo.get("stargazers_count", 0)
    forks = repo.get("forks_count", 0)
    language = repo.get("language") or "Unknown"
    description = repo.get("description") or ""
    updated_at_str = repo.get("pushed_at") or repo.get("updated_at")
    is_fork = repo.get("fork", False)

    days_since_update = 365
    if updated_at_str:
        try:
            updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
            days_since_update = (datetime.now(timezone.utc) - updated_at).days
        except (ValueError, TypeError):
            pass

    base_value = stars + FORK_WEIGHT * forks
    if base_value == 0:
        base_value = 0.5 if not is_fork else 0.1

    decay = math.exp(-DECAY_LAMBDA * days_since_update)
    impact = base_value * decay

    return {
        "name": repo.get("name", ""),
        "description": description[:200],
        "language": language,
        "stars": stars,
        "forks": forks,
        "is_fork": is_fork,
        "days_since_update": days_since_update,
        "decay_factor": round(decay, 4),
        "impact_score": round(impact, 4),
    }


async def analyze_github_profile(github_url: str) -> dict:
    username = extract_github_username(github_url)
    if not username:
        return {"username": None, "total_impact": 0, "repos": [], "top_languages": {}}

    repos = await fetch_user_repos(username)
    if not repos:
        return {"username": username, "total_impact": 0, "repos": [], "top_languages": {}}

    repo_impacts = [compute_repo_impact(r) for r in repos]
    repo_impacts.sort(key=lambda x: x["impact_score"], reverse=True)

    languages = {}
    for r in repo_impacts:
        lang = r["language"]
        if lang and lang != "Unknown":
            languages[lang] = languages.get(lang, 0) + 1

    total_impact = sum(r["impact_score"] for r in repo_impacts[:10])

    return {
        "username": username,
        "total_impact": round(total_impact, 4),
        "repo_count": len(repos),
        "repos": repo_impacts[:10],
        "top_languages": dict(sorted(languages.items(), key=lambda x: -x[1])[:8]),
    }


async def analyze_github_for_job(job_id: str):
    db = get_supabase()
    result = db.table("candidates").select("*").eq("job_id", job_id).execute()

    github_results = []
    for candidate in result.data:
        github_url = candidate.get("github_url")
        if not github_url:
            github_results.append({"candidate_id": candidate["id"], "total_impact": 0})
            continue

        try:
            analysis = await analyze_github_profile(github_url)
            eval_result = db.table("evaluations").select("*").eq("candidate_id", candidate["id"]).execute()
            update_data = {"github_score": analysis["total_impact"], "explanation": {}}
            if eval_result.data:
                existing = eval_result.data[0].get("explanation") or {}
                existing["github_analysis"] = analysis
                db.table("evaluations").update({
                    "github_score": analysis["total_impact"],
                    "explanation": existing,
                }).eq("candidate_id", candidate["id"]).execute()
            else:
                db.table("evaluations").insert({
                    "candidate_id": candidate["id"],
                    "job_id": job_id,
                    "github_score": analysis["total_impact"],
                    "explanation": {"github_analysis": analysis},
                }).execute()
            github_results.append({"candidate_id": candidate["id"], "total_impact": analysis["total_impact"]})
        except Exception as e:
            print(f"Error analyzing GitHub for {candidate.get('name', 'unknown')}: {e}")
            github_results.append({"candidate_id": candidate["id"], "total_impact": 0})

    return github_results
