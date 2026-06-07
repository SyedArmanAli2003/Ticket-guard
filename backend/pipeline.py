"""Orchestrates the TicketGuard investigation as a streamed 8-step pipeline.

The pipeline is the coordinator. It runs each step in turn, threads the
accumulating evidence, and streams SSE-ready events that reuse the skeleton's
shapes:

  • per-step result : {"step": n, "name": "...", "status": "running|complete|
                        not_configured|error", "data": {...}}
  • tool activity    : {"type": "tool", "step": n, "tool": "...", "source": "..."}
  • finalize         : {"step": 99, "name": "Saved", "status": "complete",
                        "data": {"verdict","confidence","investigation_id", ...}}

Steps 1 (Normalizer) and 7 (Verdict Writer) are Gemini LlmAgents run via ADK.
Steps 2–6 are deterministic, DB-grounded analysers (db.py / agent.py). Any step
that needs Atlas and finds it down emits status ``not_configured`` — NEVER
invented data.
"""

from __future__ import annotations

import asyncio
import json
import uuid

from google.adk.runners import InMemoryRunner
from google.genai import types

import config
import db
import ingest
import models_registry as registry
from observability import step_span, trace_investigation
from agent import (
    build_agents,
    build_verdict_agent,
    official_transfer_rules,
    signals_from_forgery,
    signals_from_reputation,
    signals_from_retrieval,
)

APP = "ticketguard"

_mcp = None
_initialized = False
_verdict_runners: dict[str, InMemoryRunner] = {}


def init_runner() -> None:
    """Build the MCP toolset + the default verdict runner once. Safe to call repeatedly."""
    global _mcp, _initialized
    if _initialized:
        return
    # build_agents() also wires the read-only MongoDB MCP toolset surfaced by
    # /api/health and /api/mcp/info. The verdict writer it returns is bound to the
    # default Gemini model; per-request models get their own runner lazily.
    _normalizer, _verdict_writer, _mcp = build_agents()
    _verdict_runners[registry.DEFAULT_MODEL] = InMemoryRunner(agent=_verdict_writer, app_name=APP)
    _initialized = True
    print(f"🛡️  TicketGuard ready — models={list(registry.MODELS)} "
          f"default={registry.DEFAULT_MODEL} backend={config.backend_label()} "
          f"mcp={'on' if _mcp else 'off'}")


def _verdict_runner(model_id: str) -> InMemoryRunner:
    """Lazily build (and cache) an ADK verdict runner bound to a given Gemini model."""
    runner = _verdict_runners.get(model_id)
    if runner is None:
        runner = InMemoryRunner(agent=build_verdict_agent(model_id), app_name=APP)
        _verdict_runners[model_id] = runner
    return runner


def _rebuild_runner(model_id: str) -> None:
    """Discard the cached verdict runner for model_id.

    Called right after config.rotate_api_key() rotates to a new key so that the
    next _verdict_runner(model_id) call constructs a fresh InMemoryRunner (and
    a fresh LlmAgent → fresh google-genai Client) that picks up the new key.
    """
    _verdict_runners.pop(model_id, None)


def mcp_enabled() -> bool:
    return _mcp is not None


# --------------------------------------------------------------------------- #
# Gemini helpers (ADK runner)
# --------------------------------------------------------------------------- #
def _is_transient(err: Exception) -> bool:
    s = str(err).upper().replace(" ", "")
    if "PERDAY" in s or "REQUESTSPERDAY" in s:
        return False
    return any(t in s for t in ("RESOURCE_EXHAUSTED", "429", "503", "UNAVAILABLE",
                                "500", "INTERNAL", "OVERLOADED", "DEADLINE"))


