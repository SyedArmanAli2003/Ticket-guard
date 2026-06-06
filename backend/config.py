"""Central configuration for the TicketGuard agent backend.

TicketGuard is a multi-agent ticket-resale SCAM-RISK investigator. It reuses the
ADK + MongoDB-MCP + FastAPI-SSE skeleton: a TEAM of Gemini specialists, grounded
in MongoDB Atlas (Vector Search + Atlas Search full-text), streamed over SSE.

All Gemini access goes through the `google-genai` SDK. Two backends are
supported and selected by env:

  • AI Studio  (dev)        — GOOGLE_GENAI_USE_VERTEXAI=FALSE + GOOGLE_API_KEY
  • Vertex AI  (submission) — GOOGLE_GENAI_USE_VERTEXAI=TRUE  + GOOGLE_CLOUD_PROJECT
                              + GOOGLE_CLOUD_LOCATION

HARD RULE: the core LLM is Google Gemini ONLY (gemini-2.5-flash). Embeddings go
through the same google-genai path (EMBED_MODEL). No non-Google LLM is added.
"""

import os
from dotenv import load_dotenv

load_dotenv()


def _truthy(val: str | None) -> bool:
    return str(val).strip().lower() in {"1", "true", "yes", "on"}


# --------------------------------------------------------------------------- #
# Gemini / Google Cloud
# --------------------------------------------------------------------------- #
USE_VERTEX: bool = _truthy(os.getenv("GOOGLE_GENAI_USE_VERTEXAI"))
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")
GOOGLE_CLOUD_PROJECT: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_CLOUD_LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# HARD RULE: gemini-2.5-flash is the required core model. Override only via env
# if a key genuinely lacks it; do NOT swap in a non-Google model.
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBED_MODEL: str = os.getenv("EMBED_MODEL", "text-embedding-004")
EMBED_DIMS: int = int(os.getenv("EMBED_DIMS", "768"))

# Make the AI Studio key visible to google-genai / ADK under the name they read.
if not USE_VERTEX and GOOGLE_API_KEY:
    os.environ.setdefault("GOOGLE_API_KEY", GOOGLE_API_KEY)
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "FALSE"


# --------------------------------------------------------------------------- #
# MongoDB Atlas
# --------------------------------------------------------------------------- #
MONGODB_URI: str = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB: str = os.getenv("MONGODB_DB", "ticketguard")

# Collections (created idempotently by scripts/setup_atlas.py).
COLL_CORPUS = "scam_corpus"          # labelled scam/legit listings — vector + text searchable
COLL_TICKETS_SEEN = "tickets_seen"   # sha256 of barcodes/booking-refs already offered to buyers
COLL_REPORTS = "reports"             # user-submitted scam reports (change-stream source for /api/feed)
COLL_INVESTIGATIONS = "investigations"  # persisted investigation results
COLL_RULES = "official_rules"        # official-transfer rule engine knowledge

# Atlas Search indexes.
VECTOR_INDEX = "scam_vector_index"   # $vectorSearch over scam_corpus.embedding
TEXT_INDEX = "scam_text_index"       # $search (full-text) over scam_corpus.text
VECTOR_PATH = "embedding"
VECTOR_TOPK = int(os.getenv("VECTOR_TOPK", "5"))

# Native $rankFusion is available on MongoDB 8.1+. Below that we fuse the vector
# and text result sets in application code (reciprocal-rank fusion).
RANKFUSION_MIN_VERSION = (8, 1)

# Official ticketing domains used for typosquat detection (reputation step).
# Synthetic / well-known marketplaces only — NO event-organiser marks.
OFFICIAL_DOMAINS: list[str] = [
    "ticketmaster.com",
    "stubhub.com",
    "seatgeek.com",
    "vividseats.com",
    "axs.com",
    "ticketek.com",
    "eventbrite.com",
    "livenation.com",
]


def mongo_configured() -> bool:
    uri = MONGODB_URI
    return bool(uri) and "<" not in uri and "your" not in uri.lower()


def gemini_configured() -> bool:
    if USE_VERTEX:
        return bool(GOOGLE_CLOUD_PROJECT)
    key = GOOGLE_API_KEY
    return bool(key) and not key.startswith("your") and not key.startswith("<")


def backend_label() -> str:
    return "Vertex AI" if USE_VERTEX else "Google AI Studio"
