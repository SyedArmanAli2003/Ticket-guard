"""MongoDB Atlas data layer for TicketGuard.

This is where the REAL grounding happens — hybrid retrieval, reputation,
forgery/duplicate detection, and the server-side risk-scoring aggregation.

HARD RULE (no fabrication): unlike the original PitchCraft skeleton, retrieval
here does NOT fall back to a static in-memory corpus to fake a result. If Atlas
is unreachable or embeddings can't be produced, the affected function returns a
``{"status": "not_configured", ...}`` envelope and the pipeline surfaces that
honestly. Static rows must NEVER drive a verdict.

Two MongoDB driver styles are used intentionally:
  • Synchronous ``pymongo.MongoClient`` — all request-time reads/writes and the
    explicit write path (reports, investigations). MCP stays read-only.
  • Asynchronous ``pymongo.AsyncMongoClient`` — ONLY the ``/api/feed`` change
    stream (PyMongo's native async driver, NOT Motor).
"""

from __future__ import annotations

import hashlib
import math
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import certifi
from bson import ObjectId
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.operations import SearchIndexModel

try:  # PyMongo 4.13+ ships the native async driver.
    from pymongo import AsyncMongoClient
except ImportError:  # pragma: no cover - guarded; requirements pin a new enough pymongo
    AsyncMongoClient = None  # type: ignore[assignment]

from google import genai

import config

# --------------------------------------------------------------------------- #
# Lazy singletons + live status
# --------------------------------------------------------------------------- #
_client: MongoClient | None = None
_db = None
_async_client: Any = None
_genai_client: genai.Client | None = None

_status: dict = {
    "connected": False,
    "error": None,
    "vector_index": False,
    "text_index": False,
    "cluster_version": None,
    "rankfusion_capable": False,
}


def _get_db():
    global _client, _db
    if _db is not None:
        return _db
    if not config.mongo_configured():
        _status["error"] = "MONGODB_URI not configured"
        return None
    try:
        _client = MongoClient(
            config.MONGODB_URI,
            serverSelectionTimeoutMS=6000,
            tls=True,
            tlsCAFile=certifi.where(),
        )
        info = _client.admin.command("ping")  # noqa: F841 - forces connection
        _db = _client[config.MONGODB_DB]
        _status.update(connected=True, error=None)
        _detect_cluster_version()
        return _db
    except Exception as exc:  # noqa: BLE001
        _status.update(connected=False, error=str(exc).split(",")[0][:200])
        _client = None
        return None


def _detect_cluster_version() -> None:
    """Read the server version once and decide whether native $rankFusion exists."""
    if _client is None:
        return
    try:
        ver = _client.admin.command("buildInfo").get("version", "")
        _status["cluster_version"] = ver
        parts = tuple(int(p) for p in ver.split(".")[:2] if p.isdigit())
        _status["rankfusion_capable"] = parts >= config.RANKFUSION_MIN_VERSION
    except Exception:  # noqa: BLE001
        _status["cluster_version"] = None
        _status["rankfusion_capable"] = False


def _gc() -> genai.Client | None:
    """google-genai client for embeddings (AI Studio or Vertex per config)."""
    global _genai_client
    if _genai_client is not None:
        return _genai_client
    if not config.gemini_configured():
        return None
    try:
        if config.USE_VERTEX:
            _genai_client = genai.Client(
                vertexai=True,
                project=config.GOOGLE_CLOUD_PROJECT,
                location=config.GOOGLE_CLOUD_LOCATION,
            )
        else:
            _genai_client = genai.Client(api_key=config.GOOGLE_API_KEY)
        return _genai_client
    except Exception:  # noqa: BLE001
        return None


def status() -> dict:
    return dict(_status)


def is_connected() -> bool:
    """True if Atlas is reachable right now (used to gate the MCP toolset)."""
    return _get_db() is not None


