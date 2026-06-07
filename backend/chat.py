"""Conversational follow-up over a finished TicketGuard investigation.

After the 8-step pipeline returns a verdict, a user can keep asking questions
("why is this high risk?", "what if they'd used a credit card?", "is this seller
worse than average?"). This module answers those follow-ups with Gemini, grounded
ONLY in the gathered investigation evidence — it does not re-run the pipeline and
never invents new facts.

Memory: the conversation (and which investigation it's about) is persisted to the
`conversations` collection when Atlas is reachable (see db.append_conversation),
so history survives across sessions. With no DB the chat still works turn-to-turn
from the history the client sends — it just isn't persisted. No fabrication.
"""

from __future__ import annotations

import json

import config
import db

_SYSTEM = (
    "You are TicketGuard's assistant. TicketGuard already investigated a "
    "ticket-resale listing and produced the verdict + evidence below. Answer the "
    "user's follow-up questions about THIS investigation only, grounded strictly "
    "in the provided evidence and verdict.\n"
    "Rules:\n"
    "- Speak in risk signals. NEVER call a ticket 'authentic' or 'genuine' — no "
    "third party can verify that.\n"
    "- Ground every claim in the evidence shown. If the question goes beyond what "
    "the investigation found, say so plainly rather than guessing.\n"
    "- Be concise, concrete, and helpful (2-5 sentences unless asked for more).\n"
    "- You may suggest safe next actions (use the official transfer app, pay only "
    "via protected methods, report it), but you give decision-support, not a "
    "guarantee."
)


def _format_context(ctx: dict) -> str:
    """Render the investigation bundle into a compact grounding block."""
    if not ctx:
        return "(no investigation context was provided)"
    keep = {
        "verdict": ctx.get("verdict"),
        "confidence": ctx.get("confidence"),
        "risk_score": ctx.get("risk_score"),
        "reasoning": ctx.get("reasoning"),
        "evidence": ctx.get("evidence"),
        "listing": ctx.get("listing"),
    }
    keep = {k: v for k, v in keep.items() if v not in (None, "", [], {})}
    try:
        return json.dumps(keep, default=str, ensure_ascii=False)[:6000]
    except Exception:  # noqa: BLE001
        return str(keep)[:6000]


def answer(context: dict, messages: list[dict]) -> dict:
    """Answer the latest user turn, grounded in `context`.

    `messages` is the running history [{role: user|assistant, content}], most
    recent last. Returns {"status":"ok","reply":str} or a not_configured/error
    envelope — never a fabricated reply.
    """
    if not config.gemini_configured():
        return {"status": "not_configured", "reason": "Gemini key missing (GOOGLE_API_KEY)"}
    client = db._gc()
    if client is None:
        return {"status": "not_configured", "reason": "Gemini client unavailable"}
    if not messages:
        return {"status": "error", "reason": "no messages"}

    convo = "\n".join(
        f"{(m.get('role') or 'user').upper()}: {m.get('content', '')}"
        for m in messages[-12:]
    )
    prompt = (
        f"{_SYSTEM}\n\n=== INVESTIGATION CONTEXT ===\n{_format_context(context)}\n\n"
        f"=== CONVERSATION SO FAR ===\n{convo}\nASSISTANT:"
    )
    try:
        resp = client.models.generate_content(model=config.GEMINI_MODEL, contents=prompt)
        text = (getattr(resp, "text", None) or "").strip()
        if not text:
            return {"status": "error", "reason": "empty model response"}
        return {"status": "ok", "reply": text}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": str(exc)[:200]}