# Errors that mean THIS Gemini model is exhausted/unavailable → fail over to the
# next tier. A per-DAY quota is terminal for RETRYING the same model, but it is
# exactly when we WANT to switch to a model with its own quota bucket.
_FALLBACK_ERRORS = ("429", "RESOURCE_EXHAUSTED", "QUOTA", "PERDAY", "RATE",
                    "503", "UNAVAILABLE", "OVERLOADED", "404", "NOT_FOUND",
                    "NOT FOUND", "PERMISSION_DENIED")


def _model_unavailable(reason: str) -> bool:
    s = (reason or "").upper()
    return any(t in s for t in _FALLBACK_ERRORS)


async def _run_agent(runner: InMemoryRunner, step_no: int, message: str,
                     retries: int = 3) -> tuple[list[dict], str]:
    """Run one Gemini LlmAgent turn via ADK. Returns (tool_events, final_text)."""
    for attempt in range(retries):
        tools: list[dict] = []
        final_text = ""
        session = await runner.session_service.create_session(app_name=APP, user_id="web")
        msg = types.Content(role="user", parts=[types.Part(text=message)])
        try:
            async for ev in runner.run_async(user_id="web", session_id=session.id,
                                             new_message=msg):
                if ev.content and ev.content.parts:
                    for p in ev.content.parts:
                        fc = getattr(p, "function_call", None)
                        if fc:
                            tools.append({"type": "tool", "step": step_no, "tool": fc.name,
                                          "source": "mongodb"})
                if ev.is_final_response() and ev.content and ev.content.parts:
                    final_text = "".join(p.text or "" for p in ev.content.parts)
            return tools, final_text
        except Exception as err:  # noqa: BLE001
            if _is_transient(err) and attempt < retries - 1:
                await asyncio.sleep(5 * (attempt + 1))
                continue
            raise
    return [], ""


# --------------------------------------------------------------------------- #
# Verdict floor — if scorer/rules are DB-down, we still bound the verdict by the
# deterministic rule engine so we neither fabricate "legit" nor over-claim.
# --------------------------------------------------------------------------- #
def _heuristic_band(rule_out: dict, scorer: dict) -> str:
    if scorer.get("status") == "ok":
        return scorer.get("band", "LOW")
    return "HIGH" if rule_out.get("violates_official_transfer") else "LOW"


_BAND_TO_VERDICT = {"HIGH": "SCAM", "MEDIUM": "SUSPICIOUS", "LOW": "LIKELY-LEGIT"}
_BAND_CONF = {"HIGH": 0.78, "MEDIUM": 0.6, "LOW": 0.55}
_LISTING_IGNORE = {"raw", "raw_text", "text", "source", "notes", "summary", "description"}


def _listing_signal_count(listing: dict) -> int:
    """Count meaningful ticket fields the normalizer actually extracted. 0 means
    the input is NOT a ticket listing/message (e.g. 'hello') and must never get a
    confident LIKELY-LEGIT verdict."""
    if not isinstance(listing, dict):
        return 0
    n = 0
    for k, v in listing.items():
        if k in _LISTING_IGNORE:
            continue
        if v in (None, "", [], {}, "unknown", "none", "n/a", "N/A", "null"):
            continue
        n += 1
    return n


def _deterministic_verdict(evidence: dict, heuristic_band: str) -> dict:
    """LLM-free verdict from the deterministic rule engine + scorer signals. Used
    when every Gemini model is rate-limited/unavailable so the product DEGRADES
    gracefully (still returns a verdict) instead of erroring (HTTP 429 to users)."""
    band = heuristic_band if heuristic_band in _BAND_TO_VERDICT else "MEDIUM"
    bullets: list[str] = []
    for s in (evidence.get("signals") or []):
        if isinstance(s, dict):
            d = s.get("detail") or s.get("label") or s.get("reason")
            if d:
                bullets.append(str(d)[:300])
    if not bullets and (evidence.get("rules") or {}).get("violates_official_transfer"):
        bullets.append("Listing relies on a non-official transfer and/or irreversible payment.")
    return {
        "verdict": _BAND_TO_VERDICT[band],
        "confidence": _BAND_CONF.get(band, 0.6),
        "evidence": bullets[:8] or ["Scored by the deterministic risk engine from the detected signals."],
        "reasoning": ("AI reasoning was temporarily unavailable (high demand), so this verdict comes "
                      "from TicketGuard's deterministic risk engine over the detected signals. "
                      "Decision-support only - not a guarantee."),
        "model_used": "rule-engine",
        "is_fallback": True,
        "degraded": True,
    }


