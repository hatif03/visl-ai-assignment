import json
import litellm
from app.config import settings

litellm.drop_params = True


async def llm_completion(prompt: str, system_prompt: str = "", json_mode: bool = False) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    kwargs = {
        "model": settings.litellm_model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    }

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = await litellm.acompletion(**kwargs)
    return response.choices[0].message.content


async def llm_json_completion(prompt: str, system_prompt: str = "") -> dict:
    raw = await llm_completion(prompt, system_prompt, json_mode=True)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
    return json.loads(raw)
