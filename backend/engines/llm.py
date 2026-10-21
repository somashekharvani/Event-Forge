"""Optional, model-agnostic LLM adapter.

The app is fully functional WITHOUT any LLM key: every engine has a deterministic path.
If ANTHROPIC_API_KEY is set, the LLM is used to (a) refine intake extraction, (b) answer
free-form chat, (c) classify uploaded venue photos. Output is always re-validated by Pydantic
and falls back to the deterministic result on any failure.

NOTE: the live-API branch cannot be exercised without a key; the deterministic fallback is what
the test-suite covers.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.request


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def provider() -> str:
    return "anthropic" if available() else "none (deterministic fallback)"


def complete(system: str, prompt: str, image_bytes: bytes | None = None, media_type: str = "image/jpeg",
             max_tokens: int = 800) -> str | None:
    if not available():
        return None
    content: list[dict] = []
    if image_bytes:
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type,
                                                    "data": base64.b64encode(image_bytes).decode()}})
    content.append({"type": "text", "text": prompt})
    body = json.dumps({
        "model": os.environ.get("EVENTFORGE_MODEL", "claude-sonnet-5-5"),
        "max_tokens": max_tokens, "system": system,
        "messages": [{"role": "user", "content": content}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read())
        return "".join(b.get("text", "") for b in data.get("content", []))
    except Exception:
        return None


def complete_json(system: str, prompt: str, **kw) -> dict | None:
    txt = complete(system + " Reply with a single JSON object and nothing else.", prompt, **kw)
    if not txt:
        return None
    try:
        s, e = txt.find("{"), txt.rfind("}")
        return json.loads(txt[s:e + 1])
    except Exception:
        return None