async def run_investigation(source: dict, model: str | None = None):
    """Async generator yielding SSE events for one full investigation.

    Thin wrapper that opens the parent Arize Phoenix "investigation" span, then
    delegates to the step generator. Every per-step span (and the auto-captured
    Gemini spans) nests under this one trace. No-ops when Phoenix is unconfigured.
    """
    trace_id = uuid.uuid4().hex[:12]
    idea = source.get("text") or source.get("url") or source.get("filename") or ""
    with trace_investigation(trace_id, idea):
        async for ev in _run_investigation_steps(source, model):
            yield ev


async def _run_investigation_steps(source: dict, model: str | None = None):
    """The 8-step investigation. Yields SSE events for one full run.

    ``source`` is the already-ingested payload:
      {"type": "text|pdf|image|url", "text"?: str, "file_b64"?: str,
       "filename"?: str, "content_type"?: str, "url"?: str}
    """
    init_runner()
    evidence: dict = {}

    # ----- Step 1: Normalizer (Gemini structured extraction) ----------------- #
    yield {"step": 1, "name": "Normalize Listing", "status": "running"}
    try:
        with step_span(1, "Normalizer"):
            listing_env = await _normalize(source, model)
    except Exception as exc:  # noqa: BLE001
        yield {"step": 1, "name": "Normalize Listing", "status": "error", "error": str(exc)[:200]}
        return
    if listing_env.get("status") == "not_configured":
        yield {"step": 1, "name": "Normalize Listing", "status": "not_configured",
               "data": {"reason": listing_env.get("reason")}}
        return
    if listing_env.get("status") != "ok":
        yield {"step": 1, "name": "Normalize Listing", "status": "error",
               "error": listing_env.get("reason", "normalize failed")}
        return
    listing = listing_env["listing"]
    extracted = listing_env.get("extracted", {})
    evidence["listing"] = listing
    evidence["ingest"] = {"source": listing_env.get("source"), "extracted": extracted}
    yield {"step": 1, "name": "Normalize Listing", "status": "complete",
           "data": {"listing": listing, "source": listing_env.get("source"),
                    "extracted": extracted,
                    "model_used": listing_env.get("model_used")}}

    # ----- Input-sufficiency guard ------------------------------------------- #
    # If the normalizer found NO ticket fields, the input is not a listing/offer
    # (e.g. "hello"). Never run a confident verdict on junk (was returning a
    # fabricated LIKELY-LEGIT @0.8); short-circuit honestly and save LLM quota.
    if _listing_signal_count(listing) == 0:
        guard = {
            "verdict": "SUSPICIOUS", "confidence": 0.2,
            "evidence": ["No ticket details detected - no price, payment method, event, seller or barcode."],
            "reasoning": ("This doesn't look like a ticket listing or seller message, so it can't be "
                          "assessed. Paste the actual offer - the listing text, a seller DM, a ticket "
                          "PDF/screenshot, or a resale link."),
            "model_used": "input-guard", "is_fallback": False, "insufficient": True,
        }
        evidence["verdict"] = guard
        yield {"step": 7, "name": "Verdict", "status": "complete", "data": guard}
        yield {"step": 99, "name": "Saved", "status": "complete",
               "data": {"verdict": guard["verdict"], "confidence": guard["confidence"],
                        "investigation_id": "no-db", "risk_score": None,
                        "engine": f"input-guard - {config.backend_label()}",
                        "is_fallback": False, "insufficient": True}}
        return

    # ----- Step 2: Hybrid Retrieval (Atlas vector + text, fused) ------------- #
    yield {"step": 2, "name": "Hybrid Retrieval", "status": "running"}
    query = _retrieval_query(listing)
    with step_span(2, "Hybrid Retrieval"):
        retrieval = await asyncio.to_thread(db.hybrid_search, query)
    yield {"type": "tool", "step": 2, "tool": "atlas_hybrid_search",
           "source": retrieval.get("fusion", "vector+text")}
    evidence["retrieval"] = retrieval
    if retrieval.get("status") == "ok":
        yield {"step": 2, "name": "Hybrid Retrieval", "status": "complete", "data": retrieval}
    else:
        yield {"step": 2, "name": "Hybrid Retrieval", "status": "not_configured",
               "data": {"reason": retrieval.get("reason")}}

    # ----- Step 3: Reputation (typosquat compute + prior reports DB) --------- #
    yield {"step": 3, "name": "Reputation Check", "status": "running"}
    with step_span(3, "Reputation"):
        reputation = await asyncio.to_thread(db.reputation_check,
                                             listing.get("domain", ""), listing.get("seller_handle") or "")
    yield {"type": "tool", "step": 3, "tool": "reports_aggregate", "source": "mongodb"}
    evidence["reputation"] = reputation
    rep_status = "complete" if reputation["prior_reports"].get("status") == "ok" else "not_configured"
    yield {"step": 3, "name": "Reputation Check", "status": rep_status, "data": reputation}

    # ----- Step 4: Forgery / Duplicate (hash lookup + doc/image hints) ------- #
    yield {"step": 4, "name": "Forgery & Duplicate", "status": "running"}
    with step_span(4, "Forgery Duplicate"):
        forgery = await asyncio.to_thread(db.duplicate_check, listing.get("barcode_or_ref") or "")
    if extracted.get("tamper_hints"):
        forgery["tamper_hints"] = extracted["tamper_hints"]
    if extracted.get("pdf_metadata"):
        forgery["pdf_metadata"] = extracted["pdf_metadata"]
    if listing.get("barcode_or_ref"):
        yield {"type": "tool", "step": 4, "tool": "tickets_seen_lookup", "source": "mongodb"}
    evidence["forgery"] = forgery
    forge_status = ("not_configured" if forgery.get("status") == "not_configured"
                    else "complete")
    yield {"step": 4, "name": "Forgery & Duplicate", "status": forge_status, "data": forgery}

    # ----- Assemble signals for the scorer ----------------------------------- #
    rule_out = official_transfer_rules(listing)
    signals: list[dict] = list(rule_out["signals"])
    signals += signals_from_retrieval(retrieval)
    signals += signals_from_reputation(reputation)
    signals += signals_from_forgery(forgery)
    evidence["signals"] = signals

    # ----- Step 5: Risk Scorer (server-side $group/$facet) ------------------- #
    yield {"step": 5, "name": "Risk Scorer", "status": "running"}
    with step_span(5, "Risk Scorer"):
        scorer = await asyncio.to_thread(db.score_signals, signals)
    yield {"type": "tool", "step": 5, "tool": "risk_score_aggregation", "source": "mongodb"}
    evidence["scorer"] = scorer
    score_status = "complete" if scorer.get("status") == "ok" else "not_configured"
    yield {"step": 5, "name": "Risk Scorer", "status": score_status,
           "data": {**scorer, "signals": signals}}

    # ----- Step 6: Official-transfer rule check (deterministic) -------------- #
    yield {"step": 6, "name": "Official-Transfer Rules", "status": "running"}
    with step_span(6, "Transfer Rules") as _rule_span:
        _rule_span.set_attribute(
            "rules.violates_official_transfer",
            bool(rule_out.get("violates_official_transfer")))
    evidence["rules"] = rule_out
    yield {"step": 6, "name": "Official-Transfer Rules", "status": "complete", "data": rule_out}

    # ----- Step 7: Verdict Writer (Gemini, grounded ONLY in evidence) -------- #
    yield {"step": 7, "name": "Verdict", "status": "running"}
    try:
        with step_span(7, "Verdict"):
            verdict = await _write_verdict(evidence, _heuristic_band(rule_out, scorer), model)
    except Exception as exc:  # noqa: BLE001
        yield {"step": 7, "name": "Verdict", "status": "error", "error": str(exc)[:200]}
        return
    evidence["verdict"] = verdict
    yield {"step": 7, "name": "Verdict", "status": "complete", "data": verdict}

    # ----- Step 8: Persist investigation ------------------------------------- #
    yield {"step": 8, "name": "Persist", "status": "running"}
    used_model = verdict.get("model_used") or (model or registry.DEFAULT_MODEL)
    inv_doc = {
        "listing": listing,
        "source": listing_env.get("source"),
        "retrieval": _trim_retrieval(retrieval),
        "reputation": reputation,
        "forgery": forgery,
        "signals": signals,
        "scorer": scorer,
        "rules": rule_out,
        "verdict": verdict,
        "model_used": used_model,
        "is_fallback": verdict.get("is_fallback", False),
        "engine": f"{used_model} - {config.backend_label()}",
    }
    with step_span(8, "Persist") as _persist_span:
        inv_id = await asyncio.to_thread(db.save_investigation, inv_doc)
        _persist_span.set_attribute("investigation.db_id", inv_id)
    persist_status = "complete" if inv_id != "no-db" else "not_configured"
    yield {"step": 8, "name": "Persist",
           "status": persist_status,
           "data": {"investigation_id": inv_id,
                    "reason": None if inv_id != "no-db" else "atlas_unreachable"}}

    # ----- Finalize (step 99) ------------------------------------------------ #
    yield {"step": 99, "name": "Saved", "status": "complete",
           "data": {"verdict": verdict.get("verdict"),
                    "confidence": verdict.get("confidence"),
                    "investigation_id": inv_id,
                    "risk_score": scorer.get("score") if scorer.get("status") == "ok" else None,
                    "model_used": used_model,
                    "is_fallback": verdict.get("is_fallback", False),
                    "degraded": verdict.get("degraded", False),
                    "engine": f"{used_model} - {config.backend_label()}"}}


