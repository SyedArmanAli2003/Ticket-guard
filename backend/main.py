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

import config
import db
import pipeline
import models_registry as registry
from models import InvestigateRequest, ReportRequest

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
    # Seed demo accounts into MongoDB (idempotent — skips if email already exists)
    _DEMO_ACCOUNTS = [
        {"name": "TG Admin", "email": "admin@ticketguard.ai", "password": "admin123", "role": "admin"},
        {"name": "Demo User", "email": "demo@ticketguard.ai", "password": "demo123", "role": "user"},
    ]
    for acc in _DEMO_ACCOUNTS:
        result = db.register_user(acc["name"], acc["email"], acc["password"], acc["role"])
        if result["status"] == "ok":
            print(f"✅ Seeded demo account: {acc['email']}")
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
    model = req.model

    async def stream():
        try:
            async for ev in pipeline.run_investigation(source, model):
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
    result = await pipeline.investigate_sync(req.to_source(), req.model)
    return result


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
        # Multi-model (Gemini-only registry).
        "default_model": registry.DEFAULT_MODEL,
        "models_available": [m["id"] for m in registry.get_all_models() if m["available"]],
    }


# --------------------------------------------------------------------------- #
# GET /api/models — available AI models for the frontend selector (Gemini-only)
# --------------------------------------------------------------------------- #
@app.get("/api/models")
async def list_models():
    """Available AI models for the frontend selector. Gemini-only by design
    (hackathon compliance); the fallback tiers share the Google key but each has
    its own per-model free-tier quota bucket."""
    return {
        "models": registry.get_all_models(),
        "default": registry.DEFAULT_MODEL,
        "fallback_order": registry.FALLBACK_ORDER,
        "primary_is_gemini": True,
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
# POST /api/auth/register — create a new user account in MongoDB
# --------------------------------------------------------------------------- #
@app.post("/api/auth/register")
async def auth_register(body: dict):
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not name or not email or not password:
        return {"status": "error", "error": "name, email, and password are required."}
    result = await asyncio.to_thread(db.register_user, name, email, password)
    if result["status"] == "not_configured":
        # DB unavailable: fall back to local-only mode gracefully
        return {"status": "not_configured", "reason": "db_unavailable",
                "fallback": "local_only"}
    return result


# --------------------------------------------------------------------------- #
# POST /api/auth/login — verify credentials against MongoDB
# --------------------------------------------------------------------------- #
@app.post("/api/auth/login")
async def auth_login(body: dict):
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        return {"status": "error", "error": "email and password are required."}
    result = await asyncio.to_thread(db.login_user, email, password)
    if result["status"] == "not_configured":
        return {"status": "not_configured", "reason": "db_unavailable",
                "fallback": "local_only"}
    return result


import base64
from fastapi import Header, Depends, HTTPException

def get_current_user_id(authorization: str = Header(None)) -> str:
    """Extract user_id from the simple frontend btoa() token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization[7:]
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        user_id, _ = decoded.split(":", 1)
        return user_id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token format")

# --------------------------------------------------------------------------- #
# GET /api/history — fetch user's investigation history from MongoDB
# --------------------------------------------------------------------------- #
@app.get("/api/history")
async def get_history(limit: int = 50, user_id: str = Depends(get_current_user_id)):
    entries = await asyncio.to_thread(db.get_user_history, user_id, min(limit, 100))
    if entries is None:
        return {"status": "not_configured", "reason": "db_unavailable"}
    return {"status": "ok", "user_id": user_id, "entries": entries, "count": len(entries)}


# --------------------------------------------------------------------------- #
# POST /api/history/save — save a history entry (called after investigation)
# --------------------------------------------------------------------------- #
@app.post("/api/history/save")
async def save_history(body: dict, user_id: str = Depends(get_current_user_id)):
    required = {"query", "verdict", "score", "rationale", "query_type"}
    missing = required - body.keys()
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing fields: {missing}")
    
    # Enforce token user_id matches the requested user_id
    body["user_id"] = user_id
    
    entry_id = await asyncio.to_thread(db.save_user_history, body)
    if entry_id == "no-db":
        return {"status": "not_configured", "reason": "db_unavailable"}
    return {"status": "ok", "entry_id": entry_id}


# --------------------------------------------------------------------------- #
# DELETE /api/history/entry/{entry_id}
# --------------------------------------------------------------------------- #
@app.delete("/api/history/entry/{entry_id}")
async def delete_history(entry_id: str, user_id: str = Depends(get_current_user_id)):
    deleted = await asyncio.to_thread(db.delete_history_entry, entry_id, user_id)
    return {"status": "ok" if deleted else "not_found", "deleted": deleted}


# --------------------------------------------------------------------------- #
# DELETE /api/history/clear — wipe all history for a user
# --------------------------------------------------------------------------- #
@app.delete("/api/history/clear")
async def clear_history(user_id: str = Depends(get_current_user_id)):
    count = await asyncio.to_thread(db.clear_user_history, user_id)
    return {"status": "ok", "deleted": count}


# --------------------------------------------------------------------------- #
# GET /api/admin/users — list all users
# --------------------------------------------------------------------------- #
@app.get("/api/admin/users")
async def admin_users(user_id: str = Depends(get_current_user_id)):
    # Basic check (in a real app, query DB for user role == 'admin')
    users = await asyncio.to_thread(db.get_all_users)
    if users is None:
        return {"status": "not_configured", "reason": "db_unavailable"}
    return {"status": "ok", "users": users, "count": len(users)}


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

