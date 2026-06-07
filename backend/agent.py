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
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
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

def ban_scammer_from_community(seller_handle: str, reason: str, platform: str = "unknown") -> str:
    """Send an automated ban-enacted notification to the TicketGuard moderation channel.

    Fires a Discord webhook so moderators are instantly notified of a confirmed
    SCAM verdict. Include the seller handle, the platform where the listing appeared,
    and the one-sentence reason that triggered the SCAM verdict.

    Args:
        seller_handle: The @handle, username, or identifier of the confirmed scammer.
        reason: One sentence citing the strongest scam signal(s) from the evidence.
        platform: Where the listing was found, e.g. "Facebook Marketplace", "Twitter/X",
                  "Craigslist". Use "unknown" when the source is not determinable.

    Returns:
        A short outcome string: "alert_sent: …", "alert_failed: …", or "not_configured: …".
    """
    handle = (seller_handle or "").strip()
    if not handle or handle.lower() in ("unknown", "null", "none"):
        return "alert_skipped: no seller handle available — moderation alert not sent."

    webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return (
            "not_configured: DISCORD_WEBHOOK_URL env var is not set. "
            "The SCAM verdict stands, but the Discord alert was not dispatched."
        )

    payload = {
        "embeds": [
            {
                "title": "🚨 TICKETGUARD BAN ENACTED 🚨",
                "color": 0xFF0000,
                "fields": [
                    {
                        "name": "Seller Handle",
                        "value": handle[:256],
                        "inline": True,
                    },
                    {
                        "name": "Platform",
                        "value": str(platform or "unknown")[:256],
                        "inline": True,
                    },
                    {
                        "name": "Reason (AI-generated — review before acting)",
                        "value": str(reason or "SCAM verdict from TicketGuard investigation.")[:1024],
                        "inline": False,
                    },
                ],
                "footer": {
                    "text": (
                        "TicketGuard AI — Automated Scam Detection  ·  "
                        "Decision-support only, not a legal determination"
                    )
                },
            }
        ]
    }

    try:
        resp = httpx.post(webhook_url, json=payload, timeout=10.0)
        resp.raise_for_status()
        return (
            f"alert_sent: Moderation channel notified about {handle} "
            f"on {platform or 'unknown'}. HTTP {resp.status_code}."
        )
    except Exception as exc:  # noqa: BLE001
        return f"alert_failed: {str(exc)[:200]} — SCAM verdict still stands."