# --------------------------------------------------------------------------- #
# Sync convenience: run the whole pipeline and return the final verdict bundle
# (used by POST /api/check). Collects the stream, returns the assembled result.
# --------------------------------------------------------------------------- #
async def investigate_sync(source: dict, model: str | None = None) -> dict:
    """Run the pipeline to completion and return a single JSON verdict bundle."""
    steps: list[dict] = []
    final: dict = {}
    listing: dict = {}
    verdict: dict = {}
    scorer: dict = {}
    async for ev in run_investigation(source, model):
        if ev.get("type") == "tool":
            continue
        step = ev.get("step")
        if step == 1 and ev.get("status") == "complete":
            listing = ev["data"].get("listing", {})
        if step == 5 and ev.get("data"):
            scorer = ev["data"]
        if step == 7 and ev.get("status") == "complete":
            verdict = ev["data"]
        if step == 99:
            final = ev.get("data", {})
        if step != 99:
            steps.append({"step": step, "name": ev.get("name"),
                          "status": ev.get("status")})
        if ev.get("status") in ("error", "not_configured") and step in (1, 7):
            # Hard-stop conditions (no listing or no verdict).
            return {"status": ev.get("status"),
                    "reason": (ev.get("error") or (ev.get("data") or {}).get("reason")),
                    "step": step}
    return {
        "status": "ok",
        "listing": listing,
        "verdict": verdict.get("verdict"),
        "confidence": verdict.get("confidence"),
        "evidence": verdict.get("evidence", []),
        "reasoning": verdict.get("reasoning", ""),
        "risk_score": final.get("risk_score"),
        "investigation_id": final.get("investigation_id"),
        "model_used": final.get("model_used") or verdict.get("model_used"),
        "is_fallback": final.get("is_fallback", verdict.get("is_fallback", False)),
        "degraded": final.get("degraded", verdict.get("degraded", False)),
        "steps": steps,
        "engine": final.get("engine"),
    }