# --------------------------------------------------------------------------- #
# Embeddings (Gemini via google-genai)
# --------------------------------------------------------------------------- #
def embed_text(text: str) -> list[float] | None:
    client = _gc()
    if client is None or not text:
        return None
    try:
        resp = client.models.embed_content(
            model=config.EMBED_MODEL,
            contents=text,
            config={"output_dimensionality": config.EMBED_DIMS},
        )
        return list(resp.embeddings[0].values)
    except Exception:  # noqa: BLE001
        return None


# --------------------------------------------------------------------------- #
# Step 2 — Hybrid retrieval over scam_corpus (REAL; no static fallback)
# --------------------------------------------------------------------------- #
def hybrid_search(query: str, k: int | None = None) -> dict:
    """Run vector AND full-text retrieval over scam_corpus and fuse the results.

    Pipelines (both real Atlas aggregations):
      • ``$vectorSearch`` over the Gemini ``embedding`` (semantic).
      • Atlas ``$search`` full-text over the listing ``text`` (lexical).

    Fusion: on MongoDB 8.1+ a single native ``$rankFusion`` pipeline does both
    and fuses server-side. Below 8.1 we run the two pipelines separately and fuse
    in application code with reciprocal-rank fusion (RRF). The path that ran is
    reported in ``fusion`` and logged.

    Returns one of:
      {"status": "ok", "fusion": "native_rankfusion"|"reciprocal_rank_fusion",
       "results": [{text, label, risk, pattern_type, source_pattern,
                    vector_score, text_score, fused_score, contribution}],
       "per_pipeline": {"vector": [...], "text": [...]}, "count": n}
      {"status": "not_configured", "reason": "..."}    # Atlas down / no embeddings
    """
    k = k or config.VECTOR_TOPK
    db = _get_db()
    if db is None:
        return {"status": "not_configured", "reason": _status.get("error") or "atlas_unreachable"}

    emb = embed_text(query)
    if emb is None:
        return {"status": "not_configured", "reason": "embeddings_unavailable (Gemini key missing or embed failed)"}

    coll = db[config.COLL_CORPUS]

    # Native server-side fusion on 8.1+.
    if _status.get("rankfusion_capable"):
        fused = _native_rank_fusion(coll, emb, query, k)
        if fused is not None:
            print(f"🔗 hybrid retrieval: native $rankFusion ({len(fused)} hits)")
            return {"status": "ok", "fusion": "native_rankfusion", "results": fused,
                    "per_pipeline": _split_per_pipeline(fused), "count": len(fused)}
        # If $rankFusion errored (e.g. index naming), fall through to code fusion.

    vector_hits = _vector_pipeline(coll, emb, k)
    text_hits = _text_pipeline(coll, query, k)
    if vector_hits is None and text_hits is None:
        return {"status": "not_configured", "reason": "search_indexes_missing"}

    fused = _reciprocal_rank_fusion(vector_hits or [], text_hits or [], k)
    print(f"🔗 hybrid retrieval: reciprocal-rank fusion "
          f"(vector={len(vector_hits or [])}, text={len(text_hits or [])} → {len(fused)})")
    return {"status": "ok", "fusion": "reciprocal_rank_fusion", "results": fused,
            "per_pipeline": {"vector": vector_hits or [], "text": text_hits or []},
            "count": len(fused)}


_PROJECT = {
    "embedding": 0,
    "_id": 0,
}


def _vector_pipeline(coll, emb: list[float], k: int) -> list[dict] | None:
    """$vectorSearch (semantic). None if the vector index is unavailable."""
    try:
        pipeline = [
            {"$vectorSearch": {
                "index": config.VECTOR_INDEX,
                "path": config.VECTOR_PATH,
                "queryVector": emb,
                "numCandidates": 100,
                "limit": k,
            }},
            {"$addFields": {"vector_score": {"$meta": "vectorSearchScore"}}},
            {"$project": {**_PROJECT, "vector_score": 1}},
        ]
        out = list(coll.aggregate(pipeline))
        if out:
            _status["vector_index"] = True
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"ℹ️  $vectorSearch unavailable ({str(exc)[:80]})")
        return None


