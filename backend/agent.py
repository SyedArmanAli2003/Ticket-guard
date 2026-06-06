"""TicketGuard multi-agent team (Google ADK + Gemini).

TicketGuard investigates a ticket-resale listing for SCAM RISK. Instead of one
model doing everything, it orchestrates specialist roles coordinated by the
pipeline. Two roles are *Gemini LlmAgents* (the language-heavy ends of the
funnel); the middle steps are deterministic, DB-grounded analysers in the
pipeline (retrieval, reputation, forgery, server-side scorer, rule engine):

    (1) Normalizer      — Gemini structured extraction → listing object
    (2) Hybrid Retrieval— Atlas $vectorSearch + $search (fused)        [db.py]
    (3) Reputation      — typosquat distance + prior reports           [db.py]
    (4) Forgery/Dup     — sha256(barcode) → tickets_seen; PDF/img hints[db.py + ingest]
    (5) Risk Scorer     — server-side $group/$facet aggregation        [db.py]
    (6) Rule Check      — official-transfer rule engine                [this file]
    (7) Verdict Writer  — Gemini: SCAM | SUSPICIOUS | LIKELY-LEGIT
    (8) Persist         — investigations collection                    [db.py]

The MongoDB MCP server (read-only) is exposed to the agents for ad-hoc grounding
lookups; all writes go through the explicit pymongo path in db.py.

VERDICT VOCABULARY (hard rule): SCAM | SUSPICIOUS | LIKELY-LEGIT only. We speak
in risk-SIGNAL language and NEVER call a ticket "authentic" or "genuine".
"""

from __future__ import annotations

import json
import os

from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

import config
import db

_NPX = "npx.cmd" if os.name == "nt" else "npx"


# --------------------------------------------------------------------------- #
# MCP toolset (official MongoDB MCP server, read-only)
# --------------------------------------------------------------------------- #
def build_mcp_toolset() -> McpToolset | None:
    """The official MongoDB MCP server (read-only). None if Atlas not reachable."""
    if not config.mongo_configured() or not db.is_connected():
        return None
    try:
        return McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command=_NPX,
                    args=["-y", "mongodb-mcp-server",
                          "--connectionString", config.MONGODB_URI, "--readOnly"],
                ),
                timeout=90.0,
            ),
            tool_filter=["find", "aggregate", "count", "collection-schema", "list-collections"],
        )
    except Exception as exc:  # noqa: BLE001
        print(f"ℹ️  MongoDB MCP toolset unavailable ({str(exc)[:80]}).")
        return None


# --------------------------------------------------------------------------- #
# Gemini LlmAgents — Normalizer (step 1) and Verdict Writer (step 7)
# --------------------------------------------------------------------------- #
_TEAM = "You are part of TicketGuard, an AI ticket-resale scam-risk investigation team. "

NORMALIZER_INSTRUCTION = (
    _TEAM + "You are the LISTING NORMALIZER. Read the raw ticket-resale listing "
    "(a DM, post, webpage, or OCR'd image/PDF text) and extract a single structured "
    "listing object. Infer fields only from the text; use null/empty when truly absent. "
    "Capture every urgency/pressure cue verbatim-ish in urgency_cues. "
    "Output ONLY one JSON object with EXACTLY these keys: "
    '{"price": <number|null>, "face_value": <number|null>, "currency": "<e.g. USD|null>", '
    '"quantity": <number|null>, "payment_method": "<zelle|cashapp|venmo_friends|paypal_goods|'
    'crypto|wire|gift_card|bank_transfer|credit_card|official_app|unknown>", '
    '"transfer_method": "<official_app|pdf|screenshot|barcode_image|email|in_person|unknown>", '
    '"seller_handle": "<@handle|null>", "domain": "<host or empty>", "event": "<event/match|null>", '
    '"urgency_cues": ["..."], "barcode_or_ref": "<digits/ref if any|null>"} '
    "No prose, no markdown fences."
)

VERDICT_INSTRUCTION = (
    _TEAM + "You are the VERDICT WRITER. You are given (a) the normalized listing, "
    "(b) retrieved similar labelled cases with their patterns, (c) reputation signals, "
    "(d) forgery/duplicate findings, (e) a server-computed risk score, and (f) the "
    "official-transfer rule outcome. Weigh ONLY this provided evidence and reflect "
    "THIS specific listing. "
    "HARD RULES: the verdict label MUST be exactly one of SCAM, SUSPICIOUS, or "
    "LIKELY-LEGIT. NEVER claim a ticket is authentic/genuine/real — speak only in "
    "risk-signal terms. If a signal is marked not_configured, say so and lower your "
    "confidence rather than inventing data. "
    "Output ONLY one JSON object with EXACTLY these keys: "
    '{"verdict": "SCAM|SUSPICIOUS|LIKELY-LEGIT", "confidence": <0.0-1.0>, '
    '"evidence": ["short factual bullet referencing a real signal", "..."], '
    '"reasoning": "2-4 plain-English sentences grounded in the evidence above"}'
    " No prose outside the JSON, no markdown fences."
)


def build_agents() -> tuple[LlmAgent, LlmAgent, McpToolset | None]:
    """Build the two Gemini LlmAgents and the (optional) read-only MCP toolset.

    The Normalizer optionally gets the MCP toolset so it *could* ground lookups,
    but its core job (extraction) needs no tools. The Verdict Writer is toolless
    on purpose: it must reason only over evidence the pipeline already gathered.
    """
    mcp = build_mcp_toolset()
    normalizer = LlmAgent(
        model=config.GEMINI_MODEL,
        name="normalizer",
        instruction=NORMALIZER_INSTRUCTION,
        tools=[mcp] if mcp is not None else [],
    )
    verdict_writer = LlmAgent(
        model=config.GEMINI_MODEL,
        name="verdict_writer",
        instruction=VERDICT_INSTRUCTION,
        tools=[],
    )
    return normalizer, verdict_writer, mcp


