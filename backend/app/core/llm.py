import json
import os
import asyncio
import litellm
from app.config import settings

litellm.drop_params = True

MAX_RETRIES = 3
BASE_DELAY = 5.0


def _build_model_chain() -> list[dict]:
    """Build a prioritized list of (model, api_key) combos to try."""
    chain = []

    gemini_key = settings.gemini_api_key
    alt_key = os.environ.get("GOOGLE_API_KEY", "")
    groq_key = settings.groq_api_key

    gemini_models = ["gemini/gemini-2.0-flash", "gemini/gemini-2.0-flash-lite", "gemini/gemini-1.5-flash"]
    gemini_keys = [k for k in [gemini_key, alt_key] if k]

    for model in gemini_models:
        for key in gemini_keys:
            chain.append({"model": model, "api_key": key})

    if groq_key:
        chain.append({"model": "groq/llama-3.3-70b-versatile", "api_key": groq_key})
        chain.append({"model": "groq/llama-3.1-8b-instant", "api_key": groq_key})

    primary = settings.litellm_model
    if not any(c["model"] == primary for c in chain):
        chain.insert(0, {"model": primary, "api_key": gemini_key})

    return chain


_model_chain = None


def _get_model_chain() -> list[dict]:
    global _model_chain
    if _model_chain is None:
        _model_chain = _build_model_chain()
    return _model_chain


async def llm_completion(prompt: str, system_prompt: str = "", json_mode: bool = False) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    base_kwargs = {
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    if json_mode:
        base_kwargs["response_format"] = {"type": "json_object"}

    last_error = None
    for combo in _get_model_chain():
        model = combo["model"]
        api_key = combo.get("api_key")
        kwargs = {"model": model, **base_kwargs}
        if api_key:
            kwargs["api_key"] = api_key

        for attempt in range(MAX_RETRIES):
            try:
                response = await litellm.acompletion(**kwargs)
                return response.choices[0].message.content
            except Exception as e:
                last_error = e
                err_str = str(e).lower()

                if "quota" in err_str or "exhausted" in err_str or "limit: 0" in err_str:
                    print(f"[LLM] Quota exhausted: {model}, skipping")
                    break
                if "permission" in err_str or "disabled" in err_str or "403" in err_str:
                    print(f"[LLM] Permission denied: {model}, skipping")
                    break
                if "not found" in err_str or "404" in err_str:
                    print(f"[LLM] Model not found: {model}, skipping")
                    break

                is_retryable = "rate" in err_str or "429" in err_str or "connection" in err_str or "timeout" in err_str or "500" in err_str or "503" in err_str
                if not is_retryable or attempt == MAX_RETRIES - 1:
                    print(f"[LLM] Non-retryable error on {model}: {type(e).__name__}, trying next")
                    break

                delay = BASE_DELAY * (2 ** attempt)
                print(f"[LLM] Retry {attempt + 1}/{MAX_RETRIES} ({model}) after {delay}s")
                await asyncio.sleep(delay)

    raise last_error


async def llm_json_completion(prompt: str, system_prompt: str = "") -> dict:
    raw = await llm_completion(prompt, system_prompt, json_mode=True)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
    return json.loads(raw)