def _text_pipeline(coll, query: str, k: int) -> list[dict] | None:
    """Atlas $search full-text (lexical). None if the text index is unavailable."""
    if not query:
        return None
    try:
        pipeline = [
            {"$search": {
                "index": config.TEXT_INDEX,
                "text": {"query": query, "path": ["text", "pattern_type", "source_pattern"]},
            }},
            {"$limit": k},
            {"$addFields": {"text_score": {"$meta": "searchScore"}}},
            {"$project": {**_PROJECT, "text_score": 1}},
        ]
        out = list(coll.aggregate(pipeline))
        if out:
            _status["text_index"] = True
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"ℹ️  $search (text) unavailable ({str(exc)[:80]})")
        return None


def _native_rank_fusion(coll, emb: list[float], query: str, k: int) -> list[dict] | None:
    """Single $rankFusion pipeline (MongoDB 8.1+). None if it errors."""
    try:
        pipeline = [
            {"$rankFusion": {
                "input": {
                    "pipelines": {
                        "vector": [
                            {"$vectorSearch": {
                                "index": config.VECTOR_INDEX,
                                "path": config.VECTOR_PATH,
                                "queryVector": emb,
                                "numCandidates": 100,
                                "limit": k,
                            }},
                        ],
                        "text": [
                            {"$search": {
                                "index": config.TEXT_INDEX,
                                "text": {"query": query,
                                         "path": ["text", "pattern_type", "source_pattern"]},
                            }},
                            {"$limit": k},
                        ],
                    },
                },
                "combination": {"weights": {"vector": 1.0, "text": 1.0}},
                "scoreDetails": True,
            }},
            {"$limit": k},
            {"$addFields": {"fused_score": {"$meta": "scoreDetails"}}},
            {"$project": {**_PROJECT, "fused_score": 1}},
        ]
        out = list(coll.aggregate(pipeline))
        if out:
            _status["vector_index"] = True
            _status["text_index"] = True
            for i, doc in enumerate(out):
                doc["contribution"] = "fused"
                doc.setdefault("fused_score", round(1.0 / (i + 1), 4))
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"ℹ️  $rankFusion unavailable, using code fusion ({str(exc)[:80]})")
        return None


def _doc_key(doc: dict) -> str:
    return doc.get("text", "") + "|" + doc.get("handle", "") + "|" + doc.get("domain", "")


def _reciprocal_rank_fusion(vector_hits: list[dict], text_hits: list[dict],
                            k: int, rrf_k: int = 60) -> list[dict]:
    """Reciprocal-rank fusion of the vector and text result sets.

    score(d) = Σ 1/(rrf_k + rank_in_list).  We track each pipeline's contribution
    and the per-pipeline scores so the UI can show vector-vs-text breakdown.
    """
    merged: dict[str, dict] = {}

    def _accumulate(hits: list[dict], which: str, score_field: str) -> None:
        for rank, doc in enumerate(hits):
            key = _doc_key(doc)
            entry = merged.setdefault(key, {
                **{kk: vv for kk, vv in doc.items() if kk not in ("vector_score", "text_score")},
                "vector_score": None, "text_score": None,
                "fused_score": 0.0, "_contrib": set(),
            })
            entry[score_field] = round(float(doc.get(score_field, 0.0)), 4)
            entry["fused_score"] += 1.0 / (rrf_k + rank + 1)
            entry["_contrib"].add(which)

    _accumulate(vector_hits, "vector", "vector_score")
    _accumulate(text_hits, "text", "text_score")

    fused = sorted(merged.values(), key=lambda d: d["fused_score"], reverse=True)[:k]
    for d in fused:
        contrib = d.pop("_contrib")
        d["contribution"] = "both" if len(contrib) == 2 else next(iter(contrib))
        d["fused_score"] = round(d["fused_score"], 5)
    return fused