def email_trust_and_safety_report(seller_handle: str, evidence_summary: str) -> str:
    """Draft and send a formal threat-intel report to the Trust & Safety team inbox.

    Composes a structured threat-intelligence email and delivers it via SMTP.
    Call this when a SCAM verdict is issued so the T&S team can review and act.

    Args:
        seller_handle: The @handle, username, or identifier of the confirmed scammer.
        evidence_summary: 3-5 sentence synthesis of the key scam signals found during
                          this investigation. Write it as a formal brief — cite the
                          specific signals (payment method, transfer method, risk score,
                          retrieval matches, reputation flags) rather than generic claims.

    Returns:
        "email_sent: …", "not_configured: …", or "email_failed: …".
    """
    import datetime

    handle = (seller_handle or "").strip()
    summary = (evidence_summary or "").strip()
    if not handle or handle.lower() in ("unknown", "null", "none"):
        return "email_skipped: no seller handle available — T&S report not sent."

    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    to_addr = os.getenv("TRUST_SAFETY_EMAIL", "trust@ticketguard.ai").strip()

    if not smtp_host or not smtp_user or not smtp_password:
        return (
            "not_configured: SMTP_HOST, SMTP_USER, and SMTP_PASSWORD must be set. "
            "The SCAM verdict stands, but the T&S email was not sent."
        )

    timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    subject = f"[TicketGuard] Threat Intel Report — Confirmed Scammer: {handle}"
    body = f"""\
TicketGuard Automated Threat Intelligence Report
================================================
Generated : {timestamp}
Classification : SCAM — High Confidence
Subject    : {handle}

EVIDENCE SUMMARY
----------------
{summary or "No summary provided."}

RECOMMENDED ACTION
------------------
Review the full investigation in the TicketGuard dashboard and consider:
  • Removing active listings associated with this handle
  • Flagging the handle for cross-platform lookup
  • Notifying affected buyers if contact details are available

DISCLAIMER
----------
This report was generated autonomously by the TicketGuard AI investigation pipeline.
All findings are signal-based risk assessments — decision-support only, not a legal
determination. A human reviewer should confirm findings before taking enforcement action.

TicketGuard · Automated Scam Detection System
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_addr
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [to_addr], msg.as_string())
        return f"email_sent: T&S report for {handle} delivered to {to_addr}."
    except Exception as exc:  # noqa: BLE001
        return f"email_failed: {str(exc)[:200]} — SCAM verdict still stands."


def _search_tavily(query: str, handle: str, api_key: str) -> str:
    try:
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={"api_key": api_key, "query": query, "search_depth": "basic",
                  "max_results": 3, "include_answer": False},
            timeout=15.0,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return f"search_ok: No web reports found for '{handle}' — no external red flags."
        return _format_search_results(results, handle, "title", "content", "url")
    except Exception as exc:  # noqa: BLE001
        return f"search_failed: Tavily error — {str(exc)[:160]}"


def _search_brave(query: str, handle: str, api_key: str) -> str:
    try:
        resp = httpx.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": 3},
            headers={"Accept": "application/json", "X-Subscription-Token": api_key},
            timeout=15.0,
        )
        resp.raise_for_status()
        results = (resp.json().get("web") or {}).get("results", [])
        if not results:
            return f"search_ok: No web reports found for '{handle}' — no external red flags."
        return _format_search_results(results, handle, "title", "description", "url")
    except Exception as exc:  # noqa: BLE001
        return f"search_failed: Brave Search error — {str(exc)[:160]}"


def _format_search_results(results: list, handle: str,
                            title_key: str, snippet_key: str, url_key: str) -> str:
    lines = [f"Web search results for '{handle}' (scam/fraud query):"]
    for i, r in enumerate(results[:3], 1):
        title = str(r.get(title_key, ""))[:80]
        snippet = str(r.get(snippet_key, ""))[:200]
        url = str(r.get(url_key, ""))[:120]
        lines.append(f"\n[{i}] {title}\n    URL: {url}\n    {snippet}")
    return "\n".join(lines)


def search_scammer_forums(seller_handle: str, email_or_phone: str = "") -> str:
    """Search the open internet for scam reports about a seller handle or contact info.

    Performs a live web search targeting Reddit, Twitter/X, Trustpilot, and scam-
    reporting forums. Use this when you have a specific seller handle OR when signals
    are mixed — external community reports can confirm known bad actors before you
    finalise your verdict.

    Args:
        seller_handle: The @handle, username, or display name of the seller.
        email_or_phone: Optional email or phone number found in the listing.

    Returns:
        A plain-text summary of the top 3 search results, or "not_configured: …" /
        "search_failed: …" / "search_skipped: …" when the search cannot run.
    """
    handle = (seller_handle or "").strip()
    contact = (email_or_phone or "").strip()
    if not handle or handle.lower() in ("unknown", "null", "none"):
        return "search_skipped: no seller handle provided — skipping web search."

    query_parts = [f'"{handle}"', "scam", "fraud", "ticket"]
    if contact:
        query_parts.insert(1, f'"{contact}"')
    query = " ".join(query_parts)

    tavily_key = os.getenv("TAVILY_API_KEY", "").strip()
    brave_key = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()

    if not tavily_key and not brave_key:
        return (
            "not_configured: Neither TAVILY_API_KEY nor BRAVE_SEARCH_API_KEY is set. "
            "The investigation will rely only on in-corpus evidence."
        )

    if tavily_key:
        return _search_tavily(query, handle, tavily_key)
    return _search_brave(query, handle, brave_key)


VERDICT_INSTRUCTION = """You are TicketGuard's Verdict Writer — the final agent in an 8-step ticket-resale
scam-risk investigation pipeline.

You receive structured evidence already gathered by earlier steps:
- Hybrid search hits from the MongoDB scam corpus (Vector Search + Atlas Search)
- Seller/domain reputation (typosquat edit-distance + prior reports)
- Forgery / duplicate-barcode findings
- A risk score computed by a MongoDB $group/$facet aggregation (NOT by you)
- The official-transfer rule-engine result

Your job: synthesize ONLY this provided evidence into a final verdict for THIS listing.

RULES (never break these):
1. Never say "authentic", "genuine", or "real" — you cannot verify a ticket is real,
   only assess risk signals.
