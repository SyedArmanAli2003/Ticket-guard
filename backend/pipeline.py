"""Orchestrates the PitchCraft specialist-agent team into one business plan.

The pipeline is the coordinator: it runs each specialist Gemini agent in turn,
threads the accumulating plan as shared context, streams each agent's tool
activity + JSON section, then runs a QA critic over the finished plan.
"""

from __future__ import annotations

import asyncio
import json
import re
import secrets

from google.adk.runners import InMemoryRunner
from google.genai import types

import config
import db
from agent import build_team

APP = "pitchcraft"

_runners: dict[str, InMemoryRunner] = {}
_team: list[dict] = []
_mcp = None


def init_runner() -> None:
    global _team, _mcp, _runners
    if _runners:
        return
    _team, _mcp = build_team()
    _runners = {s["key"]: InMemoryRunner(agent=s["agent"], app_name=APP) for s in _team}
    names = " → ".join(s["name"] for s in _team)
    print(f"🤖 Agent team ready ({len(_team)} agents): {names}")
    print(f"   model={config.GEMINI_MODEL} backend={config.backend_label()} "
          f"mcp={'on' if _mcp else 'off'}")


def mcp_enabled() -> bool:
    return _mcp is not None


# --------------------------------------------------------------------------- #
def _parse_json(text: str) -> dict | None:
    if not text:
        return None
    clean = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(clean)
    except Exception:  # noqa: BLE001
        pass
    m = re.search(r"\{.*\}", clean, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:  # noqa: BLE001
            return None
    return None


def _is_transient(err: Exception) -> bool:
    s = str(err).upper()
    if "PERDAY" in s.replace(" ", "") or "REQUESTSPERDAY" in s.replace(" ", ""):
        return False
    return any(t in s for t in
               ("RESOURCE_EXHAUSTED", "429", "503", "UNAVAILABLE", "500",
                "INTERNAL", "OVERLOADED", "DEADLINE"))


def _is_tool_error(err: Exception) -> bool:
    return "not found" in str(err).lower() and "tool" in str(err).lower()


def _tool_source(name: str) -> str:
    return "vector" if name in ("search_market_intelligence", "find_similar_plans") else "mongodb"


async def _run_agent(key: str, step_no: int, message: str,
                     retries: int = 4) -> tuple[list[dict], str]:
    """Run one specialist agent's turn. Returns (tool_events, final_text)."""
    runner = _runners[key]
    base = message
    text = base
    for attempt in range(retries):
        tools: list[dict] = []
        final_text = ""
        session = await runner.session_service.create_session(app_name=APP, user_id="web")
        msg = types.Content(role="user", parts=[types.Part(text=text)])
        try:
            async for ev in runner.run_async(user_id="web", session_id=session.id, new_message=msg):
                if ev.content and ev.content.parts:
                    for p in ev.content.parts:
                        fc = getattr(p, "function_call", None)
                        if fc:
                            args = dict(fc.args) if fc.args else {}
                            preview = (args.get("query") or args.get("industry")
                                       or args.get("filter") or args.get("collection") or "")
                            tools.append({"type": "tool", "step": step_no, "tool": fc.name,
                                          "source": _tool_source(fc.name),
                                          "args_preview": str(preview)[:80]})
                if ev.is_final_response() and ev.content and ev.content.parts:
                    final_text = "".join(p.text or "" for p in ev.content.parts)
            return tools, final_text
        except Exception as err:  # noqa: BLE001
            if _is_transient(err) and attempt < retries - 1:
                await asyncio.sleep(6 * (attempt + 1))
                continue
            if _is_tool_error(err) and attempt < retries - 1:
                text = base + "\n\nDo NOT call any tools. Answer directly with the JSON."
                continue
            raise
    return [], ""


def _context(results: dict) -> str:
    """Compact shared context handed to each downstream specialist."""
    keep = {
        "idea": results.get("idea"),
        "target_market": (results.get("validation") or {}).get("target_market"),
        "summary": (results.get("validation") or {}).get("one_line_summary"),
        "market_size": (results.get("market_research") or {}).get("market_size"),
        "revenue_model": (results.get("business_plan") or {}).get("revenue_model"),
    }
    return json.dumps({k: v for k, v in keep.items() if v})


async def run_pitchcraft(idea: str, plan_id: str):
    """Async generator yielding SSE-ready events for the whole multi-agent run."""
    init_runner()
    db.update_plan(plan_id, "status", "generating")
    db.update_plan(plan_id, "engine",
                   f"{config.GEMINI_MODEL} · {config.backend_label()} · "
                   f"{len(_team)}-agent team · MongoDB MCP {'on' if mcp_enabled() else 'off'}")

    results: dict = {"idea": idea}

    for spec in _team:
        key, step_no, label = spec["key"], spec["step"], spec["label"]
        try:
            if key == "qa_review":
                message = (f'Full assembled business plan (JSON):\n'
                           f'{json.dumps({k: v for k, v in results.items() if k != "idea"})[:4000]}\n\n'
                           f'Idea: "{idea}". Review it now.')
            else:
                message = (f'Startup idea: "{idea}"\nShared context so far: '
                           f'{_context(results)}\n\nProduce your section now.')

            tools, final_text = await _run_agent(key, step_no, message)
            for t in tools:
                yield t
            data = _parse_json(final_text)
            if data is None:
                tools, final_text = await _run_agent(
                    key, step_no, message + "\n\nReturn ONLY the JSON object.")
                for t in tools:
                    yield t
                data = _parse_json(final_text)
            if data is None:
                raise ValueError("agent did not return valid JSON")

            store = data.get("personas", data) if key == "personas" else data
            results[key] = store
            db.update_plan(plan_id, key, store)
            yield {"step": step_no, "name": label, "status": "complete", "data": data}

        except Exception as e:  # noqa: BLE001
            db.update_plan(plan_id, "status", "failed")
            yield {"step": step_no, "name": label, "status": "error", "error": str(e)[:200]}
            return

    token = secrets.token_urlsafe(6)
    db.update_plan(plan_id, "share_token", token)
    db.update_plan(plan_id, "status", "complete")
    yield {"step": 99, "name": "Saved", "status": "complete",
           "data": {"share_token": token, "plan_id": plan_id,
                    "engine": f"{config.GEMINI_MODEL} · {config.backend_label()} · {len(_team)} agents"}}
