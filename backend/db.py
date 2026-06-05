"""MongoDB Atlas data layer: persistence + Gemini-embedded Atlas Vector Search.

Everything here degrades gracefully: if Atlas is unreachable (e.g. the caller's
IP isn't allow-listed yet) or embeddings fail, functions return safe fallbacks
so the agent still produces a plan. Full grounding lights up once Atlas is
reachable and the vector index is built.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

import certifi
from bson import ObjectId
from pymongo import MongoClient, ASCENDING
from pymongo.operations import SearchIndexModel

from google import genai

import config

# --------------------------------------------------------------------------- #
# Lazy singletons
# --------------------------------------------------------------------------- #
_client: MongoClient | None = None
_db = None
_genai_client: genai.Client | None = None
_status: dict = {"connected": False, "error": None, "vector_index": False}


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
        _client.admin.command("ping")
        _db = _client[config.MONGODB_DB]
        _status.update(connected=True, error=None)
        return _db
    except Exception as exc:  # noqa: BLE001
        _status.update(connected=False, error=str(exc).split(",")[0][:200])
        _client = None
        return None


def _gc() -> genai.Client | None:
    """google-genai client for embeddings (AI Studio or Vertex per config)."""
    global _genai_client
    if _genai_client is not None:
        return _genai_client
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
# Embeddings
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
# Vector search (Atlas)
# --------------------------------------------------------------------------- #
def vector_search_market(query: str, k: int | None = None) -> dict:
    """Semantic search over the market_corpus via Atlas Vector Search.

    Returns {"method": "...", "results": [...], "count": n}. Falls back to a
    regex/text scan, then to the static corpus, so it never hard-fails.
    """
    k = k or config.VECTOR_TOPK
    db = _get_db()
    emb = embed_text(query)

    if db is not None and emb is not None:
        try:
            pipeline = [
                {"$vectorSearch": {
                    "index": config.VECTOR_INDEX,
                    "path": config.VECTOR_PATH,
                    "queryVector": emb,
                    "numCandidates": 100,
                    "limit": k,
                }},
                {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
                {"$project": {"embedding": 0, "_id": 0}},
            ]
            results = list(db[config.COLL_CORPUS].aggregate(pipeline))
            if results:
                _status["vector_index"] = True
                return {"method": "atlas_vector_search", "results": results,
                        "count": len(results)}
        except Exception:  # noqa: BLE001 — index missing or DB issue → fall through
            pass

    # Fallback 1: regex scan in Mongo
    if db is not None:
        try:
            rx = re.compile(re.escape(query.split()[0]) if query else "", re.I)
            results = list(db[config.COLL_CORPUS].find(
                {"$or": [{"industry": rx}, {"content": rx}, {"title": rx}]},
                {"embedding": 0, "_id": 0},
            ).limit(k))
            if results:
                return {"method": "text_fallback", "results": results,
                        "count": len(results)}
        except Exception:  # noqa: BLE001
            pass

    # Fallback 2: static corpus (DB entirely unavailable)
    res = _static_match(query, k)
    return {"method": "static_fallback", "results": res, "count": len(res)}


def _static_match(query: str, k: int) -> list[dict]:
    q = (query or "").lower()
    scored = []
    for doc in SEED_CORPUS:
        hay = f"{doc['industry']} {doc['title']} {doc['content']}".lower()
        score = sum(1 for w in set(q.split()) if w and w in hay)
        scored.append((score, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{k2: v for k2, v in d.items() if k2 != "embedding"}
            for s, d in scored[:k]]


# --------------------------------------------------------------------------- #
# Plan persistence
# --------------------------------------------------------------------------- #
def save_plan(idea: str) -> str:
    db = _get_db()
    if db is None:
        return "no-db"
    doc = {
        "idea": idea,
        "created_at": datetime.now(timezone.utc),
        "status": "generating",
        "validation": {}, "market_research": {}, "personas": [],
        "business_plan": {}, "financials": {}, "risks": {},
        "action_items": {}, "share_token": None,
    }
    return str(db[config.COLL_PLANS].insert_one(doc).inserted_id)


def update_plan(plan_id: str, field: str, data) -> None:
    if plan_id == "no-db":
        return
    db = _get_db()
    if db is None:
        return
    try:
        db[config.COLL_PLANS].update_one(
            {"_id": ObjectId(plan_id)}, {"$set": {field: data}})
    except Exception:  # noqa: BLE001
        pass


def get_plan(plan_id: str) -> dict | None:
    if plan_id == "no-db":
        return None
    db = _get_db()
    if db is None or not ObjectId.is_valid(plan_id):
        return None
    return db[config.COLL_PLANS].find_one({"_id": ObjectId(plan_id)})


def get_plan_by_token(token: str) -> dict | None:
    db = _get_db()
    if db is None:
        return None
    return db[config.COLL_PLANS].find_one({"share_token": token})


def get_plan_count() -> int:
    db = _get_db()
    if db is None:
        return 0
    try:
        return db[config.COLL_PLANS].count_documents({})
    except Exception:  # noqa: BLE001
        return 0


def find_similar_plans(industry: str, limit: int = 3) -> list[dict]:
    """Past completed plans in the same market — agent grounding signal."""
    db = _get_db()
    if db is None:
        return []
    try:
        rx = re.compile(re.escape(industry or ""), re.I)
        plans = list(db[config.COLL_PLANS].find(
            {"validation.target_market": rx, "status": "complete"},
            {"idea": 1, "validation.viability_score": 1,
             "financials.year3_revenue": 1, "_id": 0},
        ).limit(limit))
        return plans
    except Exception:  # noqa: BLE001
        return []


# --------------------------------------------------------------------------- #
# Seeding + index bootstrap
# --------------------------------------------------------------------------- #
def init_db() -> None:
    """Connect, ensure indexes, seed the vector corpus. Safe to call on boot."""
    db = _get_db()
    if db is None:
        print(f"⚠️  MongoDB unavailable — {_status['error']}. Running degraded.")
        return
    try:
        db[config.COLL_PLANS].create_index(
            [("share_token", ASCENDING)], unique=True,
            partialFilterExpression={"share_token": {"$type": "string"}},
            name="share_token_unique")
        _ensure_vector_index(db)
        seed_market_corpus()
        print(f"✅ MongoDB ready (vector_index={_status['vector_index']})")
    except Exception as exc:  # noqa: BLE001
        print(f"❌ MongoDB init error: {exc}")


def _ensure_vector_index(db) -> None:
    try:
        existing = {i["name"] for i in db[config.COLL_CORPUS].list_search_indexes()}
        if config.VECTOR_INDEX in existing:
            _status["vector_index"] = True
            return
        model = SearchIndexModel(
            definition={"fields": [{
                "type": "vector", "path": config.VECTOR_PATH,
                "numDimensions": config.EMBED_DIMS, "similarity": "cosine",
            }]},
            name=config.VECTOR_INDEX, type="vectorSearch")
        db[config.COLL_CORPUS].create_search_index(model=model)
        _status["vector_index"] = True
        print("🔎 Created Atlas vector index (building may take ~1 min)")
    except Exception as exc:  # noqa: BLE001
        print(f"ℹ️  Vector index not created ({str(exc)[:80]}) — using fallback search")


def seed_market_corpus() -> None:
    """Insert curated market-intel docs with embeddings if corpus is empty."""
    db = _get_db()
    if db is None:
        return
    coll = db[config.COLL_CORPUS]
    if coll.estimated_document_count() > 0:
        return
    docs = []
    for d in SEED_CORPUS:
        doc = dict(d)
        emb = embed_text(f"{doc['industry']}. {doc['title']}. {doc['content']}")
        if emb:
            doc["embedding"] = emb
        docs.append(doc)
    if docs:
        coll.insert_many(docs)
        print(f"🌱 Seeded {len(docs)} market-intel docs"
              + (" with embeddings" if "embedding" in docs[0] else " (no embeddings)"))


# Curated market-intelligence corpus (grounds the agent's research).
SEED_CORPUS = [
    {"industry": "Technology", "title": "SaaS market scale & dynamics",
     "content": "Global tech market ~$5.3T, ~8% CAGR. SaaS gross margins 70-85%. "
                "Top risks: rapid obsolescence, talent costs, security/privacy compliance. "
                "Winners differentiate on workflow depth and data moats.", "source": "industry-brief"},
    {"industry": "Healthcare", "title": "Digital health & regulation",
     "content": "Healthcare ~$12T, ~9% CAGR. Long sales cycles, FDA/HIPAA compliance, "
                "reimbursement complexity. Clinical validation is the key cost and moat.", "source": "industry-brief"},
    {"industry": "Education", "title": "EdTech adoption & monetization",
     "content": "EdTech ~$7T, ~10% CAGR. Low willingness to pay, high churn, slow institutional "
                "adoption. Outcome measurement and B2B2C distribution drive durable revenue.", "source": "industry-brief"},
    {"industry": "Food & Beverage", "title": "F&B margins & logistics",
     "content": "F&B ~$8T, ~6% CAGR. Thin margins, perishability, food-safety regulation. "
                "Brand and supply-chain efficiency separate winners from the pack.", "source": "industry-brief"},
    {"industry": "E-commerce", "title": "E-commerce unit economics",
     "content": "E-commerce ~$6.3T, ~11% CAGR. Customer-acquisition cost and fulfillment "
                "dominate economics; platform dependency is a structural risk.", "source": "industry-brief"},
    {"industry": "Finance", "title": "FinTech trust & compliance",
     "content": "Financial services ~$26T, ~7% CAGR (FinTech). Licensing, fraud risk, and "
                "incumbent trust are barriers. Embedded finance and real-time rails are growth vectors.", "source": "industry-brief"},
    {"industry": "Real Estate", "title": "PropTech cyclicality",
     "content": "PropTech-adjacent real estate ~$3.7T, ~5% CAGR. High capital intensity, "
                "market cyclicality, fragmented data. Workflow + data products de-risk transactions.", "source": "industry-brief"},
    {"industry": "Transportation", "title": "Mobility & logistics economics",
     "content": "Transportation ~$7T, ~6% CAGR. Capital/infra costs, regulation, safety/liability. "
                "Unit economics and density determine viability.", "source": "industry-brief"},
    {"industry": "Entertainment", "title": "Attention & monetization",
     "content": "Entertainment ~$2.8T, ~8% CAGR. Content costs and attention competition; "
                "monetization and churn are central. Rights/licensing gate scale.", "source": "industry-brief"},
    {"industry": "Agriculture", "title": "AgTech adoption cycles",
     "content": "AgTech ~$12T, ~7% CAGR. Long adoption cycles, weather/climate risk, "
                "fragmented buyers. Financing models and agronomic ROI proof unlock sales.", "source": "industry-brief"},
    {"industry": "Logistics", "title": "Last-mile & rural delivery",
     "content": "Last-mile is 40-53% of shipping cost. Rural delivery economics hinge on route "
                "density, cold-chain for medicine, and shared infrastructure. Aggregation wins.", "source": "playbook"},
    {"industry": "Marketplaces", "title": "Two-sided marketplace liquidity",
     "content": "Marketplaces win on liquidity: solve the cold-start with a constrained niche, "
                "subsidize the scarce side, and measure time-to-match. Take-rates 10-20%.", "source": "playbook"},
]
