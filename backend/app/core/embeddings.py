import numpy as np
import litellm
from app.config import settings


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    cleaned = [t if t and t.strip() else "N/A" for t in texts]
    response = await litellm.aembedding(
        model=settings.embedding_model,
        input=cleaned,
    )
    return [item["embedding"] for item in response.data]


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