# --------------------------------------------------------------------------- #
# Internals
# --------------------------------------------------------------------------- #
async def _normalize(source: dict, model: str | None = None) -> dict:
    """Normalize the source, failing over to the next Gemini tier if the chosen
    model is rate-limited/unavailable (so a step-1 quota error doesn't kill the run).

    Before moving to the next model tier, exhausts all available API keys for the
    current model: on a 429 it rotates the key, resets the ingest client, and
    retries the same model so a fresh quota bucket is tried first.
    """
    chain = registry.fallback_chain(model)
    last = {"status": "error", "reason": "no model attempted"}
    for mid in chain:
        # Key-rotation retry: try every available key before giving up on this model.
        while True:
            env = await _normalize_once(source, mid)
            if env.get("status") == "ok":
                env["model_used"] = mid
                return env
            last = env
            reason = env.get("reason", "")
            # A genuine parse/IO error or a missing-key config error should not
            # trigger rotation — only quota / rate-limit signals should.
            if env.get("status") == "not_configured" or not _model_unavailable(reason):
                break  # non-quota error: skip key rotation, try next model tier
            # 429 / RESOURCE_EXHAUSTED — try the next API key before giving up.
            if config.rotate_api_key():
                ingest.reset_client()  # force a new genai.Client with the new key
                continue
            break  # all keys exhausted for this model tier → fall to next tier
        last.setdefault("model_used", mid)
    return last