# --------------------------------------------------------------------------- #
# Step 6 — Official-transfer rule engine (deterministic, no LLM, no DB)
# --------------------------------------------------------------------------- #
# Major-event tickets legitimately move ONLY via the official app/transfer. A
# PDF/screenshot/barcode-image "ticket" or an irreversible payment rail are
# structural risk signals regardless of what the listing claims.
_IRREVERSIBLE_PAYMENTS = {"zelle", "cashapp", "venmo_friends", "crypto", "wire",
                          "gift_card", "bank_transfer"}
_RISKY_TRANSFERS = {"pdf", "screenshot", "barcode_image", "email"}


def official_transfer_rules(listing: dict) -> dict:
    """Apply the official-transfer rule set to a normalized listing.

    Returns weighted signals + a boolean ``violates_official_transfer`` and a
    human-readable list. These weights feed the server-side risk scorer (step 5).
    """
    signals: list[dict] = []
    transfer = (listing.get("transfer_method") or "unknown").lower()
    payment = (listing.get("payment_method") or "unknown").lower()
    price = listing.get("price")
    face = listing.get("face_value")
    urgency = listing.get("urgency_cues") or []

    if transfer in _RISKY_TRANSFERS:
        signals.append({"signal": f"non_official_transfer:{transfer}", "weight": 35,
                        "detail": f"Ticket offered as {transfer}, not official-app transfer."})
    elif transfer == "in_person":
        signals.append({"signal": "in_person_no_official_transfer", "weight": 15,
                        "detail": "In-person handoff without official digital transfer."})

    if payment in _IRREVERSIBLE_PAYMENTS:
        signals.append({"signal": f"irreversible_payment:{payment}", "weight": 30,
                        "detail": f"Payment via {payment} removes buyer protection."})

    # Too-good-to-be-true pricing (well below face value).
    try:
        if price is not None and face and float(face) > 0:
            ratio = float(price) / float(face)
            if ratio <= 0.5:
                signals.append({"signal": "price_far_below_face", "weight": 25,
                                "detail": f"Price {price} is {round(ratio*100)}% of face {face}."})
            elif ratio <= 0.75:
                signals.append({"signal": "price_below_face", "weight": 12,
                                "detail": f"Price {price} is {round(ratio*100)}% of face {face}."})
    except (TypeError, ValueError):
        pass

    if urgency:
        signals.append({"signal": "urgency_pressure", "weight": 12,
                        "detail": f"{len(urgency)} urgency cue(s): {', '.join(map(str, urgency[:3]))}"})

    violates = any(s["signal"].startswith("non_official_transfer")
                   or s["signal"].startswith("irreversible_payment") for s in signals)
    return {
        "violates_official_transfer": violates,
        "signals": signals,
        "rules_applied": [
            "Major-event tickets transfer via official app only.",
            "A PDF/screenshot/barcode-image 'ticket' is high risk (infinitely copyable).",
            "Irreversible payment rails (Zelle/CashApp/crypto/wire/gift card) remove recourse.",
            "Price far below face value is a classic bait signal.",
        ],
        "notes": ("Official-app transfer with a protected payment method (card / "
                  "PayPal Goods & Services) is the low-risk pathway."),
    }


# --------------------------------------------------------------------------- #
# Signal assembly — turns retrieval/reputation/forgery into scorer inputs
# --------------------------------------------------------------------------- #
def signals_from_retrieval(retrieval: dict) -> list[dict]:
    """Derive weighted signals from hybrid-retrieval neighbours (if configured)."""
    if retrieval.get("status") != "ok":
        return []
    results = retrieval.get("results", [])[:5]
    if not results:
        return []
    scam_like = [r for r in results if str(r.get("label", "")).lower() == "scam"]
    if not scam_like:
        return []
    top_patterns = sorted({r.get("pattern_type", "unknown") for r in scam_like})
    weight = 28 if len(scam_like) >= 3 else 16
    return [{"signal": "matches_known_scam_patterns", "weight": weight,
             "detail": f"{len(scam_like)}/{len(results)} nearest cases are labelled scam "
                       f"(patterns: {', '.join(top_patterns)})."}]


def signals_from_reputation(reputation: dict) -> list[dict]:
    out: list[dict] = []
    typo = reputation.get("typosquat") or {}
    if typo.get("is_typosquat"):
        out.append({"signal": "typosquat_domain", "weight": 30,
                    "detail": f"Domain '{typo.get('input')}' is edit-distance "
                              f"{typo.get('distance')} from official '{typo.get('nearest')}'."})
    prior = reputation.get("prior_reports") or {}
    if prior.get("status") == "ok" and prior.get("total", 0) > 0:
        out.append({"signal": "prior_reports_exist", "weight": 20,
                    "detail": f"{prior['total']} prior report(s) match this domain/handle."})
    return out


def signals_from_forgery(forgery: dict) -> list[dict]:
    if forgery.get("status") == "ok" and forgery.get("offered_to", 0) >= 1:
        n = forgery["offered_to"]
        return [{"signal": "duplicate_barcode", "weight": 35,
                 "detail": f"This barcode/ref was already offered to {n} buyer(s)."}]
    tamper = forgery.get("tamper_hints")
    if tamper:
        return [{"signal": "tamper_hints", "weight": 18,
                 "detail": f"Document/image tamper hints: {tamper}"}]
    return []
