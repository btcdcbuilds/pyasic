"""'Ask AI' change requests from owners.

Owner writes a request in Thai or English ("put pad thai up to 90 baht", "add a
FAQ about parking"). Claude proposes the full updated site content; we validate
it, show the owner a list of changes, and nothing goes live until the owner
approves. Without ANTHROPIC_API_KEY the request stays queued for the build team
(QwenPaw build-changes agent).

Uses an Anthropic API key (Claude Console) - never a Claude.ai subscription login.
"""

from __future__ import annotations

import json
import logging
import os

from webapp.content import apply_update, diff_summary, validate_site

log = logging.getLogger(__name__)
MODEL = os.environ.get("AI_CHANGES_MODEL", "claude-opus-5-5")

SYSTEM = """You update the website content of a small business in Thailand for its owner.
You get the current content as JSON and the owner's request. Return the COMPLETE updated
content as JSON in updated_site_json.

Rules:
- Change only what the owner asked for. Keep everything else exactly as it is.
- Keep Thai ("th") and English ("en") text in sync: if the owner writes in one language,
  write natural text in the other. Use simple, friendly wording a Thai customer would expect.
- Never invent facts the owner did not give you: no new prices, licence numbers, awards,
  reviews, opening hours or claims. If something needed is missing, ask in the summary and
  set needs_human to false only if the rest of the change is still useful.
- Never change slug, industry, region, status, google_place_id or booking.type.
- Photos: only use photo paths listed in AVAILABLE_PHOTOS.
- Prices are whole numbers in Thai baht. pricing.ceiling_pct must stay at or below 200.
- Set needs_human to true (and return the content unchanged) if the request is unclear,
  asks for a new feature or custom design, involves legal/refund/payment disputes, or
  anything you can't do by editing this JSON.
- summary_th and summary_en: one or two short sentences telling the owner what you changed
  (or what you need from them)."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "needs_human": {"type": "boolean"},
        "summary_en": {"type": "string"},
        "summary_th": {"type": "string"},
        "updated_site_json": {"type": "string"},
    },
    "required": ["needs_human", "summary_en", "summary_th", "updated_site_json"],
    "additionalProperties": False,
}


def _client():
    import anthropic  # imported lazily so the site runs without the SDK configured
    return anthropic.Anthropic()


def _ask(client, site: dict, request_text: str, photos: list[str], feedback: str | None) -> dict:
    user = (f"AVAILABLE_PHOTOS: {json.dumps(photos)}\n\n"
            f"CURRENT_SITE_JSON:\n{json.dumps(site, ensure_ascii=False)}\n\n"
            f"OWNER_REQUEST:\n{request_text}")
    if feedback:
        user += f"\n\nYour previous answer failed validation. Fix these problems:\n{feedback}"
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=64000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium",
                       "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise RuntimeError("the model declined this request")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("response was cut off")
    text = next(b.text for b in msg.content if b.type == "text")
    return json.loads(text)


def propose(store, rid: int, site: dict, photos: list[str], client=None) -> None:
    """Fill in a proposal for request `rid`. Runs in a background thread."""
    req = store.ai_request(rid)
    if client is None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            store.update_ai_request(rid, status="queued",
                                    summary="Waiting for the build team / รอทีมงานดำเนินการ")
            return
        client = _client()
    feedback = None
    try:
        for _ in range(2):  # one retry with validation feedback
            out = _ask(client, site, req["text"], photos, feedback)
            if out["needs_human"]:
                store.update_ai_request(rid, status="needs_human",
                                        summary=f"{out['summary_th']} / {out['summary_en']}")
                return
            proposed = apply_update(site, json.loads(out["updated_site_json"]))
            errors = validate_site(proposed)
            if not errors:
                changes = diff_summary(site, proposed)
                if not changes:
                    store.update_ai_request(rid, status="needs_human",
                                            summary=f"{out['summary_th']} / {out['summary_en']} (no changes)")
                    return
                store.update_ai_request(rid, status="proposed", proposal=proposed,
                                        summary=f"{out['summary_th']} / {out['summary_en']}")
                return
            feedback = "\n".join(errors[:20])
        store.update_ai_request(rid, status="failed", error=f"Validation failed: {feedback}")
    except Exception as e:  # noqa: BLE001 - surface any failure to the owner, never crash the app
        log.exception("AI change request %s failed", rid)
        store.update_ai_request(rid, status="failed", error=str(e)[:500])