async def _normalize_once(source: dict, model: str) -> dict:
    """Dispatch ingestion by source type on a specific model (blocking IO in a thread)."""
    stype = (source.get("type") or "text").lower()
    if stype == "text":
        return await asyncio.to_thread(ingest.normalize_text, source.get("text", ""), None, "text", model)
    if stype == "url":
        return await asyncio.to_thread(ingest.normalize_url, source.get("url", ""), model)
    if stype in ("pdf", "image", "file"):
        b64 = source.get("file_b64", "")
        if not b64:
            return {"status": "error", "reason": "no file_b64 provided"}
        data = ingest.b64_to_bytes(b64)
        return await asyncio.to_thread(ingest.decode_file, data,
                                       source.get("filename", ""), source.get("content_type"), model)
    return {"status": "error", "reason": f"unknown source type: {stype}"}


def _retrieval_query(listing: dict) -> str:
    """Build a focused natural-language query for hybrid retrieval."""
    parts = [
        listing.get("event") or "",
        f"pay via {listing.get('payment_method')}" if listing.get("payment_method") else "",
        f"transfer {listing.get('transfer_method')}" if listing.get("transfer_method") else "",
        " ".join(listing.get("urgency_cues") or []),
        listing.get("domain") or "",
    ]
    q = " ".join(p for p in parts if p).strip()
    return q or "ticket resale listing"


def _trim_retrieval(retrieval: dict) -> dict:
    """Store a compact retrieval summary in the investigation doc."""
    if retrieval.get("status") != "ok":
        return retrieval
    return {"status": "ok", "fusion": retrieval.get("fusion"),
            "count": retrieval.get("count"),
            "results": [{k: r.get(k) for k in
                         ("label", "risk", "pattern_type", "fused_score", "contribution")}
                        for r in retrieval.get("results", [])[:5]]}