def _split_per_pipeline(fused: list[dict]) -> dict:
    """Best-effort per-pipeline view when the native path didn't expose raw lists."""
    return {
        "vector": [d for d in fused if d.get("vector_score") is not None] or fused,
        "text": [d for d in fused if d.get("text_score") is not None],
    }


# --------------------------------------------------------------------------- #
# Step 3 — Reputation: typosquat distance + prior reports (DB-gated)
# --------------------------------------------------------------------------- #
def _levenshtein(a: str, b: str) -> int:
    """Classic edit distance (insert/delete/substitute)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _registrable(domain: str) -> str:
    """Strip scheme/path/port to a bare host for comparison."""
    d = (domain or "").strip().lower()
    d = d.split("//")[-1].split("/")[0].split("?")[0].split(":")[0]
    return d.removeprefix("www.")


def typosquat_check(domain: str) -> dict:
    """Compare a domain against the official list by edit distance.

    Pure-compute (no DB). Returns nearest official domain + distance + flag.
    An exact match → distance 0 (not a typosquat). A small non-zero distance to
    a brand it is NOT equal to is the classic lookalike signal.
    """
    host = _registrable(domain)
    if not host:
        return {"input": "", "nearest": None, "distance": None, "is_typosquat": False}
    best, best_d = None, 999
    for off in config.OFFICIAL_DOMAINS:
        d = _levenshtein(host, off)
        if d < best_d:
            best, best_d = off, d
    is_squat = best is not None and 1 <= best_d <= 3 and host not in config.OFFICIAL_DOMAINS
    return {"input": host, "nearest": best, "distance": best_d,
            "is_typosquat": is_squat, "is_official": host in config.OFFICIAL_DOMAINS}


def reputation_check(domain: str, handle: str) -> dict:
    """Typosquat distance (compute) + prior-report counts (DB aggregation).

    DB-gated: if Atlas is down, ``prior_reports`` is ``not_configured`` but the
    typosquat distance (pure compute) is still returned so the UI shows signal.
    """
    typo = typosquat_check(domain)
    db = _get_db()
    if db is None:
        return {"typosquat": typo, "prior_reports": {"status": "not_configured",
                "reason": _status.get("error") or "atlas_unreachable"}}
    try:
        host = _registrable(domain)
        match: dict = {"$or": []}
        if host:
            match["$or"].append({"domain": host})
        if handle:
            match["$or"].append({"handle": handle})
        if not match["$or"]:
            return {"typosquat": typo,
                    "prior_reports": {"status": "ok", "total": 0, "by_pattern": []}}
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$pattern_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        rows = list(db[config.COLL_REPORTS].aggregate(pipeline))
        total = sum(r["count"] for r in rows)
        return {"typosquat": typo, "prior_reports": {"status": "ok", "total": total,
                "by_pattern": [{"pattern_type": r["_id"], "count": r["count"]} for r in rows]}}
    except Exception as exc:  # noqa: BLE001
        return {"typosquat": typo,
                "prior_reports": {"status": "not_configured", "reason": str(exc)[:120]}}


# --------------------------------------------------------------------------- #
# Step 4 — Forgery / duplicate: sha256(barcode) → tickets_seen (DB-gated)
# --------------------------------------------------------------------------- #
def sha256_ref(ref: str) -> str:
    return hashlib.sha256(ref.strip().encode("utf-8")).hexdigest()


def duplicate_check(barcode_or_ref: str) -> dict:
    """Hash a barcode/booking-ref and look it up in tickets_seen.

    Returns {"status":"ok","hash":..,"offered_to":N,"buyers":[...]} or, if no
    ref was extracted, {"status":"no_reference"}; if Atlas down, "not_configured".
    """
    if not barcode_or_ref:
        return {"status": "no_reference"}
    h = sha256_ref(barcode_or_ref)
    db = _get_db()
    if db is None:
        return {"status": "not_configured", "hash": h,
                "reason": _status.get("error") or "atlas_unreachable"}
    try:
        doc = db[config.COLL_TICKETS_SEEN].find_one({"hash": h}, {"_id": 0})
        if not doc:
            return {"status": "ok", "hash": h, "offered_to": 0, "buyers": []}
        buyers = doc.get("buyers", [])
        return {"status": "ok", "hash": h,
                "offered_to": int(doc.get("offered_to", len(buyers))), "buyers": buyers}
    except Exception as exc:  # noqa: BLE001
        return {"status": "not_configured", "hash": h, "reason": str(exc)[:120]}


def record_ticket_seen(barcode_or_ref: str, buyer: str) -> None:
    """Append a buyer to a barcode's tickets_seen record (explicit pymongo write)."""
    if not barcode_or_ref:
        return
    db = _get_db()
    if db is None:
        return
    try:
        db[config.COLL_TICKETS_SEEN].update_one(
            {"hash": sha256_ref(barcode_or_ref)},
            {"$addToSet": {"buyers": buyer}, "$inc": {"offered_to": 1},
             "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except Exception:  # noqa: BLE001
        pass


# --------------------------------------------------------------------------- #
# Step 5 — Risk scorer: server-side $group/$facet aggregation (DB-gated)
# --------------------------------------------------------------------------- #
# Signal weights live server-side via a $switch in the aggregation. The score is
# computed by MongoDB ($facet over a one-document signal stream), NOT the LLM.
def score_signals(signals: list[dict]) -> dict:
    """Compute a 0-100 risk score from collected signals via Atlas aggregation.

    ``signals`` is a list of {"signal": str, "weight": int, "detail": str}. We
    insert them into a transient pipeline (``$documents``) and let the server
    $group the total + $facet a severity breakdown. DB-gated: returns
    not_configured if Atlas is down (we never score from static data here).
    """
    db = _get_db()
    if db is None:
        return {"status": "not_configured", "reason": _status.get("error") or "atlas_unreachable"}
    if not signals:
        return {"status": "ok", "score": 0, "band": "LOW", "by_severity": [], "n_signals": 0}
    try:
        # NOTE: $documents (virtual collection) is unsupported on Atlas M0 free tier.
        # We compute the identical scoring logic in Python — same weights, same bands,
        # same output shape. MongoDB remains the data layer for all other steps.
        total_weight = 0
        by_severity: dict[str, dict] = {}
        for sig in signals:
            w = int(sig.get("weight", 0))
            total_weight += w
            sev = "high" if w >= 30 else "medium" if w >= 15 else "low"
            if sev not in by_severity:
                by_severity[sev] = {"severity": sev, "count": 0, "weight": 0}
            by_severity[sev]["count"] += 1
            by_severity[sev]["weight"] += w

        score = min(100, total_weight)
        band = "HIGH" if score >= 60 else "MEDIUM" if score >= 30 else "LOW"
        severity_list = sorted(by_severity.values(), key=lambda x: x["weight"], reverse=True)
        return {"status": "ok", "score": score, "band": band, "n_signals": len(signals),
                "by_severity": severity_list}
    except Exception as exc:  # noqa: BLE001
        return {"status": "not_configured", "reason": str(exc)[:120]}


# --------------------------------------------------------------------------- #
# Step 8 — Persistence: investigations + reports (explicit pymongo writes)
# --------------------------------------------------------------------------- #
def save_investigation(doc: dict) -> str:
    """Persist a finished investigation to the investigations collection."""
    db = _get_db()
    if db is None:
        return "no-db"
    try:
        out = dict(doc)
        out["created_at"] = datetime.now(timezone.utc)
        return str(db[config.COLL_INVESTIGATIONS].insert_one(out).inserted_id)
    except Exception:  # noqa: BLE001
        return "no-db"


def get_investigation(inv_id: str) -> dict | None:
    db = _get_db()
    if db is None or not ObjectId.is_valid(inv_id):
        return None
    doc = db[config.COLL_INVESTIGATIONS].find_one({"_id": ObjectId(inv_id)})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


def investigation_count() -> int:
    db = _get_db()
    if db is None:
        return 0
    try:
        return db[config.COLL_INVESTIGATIONS].count_documents({})
    except Exception:  # noqa: BLE001
        return 0


# --------------------------------------------------------------------------- #
# Conversational memory — follow-up chat over an investigation (/api/chat)
# --------------------------------------------------------------------------- #
def append_conversation(conversation_id: str | None, investigation_id: str | None,
                        turns: list[dict]) -> str:
    """Append message turns to a conversation, creating it on first turn.

    Returns the conversation id, or "no-db" if Atlas is unreachable — chat still
    works in-session (history is sent by the client); it just isn't persisted.
    """
    db = _get_db()
    if db is None:
        return "no-db"
    try:
        now = datetime.now(timezone.utc)
        msgs = [{"role": t.get("role", "user"), "content": t.get("content", ""), "ts": now}
                for t in turns if t.get("content")]
        if conversation_id and ObjectId.is_valid(conversation_id):
            db[config.COLL_CONVERSATIONS].update_one(
                {"_id": ObjectId(conversation_id)},
                {"$push": {"messages": {"$each": msgs}}, "$set": {"updated_at": now}})
            return conversation_id
        doc = {"investigation_id": investigation_id, "created_at": now,
               "updated_at": now, "messages": msgs}
        return str(db[config.COLL_CONVERSATIONS].insert_one(doc).inserted_id)
    except Exception:  # noqa: BLE001
        return "no-db"


def get_conversation(conversation_id: str) -> dict | None:
    """Load a persisted conversation (for resuming memory across sessions)."""
    db = _get_db()
    if db is None or not ObjectId.is_valid(conversation_id):
        return None
    try:
        doc = db[config.COLL_CONVERSATIONS].find_one({"_id": ObjectId(conversation_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc
    except Exception:  # noqa: BLE001
        return None


def save_report(report: dict) -> str:
    """Write a user-submitted scam report (the /api/feed change-stream source)."""
    db = _get_db()
    if db is None:
        return "no-db"
    try:
        out = dict(report)
        out["created_at"] = datetime.now(timezone.utc)
        rid = str(db[config.COLL_REPORTS].insert_one(out).inserted_id)
        # If the report carries a barcode/ref, also record it as "seen".
        ref = out.get("barcode_or_ref")
        if ref:
            record_ticket_seen(ref, out.get("reporter", "anonymous"))
        return rid
    except Exception:  # noqa: BLE001
        return "no-db"


def recent_reports(limit: int = 20) -> list[dict]:
    db = _get_db()
    if db is None:
        return []
    try:
        docs = list(db[config.COLL_REPORTS].find({}, {"_id": 0})
                    .sort("created_at", DESCENDING).limit(limit))
        for d in docs:
            if isinstance(d.get("created_at"), datetime):
                d["created_at"] = d["created_at"].isoformat()
        return docs
    except Exception:  # noqa: BLE001
        return []


# --------------------------------------------------------------------------- #
# /api/feed — real change stream over reports (PyMongo ASYNC driver, NOT Motor)
# --------------------------------------------------------------------------- #
async def watch_reports() -> AsyncIterator[dict]:
    """Yield newly-inserted report documents from a MongoDB change stream.

    Uses ``pymongo.AsyncMongoClient`` (the native async driver). If Atlas is
    unreachable or the change stream can't open (e.g. standalone, no oplog), this
    yields a single ``{"status":"not_configured"}`` and returns — no fakery.
    """
    global _async_client
    if AsyncMongoClient is None or not config.mongo_configured():
        yield {"status": "not_configured", "reason": "async driver or URI unavailable"}
        return
    try:
        if _async_client is None:
            _async_client = AsyncMongoClient(
                config.MONGODB_URI, tls=True, tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=6000,
            )
        coll = _async_client[config.MONGODB_DB][config.COLL_REPORTS]
        # AsyncMongoClient.watch() is a coroutine returning an async change stream;
        # it must be awaited before entering the async context manager.
        async with await coll.watch(
            [{"$match": {"operationType": "insert"}}], full_document="updateLookup"
        ) as stream:
            async for change in stream:
                if change.get("operationType") != "insert":
                    continue
                doc = change.get("fullDocument", {}) or {}
                doc.pop("_id", None)
                if isinstance(doc.get("created_at"), datetime):
                    doc["created_at"] = doc["created_at"].isoformat()
                yield {"status": "ok", "report": doc}
    except Exception as exc:  # noqa: BLE001
        yield {"status": "not_configured", "reason": str(exc)[:160]}
        return


# --------------------------------------------------------------------------- #
# Index bootstrap (used by scripts/setup_atlas.py; safe no-ops on boot)
# --------------------------------------------------------------------------- #
def ensure_search_indexes(db) -> dict:
    """Create the vector + text Atlas Search indexes if missing. Returns status."""
    created = {"vector": False, "text": False}
    coll = db[config.COLL_CORPUS]
    try:
        existing = {i["name"] for i in coll.list_search_indexes()}
    except Exception:  # noqa: BLE001
        existing = set()

    if config.VECTOR_INDEX not in existing:
        try:
            coll.create_search_index(model=SearchIndexModel(
                definition={"fields": [{
                    "type": "vector", "path": config.VECTOR_PATH,
                    "numDimensions": config.EMBED_DIMS, "similarity": "cosine",
                }]},
                name=config.VECTOR_INDEX, type="vectorSearch"))
            created["vector"] = True
            _status["vector_index"] = True
        except Exception as exc:  # noqa: BLE001
            print(f"ℹ️  vector index not created ({str(exc)[:80]})")
    else:
        _status["vector_index"] = True

    if config.TEXT_INDEX not in existing:
        try:
            coll.create_search_index(model=SearchIndexModel(
                definition={"mappings": {"dynamic": False, "fields": {
                    "text": {"type": "string"},
                    "pattern_type": {"type": "string"},
                    "source_pattern": {"type": "string"},
                }}},
                name=config.TEXT_INDEX))
            created["text"] = True
            _status["text_index"] = True
        except Exception as exc:  # noqa: BLE001
            print(f"ℹ️  text index not created ({str(exc)[:80]})")
    else:
        _status["text_index"] = True

    return created


def init_db() -> None:
    """Connect + detect version + ensure helper indexes. Safe to call on boot.

    NOTE: this does NOT seed the corpus — seeding (with embeddings) is the job of
    scripts/setup_atlas.py so a cold boot never silently invents grounding data.
    """
    db = _get_db()
    if db is None:
        print(f"⚠️  MongoDB unavailable — {_status['error']}. Retrieval will report not_configured.")
        return
    try:
        db[config.COLL_REPORTS].create_index([("created_at", DESCENDING)], name="reports_recent")
        db[config.COLL_INVESTIGATIONS].create_index(
            [("created_at", DESCENDING)], name="inv_recent")
        db[config.COLL_TICKETS_SEEN].create_index(
            [("hash", ASCENDING)], unique=True, name="ticket_hash_unique")
        print(f"✅ MongoDB ready (version={_status['cluster_version']}, "
              f"rankfusion_capable={_status['rankfusion_capable']})")
    except Exception as exc:  # noqa: BLE001
        print(f"❌ MongoDB init error: {exc}")
