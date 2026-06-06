"""TicketGuard FastAPI app.

TicketGuard is a multi-agent ticket-resale SCAM-RISK investigator built on
Google ADK + Gemini (gemini-2.5-flash via google-genai) and grounded in MongoDB
Atlas (Vector Search + Atlas Search), with the official MongoDB MCP server
exposed read-only to the agents. Every DB-dependent step degrades to an explicit
``not_configured`` status — NEVER fabricated data.

Endpoints
  POST /api/investigate  — SSE stream of the multi-step investigation
  POST /api/check        — synchronous JSON verdict (for embedding / API use)
  POST /api/report       — write a user scam report (explicit pymongo path)
  GET  /api/feed         — SSE live change-stream over reports (PyMongo async)
  GET  /api/health       — live booleans + cluster version + rankfusion capability
  GET  /api/mcp/info     — honest description of the MongoDB MCP integration
  GET  /health           — minimal liveness probe
"""

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console emoji safety

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import chat
import config
import db
import pipeline
from models import InvestigateRequest, ReportRequest, ChatRequest

# SSE headers: disable proxy buffering so events flush immediately.
_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    pipeline.init_runner()
    yield


app = FastAPI(title="TicketGuard Agent API", lifespan=lifespan)

_origins = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sse(event: dict) -> str:
    """Serialize one event as a Server-Sent Events frame."""
    return f"data: {json.dumps(event, default=str)}\n\n"


# --------------------------------------------------------------------------- #
# POST /api/investigate — streamed multi-step investigation (SSE)
# --------------------------------------------------------------------------- #
@app.post("/api/investigate")
async def investigate(req: InvestigateRequest):
    """Run the full investigation, streaming each step as SSE.

    Event shapes (all `data: <json>\\n\\n`):
      • per-step    : {"step": n, "name": str, "status": "running|complete|
                       not_configured|error", "data"?: {...}, "error"?: str}
      • tool event  : {"type": "tool", "step": n, "tool": str, "source": str}
      • finalize    : {"step": 99, "name": "Saved", "status": "complete",
                       "data": {"verdict","confidence","investigation_id",
                                "risk_score","engine"}}
    """
    source = req.to_source()

    async def stream():
        try:
            async for ev in pipeline.run_investigation(source):
                yield _sse(ev)
        except Exception as exc:  # noqa: BLE001 - never break the stream mid-flight
            yield _sse({"step": 99, "name": "Error", "status": "error",
                        "error": str(exc)[:300]})

    return StreamingResponse(stream(), media_type="text/event-stream", headers=_SSE_HEADERS)


# --------------------------------------------------------------------------- #
# POST /api/check — synchronous JSON verdict (for embedding widgets / API)
# --------------------------------------------------------------------------- #
@app.post("/api/check")
async def check(req: InvestigateRequest):
    """Run the pipeline to completion and return a single verdict bundle.

    Response (200):
      {"status":"ok","verdict":"SCAM|SUSPICIOUS|LIKELY-LEGIT","confidence":0-1,
       "evidence":[...],"reasoning":str,"risk_score":int|null,"listing":{...},
       "investigation_id":str,"steps":[{step,name,status}],"engine":str}
    On a hard stop (no Gemini key, or verdict failed):
      {"status":"not_configured"|"error","reason":str,"step":n}
    """
    result = await pipeline.investigate_sync(req.to_source())
    return result


# --------------------------------------------------------------------------- #
# POST /api/chat — conversational follow-up over a finished investigation
# --------------------------------------------------------------------------- #
@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    """Answer a follow-up question grounded in a prior investigation.

    Resolves context (from Atlas by `investigation_id` when available, else the
    client-supplied `context` bundle), asks Gemini, and — when Atlas is up —
    persists the turn to the `conversations` collection so memory survives across
    sessions. Returns {"status":"ok","reply","conversation_id","persisted"} or a
    not_configured/error envelope (never a fabricated reply).
    """
    context = req.context or {}
    if req.investigation_id:
        inv = await asyncio.to_thread(db.get_investigation, req.investigation_id)
        if inv:
            context = inv
    msgs = [m.model_dump() for m in req.messages]
    result = await asyncio.to_thread(chat.answer, context, msgs)
    if result.get("status") != "ok":
        return result

    cid = await asyncio.to_thread(
        db.append_conversation, req.conversation_id, req.investigation_id,
        [msgs[-1], {"role": "assistant", "content": result["reply"]}])
    persisted = cid not in (None, "no-db")
    return {"status": "ok", "reply": result["reply"],
            "conversation_id": cid if persisted else req.conversation_id,
            "persisted": persisted}