async def _write_verdict(evidence: dict, heuristic_band: str,
                         model: str | None = None) -> dict:
    """Run the Gemini Verdict Writer over the gathered evidence.

    Tries the requested model, then fails over to the next Gemini tier if the
    model is rate-limited/unavailable. Records which model produced the verdict
    in ``model_used`` / ``is_fallback``.
    """
    payload = {
        "listing": evidence.get("listing"),
        "retrieval": _trim_retrieval(evidence.get("retrieval", {})),
        "reputation": evidence.get("reputation"),
        "forgery": {k: v for k, v in (evidence.get("forgery") or {}).items() if k != "buyers"},
        "risk_score": evidence.get("scorer"),
        "rule_check": {"violates_official_transfer":
                       (evidence.get("rules") or {}).get("violates_official_transfer"),
                       "signals": (evidence.get("rules") or {}).get("signals")},
        "deterministic_band_hint": heuristic_band,
    }
    message = (
        "Investigate this ticket-resale listing for scam risk using ONLY the evidence below. "
        "Remember: verdict is exactly SCAM, SUSPICIOUS, or LIKELY-LEGIT; never say authentic/genuine. "
        "If signals are not_configured, lower confidence accordingly.\n\nEVIDENCE:\n"
        + json.dumps(payload, default=str)[:6000]
        + "\n\nReturn the verdict JSON now."
    )

    last_exc: Exception | None = None
    import logging
    for mid in registry.fallback_chain(model):
        # Key-rotation retry: try every available key before giving up on this model tier.
        while True:
            runner = _verdict_runner(mid)
            try:
                _tools, text = await _run_agent(runner, 7, message)
                parsed = ingest.parse_json(text)
                if parsed is None:
                    # One retry with a blunt instruction (same model, same key).
                    _tools, text = await _run_agent(runner, 7, message + "\n\nReturn ONLY the JSON object.")
                    parsed = ingest.parse_json(text)
                if parsed is None:
                    raise ValueError("verdict writer did not return valid JSON")
                out = _sanitize_verdict(parsed, heuristic_band)
                out["model_used"] = mid
                is_fallback = mid != (model or registry.DEFAULT_MODEL)
                out["is_fallback"] = is_fallback
                if is_fallback:
                    logging.warning("Degradation: core model unavailable, used fallback tier: %s", mid)
                return out
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                # A genuine parse / validation failure should surface immediately.
                if not _model_unavailable(str(exc)):
                    raise
                # 429 / quota: try the next API key before moving to the next model tier.
                if config.rotate_api_key():
                    _rebuild_runner(mid)  # fresh ADK runner picks up the new key
                    continue
                break  # all keys exhausted for this model → fall to next model tier
    # Every Gemini tier was rate-limited/unavailable on every available key →
    # DEGRADE to the deterministic rule engine (not a raw 429 to the user).
    return _deterministic_verdict(evidence, heuristic_band)


_ALLOWED_VERDICTS = {"SCAM", "SUSPICIOUS", "LIKELY-LEGIT"}


def _sanitize_verdict(v: dict, heuristic_band: str) -> dict:
    """Enforce the verdict vocabulary + bound confidence. No 'authentic' language."""
    label = str(v.get("verdict", "")).upper().replace("_", "-").strip()
    if label not in _ALLOWED_VERDICTS:
        # Map any stray wording back into the controlled vocabulary.
        if "SCAM" in label or "FRAUD" in label:
            label = "SCAM"
        elif "LEGIT" in label or "LOW" in label:
            label = "LIKELY-LEGIT"
        else:
            label = "SUSPICIOUS"
    try:
        conf = float(v.get("confidence", 0.5))
    except (TypeError, ValueError):
        conf = 0.5
    conf = max(0.0, min(1.0, conf))
    evidence = v.get("evidence") or []
    if not isinstance(evidence, list):
        evidence = [str(evidence)]
    return {"verdict": label, "confidence": round(conf, 2),
            "evidence": [str(e)[:300] for e in evidence][:8],
            "reasoning": str(v.get("reasoning", ""))[:1200]}
