"""PitchCraft FastAPI app — serves the ADK + Gemini + MongoDB-MCP agent over SSE."""

import os
import sys
import json
from contextlib import asynccontextmanager

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console emoji safety

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

import config
import db
import pipeline
from models import IdeaRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    pipeline.init_runner()
    yield


app = FastAPI(title="PitchCraft Agent API", lifespan=lifespan)

_origins = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _jsonable(plan: dict) -> dict:
    plan["_id"] = str(plan["_id"])
    return plan


@app.post("/api/generate")
async def generate(req: IdeaRequest):
    """Run the agent; stream each section + tool activity as Server-Sent Events."""
    plan_id = db.save_plan(req.idea)

    async def stream():
        async for ev in pipeline.run_pitchcraft(req.idea, plan_id):
            yield f"data: {json.dumps(ev)}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "X-Plan-ID": plan_id,
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/plan/{plan_id}")
async def get_plan_route(plan_id: str):
    plan = db.get_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return _jsonable(plan)


@app.get("/api/share/{token}")
async def get_shared(token: str):
    plan = db.get_plan_by_token(token)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return _jsonable(plan)


@app.get("/api/stats")
async def stats():
    return {"total_plans": db.get_plan_count()}


@app.get("/api/mcp/info")
async def mcp_info():
    """Honest description of the live Partner (MongoDB) MCP integration."""
    st = db.status()
    return {
        "partner": "MongoDB",
        "mcp_server": "mongodb-mcp-server (official)",
        "transport": "stdio",
        "enabled": pipeline.mcp_enabled(),
        "agent_tools_via_mcp": ["find", "aggregate", "count", "collection-schema", "list-collections"],
        "vector_search": {
            "feature": "MongoDB Atlas Vector Search",
            "embeddings": config.EMBED_MODEL,
            "index": config.VECTOR_INDEX,
            "active": st.get("vector_index", False),
        },
        "db_connected": st.get("connected", False),
        "model": config.GEMINI_MODEL,
        "gemini_backend": config.backend_label(),
    }


@app.get("/health")
async def health():
    st = db.status()
    return {
        "status": "ok",
        "service": "PitchCraft Agent",
        "model": config.GEMINI_MODEL,
        "gemini_backend": config.backend_label(),
        "mcp": pipeline.mcp_enabled(),
        "db_connected": st.get("connected", False),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
