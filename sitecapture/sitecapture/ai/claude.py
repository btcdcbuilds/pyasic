"""Shared Claude API call returning schema-checked JSON."""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import anthropic

DEFAULT_MODEL = "claude-opus-5-5"


class AiError(RuntimeError):
    pass


def image_block(path: Path, media_type: str = "image/jpeg") -> dict:
    data = base64.standard_b64encode(Path(path).read_bytes()).decode()
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }


def pdf_block(path: Path, title: str = "") -> dict:
    data = base64.standard_b64encode(Path(path).read_bytes()).decode()
    block = {
        "type": "document",
        "source": {"type": "base64", "media_type": "application/pdf", "data": data},
    }
    if title:
        block["title"] = title
    return block


def ask_json(
    content: list[dict],
    schema: dict,
    system: str,
    model: str = DEFAULT_MODEL,
    effort: str = "high",
    max_tokens: int = 32000,
    client: anthropic.Anthropic | None = None,
) -> dict:
    """One request whose reply must match ``schema``; returns the parsed JSON."""
    if client is None:
        if not (
            os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        ):
            raise AiError(
                "AI is not set up yet: add ANTHROPIC_API_KEY to the server settings"
            )
        client = anthropic.Anthropic()
    try:
        with client.beta.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            thinking={"type": "adaptive"},
            output_config={
                "effort": effort,
                "format": {"type": "json_schema", "schema": schema},
            },
            # Retry server-side on Anthropic's recommended model if a safety
            # classifier declines the request.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": content}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.RateLimitError as exc:
        raise AiError("Claude API rate limit reached; try again shortly") from exc
    except anthropic.APIStatusError as exc:
        raise AiError(f"Claude API error {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise AiError("could not reach the Claude API") from exc
    if message.stop_reason == "refusal":
        raise AiError("the model declined this request")
    if message.stop_reason == "max_tokens":
        raise AiError("the answer was too long and got cut off; try with less input")
    text = next((b.text for b in message.content if b.type == "text"), "")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AiError("the model returned an unreadable answer") from exc