# --------------------------------------------------------------------------- #
# POST /api/report — user-submitted scam report (explicit pymongo write)
# --------------------------------------------------------------------------- #
@app.post("/api/report")
async def report(req: ReportRequest):
    """Persist a scam report. This insert is what /api/feed watches via a change
    stream. Returns the new id, or status not_configured if Atlas is unreachable.
    """
    rid = await asyncio.to_thread(db.save_report, req.to_doc())
    if rid == "no-db":
        return {"status": "not_configured", "reason": db.status().get("error") or "atlas_unreachable"}
    return {"status": "ok", "report_id": rid}


# --------------------------------------------------------------------------- #
# GET /api/feed — REAL change stream over reports (PyMongo ASYNC driver)
# --------------------------------------------------------------------------- #
@app.get("/api/feed")
async def feed():
    """Stream newly-inserted reports live as SSE.

    Frames:
      • {"type":"hello","status":"ok"|"not_configured","recent":[...]}  (initial)
      • {"type":"report","status":"ok","report":{...}}                  (per insert)
      • {"type":"ping"}                                                 (keep-alive)
      • {"type":"feed","status":"not_configured","reason":str}          (no stream)
    """

    async def stream():
        # Initial backfill of recent reports so the UI isn't empty on connect.
        recent = await asyncio.to_thread(db.recent_reports, 20)
        connected = db.status().get("connected", False)
        yield _sse({"type": "hello", "status": "ok" if connected else "not_configured",
                    "recent": recent})

        try:
            async for change in db.watch_reports():
                if change.get("status") == "ok":
                    yield _sse({"type": "report", "status": "ok",
                                "report": change.get("report", {})})
                else:
                    # Change stream couldn't open (Atlas down / not a replica set).
                    yield _sse({"type": "feed", "status": "not_configured",
                                "reason": change.get("reason")})
                    break
        except asyncio.CancelledError:  # client disconnected
            raise
        except Exception as exc:  # noqa: BLE001
            yield _sse({"type": "feed", "status": "not_configured", "reason": str(exc)[:160]})

    return StreamingResponse(stream(), media_type="text/event-stream", headers=_SSE_HEADERS)


# --------------------------------------------------------------------------- #
# GET /api/health — live capability booleans for the frontend
# --------------------------------------------------------------------------- #
@app.get("/api/health")
async def health_full():
    """Live status. Atlas is probed on demand (not cached as 'down' forever)."""
    atlas_ok = await asyncio.to_thread(db.is_connected)
    st = db.status()
    return {
        "status": "ok",
        "service": "TicketGuard Agent",
        "model": config.GEMINI_MODEL,
        "gemini_backend": config.backend_label(),
        # Live capability booleans.
        "gemini": config.gemini_configured(),
        "atlas": atlas_ok,
        "mcp": pipeline.mcp_enabled(),
        "gmail": False,  # DEFERRED: Gmail OAuth ingestion not built (see ingest TODO).
        # Atlas detail.
        "cluster_version": st.get("cluster_version"),
        "rankfusion_capable": st.get("rankfusion_capable", False),
        "vector_index": st.get("vector_index", False),
        "text_index": st.get("text_index", False),
        "atlas_error": st.get("error"),
    }


# --------------------------------------------------------------------------- #
# GET /api/mcp/info — honest description of the MongoDB MCP integration
# --------------------------------------------------------------------------- #
@app.get("/api/mcp/info")
async def mcp_info():
    st = db.status()
    return {
        "partner": "MongoDB",
        "mcp_server": "mongodb-mcp-server (official)",
        "transport": "stdio",
        "mode": "read-only",
        "enabled": pipeline.mcp_enabled(),
        "agent_tools_via_mcp": ["find", "aggregate", "count", "collection-schema",
                                "list-collections"],
        "writes": "explicit pymongo path (reports, investigations, tickets_seen) — never via MCP",
        "hybrid_retrieval": {
            "vector_search": {"feature": "Atlas $vectorSearch", "index": config.VECTOR_INDEX,
                              "embeddings": config.EMBED_MODEL, "dims": config.EMBED_DIMS,
                              "active": st.get("vector_index", False)},
            "text_search": {"feature": "Atlas $search (full-text)", "index": config.TEXT_INDEX,
                            "active": st.get("text_index", False)},
            "fusion": ("native $rankFusion" if st.get("rankfusion_capable")
                       else "reciprocal-rank fusion (code)"),
        },
        "db_connected": st.get("connected", False),
        "cluster_version": st.get("cluster_version"),
        "model": config.GEMINI_MODEL,
        "gemini_backend": config.backend_label(),
        # DEFERRED: TicketGuard is not (yet) exposed as its own MCP server.
        "ticketguard_as_mcp_server": False,
    }


# --------------------------------------------------------------------------- #
# GET /health — minimal liveness probe (Cloud Run / load balancers)
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health():
    st = db.status()
    return {
        "status": "ok",
        "service": "TicketGuard Agent",
        "model": config.GEMINI_MODEL,
        "gemini_backend": config.backend_label(),
        "mcp": pipeline.mcp_enabled(),
        "db_connected": st.get("connected", False),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
