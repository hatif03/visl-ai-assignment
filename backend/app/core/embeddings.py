import os
import asyncio
import numpy as np
from google import genai
from app.config import settings

EMBEDDING_MODEL = "gemini-embedding-001"
MAX_RETRIES = 3

_clients: dict[str, genai.Client] = {}


def _get_api_keys() -> list[str]:
    keys = []
    if settings.gemini_api_key:
        keys.append(settings.gemini_api_key)
    alt = os.environ.get("GOOGLE_API_KEY", "")
    if alt and alt not in keys:
        keys.append(alt)
    return keys


def _get_client(api_key: str) -> genai.Client:
    if api_key not in _clients:
        _clients[api_key] = genai.Client(api_key=api_key)
    return _clients[api_key]


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    cleaned = [t[:8000] if t and t.strip() else "N/A" for t in texts]

    last_error = None
    for api_key in _get_api_keys():
        client = _get_client(api_key)
        for attempt in range(MAX_RETRIES):
            try:
                result = await asyncio.to_thread(
                    client.models.embed_content,
                    model=EMBEDDING_MODEL,
                    contents=cleaned,
                )
                return [list(e.values) for e in result.embeddings]
            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                if "quota" in err_str or "exhausted" in err_str:
                    print(f"Embedding quota exhausted for key ...{api_key[-6:]}, trying next")
                    break
                if "429" in err_str or "rate" in err_str:
                    delay = 3.0 * (2 ** attempt)
                    print(f"Embedding rate limit, retry {attempt+1}/{MAX_RETRIES} in {delay}s")
                    await asyncio.sleep(delay)
                    continue
                raise

    raise last_error


async def get_embedding(text: str) -> list[float]:
    result = await get_embeddings([text])
    return result[0]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    dot = np.dot(a_arr, b_arr)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