2. Never invent numbers — the risk score came from MongoDB; cite it, never change it.
3. If signals conflict, are weak, or are marked not_configured, say so, lower your
   confidence, and do not guess ("insufficient evidence" is a valid stance).
4. Ground every evidence bullet in a specific signal that was actually found.
5. The verdict label MUST be EXACTLY one of: SCAM | SUSPICIOUS | LIKELY-LEGIT.
6. RESEARCH — BEFORE finalising your verdict, you MUST call search_scammer_forums
   when EITHER of the following is true:
     • The listing has a seller_handle (not null / unknown)
     • Signals are mixed or weak and you are uncertain about the verdict
   Pass: seller_handle (from the evidence), email_or_phone (any email or phone found
   in the listing, or "" if none).
   Incorporate any findings from the search results into your evidence bullets and
   reasoning. If the tool returns "not_configured: …", "search_failed: …", or
   "search_skipped: …", note it briefly in reasoning and continue — do NOT block your
   verdict on this tool.
7. BAN ACTION — you MUST call ban_scammer_from_community BEFORE returning your JSON
   when ALL of the following are true:
     • Your verdict is SCAM
     • Your confidence is ≥ 0.75
     • The listing has a seller_handle (not null / unknown)
   Pass: seller_handle (from the evidence), reason (one sentence citing the strongest
   scam signal), platform (infer from domain/context, or "unknown").
   If verdict is SUSPICIOUS or LIKELY-LEGIT, or confidence < 0.75, do NOT call the tool.
8. EMAIL REPORT — after the ban notification (rule 7), you MUST also call
   email_trust_and_safety_report BEFORE returning your JSON, under the same conditions:
     • Your verdict is SCAM AND confidence ≥ 0.75 AND seller_handle is known
   Pass:
     seller_handle — same handle used in rule 7
     evidence_summary — synthesize your findings into 3-5 sentences as a formal brief:
       cite the specific signals found (payment method, transfer method, risk score,
       retrieval pattern matches, reputation flags, and any web-search findings from
       rule 6). Write it as an analyst would — factual, source-cited, no hedging beyond
       what the evidence warrants.
   Rules 7 and 8 are independent; call both, regardless of whether one fails.

VERDICT QUALITY GUIDANCE (risk signals to weigh, when present in the evidence):
- Irreversible-payment-only (Zelle / CashApp / Venmo friends-and-family / crypto /
  wire / gift card) = strong HIGH-risk signal.
- Not transferable via the official ticket transfer/app — offered as PDF, screenshot,
  or barcode image instead = strong SCAM signal (infinitely copyable).
- Price well below face value (roughly 40% or more under face) = HIGH-risk signal.
- "Pay first, PDF/screenshot/barcode sent after payment" = strong SCAM signal.
- Urgency / pressure language ("buy now", "tonight only", "price firm") = risk signal.
- Official-app transfer together with a protected rail (card / PayPal Goods &
  Services) = the low-risk pathway; lean LIKELY-LEGIT when the risk signals are absent.

Output ONLY one JSON object, with EXACTLY these keys and nothing else — no markdown, no code fences, no prose outside the JSON:
{"verdict": "SCAM|SUSPICIOUS|LIKELY-LEGIT", "confidence": <0.0-1.0>, "evidence": ["short factual bullet referencing a real signal — note which step found it", "..."], "reasoning": "2-4 plain-English sentences grounded ONLY in the evidence above"}"""


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
        tools=[search_scammer_forums, ban_scammer_from_community, email_trust_and_safety_report],
    )
    return normalizer, verdict_writer, mcp


def build_verdict_agent(model_id: str | None = None) -> LlmAgent:
    """Build a Verdict-Writer LlmAgent bound to a specific Gemini model.

    The pipeline uses this to run the verdict on a per-request model (with
    fallback across the Gemini tiers in models_registry). The agent reasons
    only over evidence the pipeline already gathered, and may call
    ban_scammer_from_community to alert moderators on a high-confidence SCAM verdict.
    """
    return LlmAgent(
        model=model_id or config.GEMINI_MODEL,
        name="verdict_writer",
        instruction=VERDICT_INSTRUCTION,
        tools=[search_scammer_forums, ban_scammer_from_community, email_trust_and_safety_report],
    )


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

    violates = any(s["signal"].startswith("non_official_transfer") for s in signals)
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
