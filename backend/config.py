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

import logging
import os
from dotenv import load_dotenv

load_dotenv()


def _truthy(val: str | None) -> bool:
    return str(val).strip().lower() in {"1", "true", "yes", "on"}


def _valid_key(k: str | None) -> str:
    """Return k stripped if it looks like a real key, else empty string."""
    if not k:
        return ""
    k = k.strip()
    if k.startswith("your") or k.startswith("<") or k == "px-your-key-here":
        return ""
    return k


# --------------------------------------------------------------------------- #
# Gemini / Google Cloud
# --------------------------------------------------------------------------- #
USE_VERTEX: bool = _truthy(os.getenv("GOOGLE_GENAI_USE_VERTEXAI"))
GOOGLE_CLOUD_PROJECT: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_CLOUD_LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Multi-key pool: primary key + up to 2 backup keys (each has its own free-tier
# quota bucket). Rotation is triggered automatically on 429 / RESOURCE_EXHAUSTED.
# Add GEMINI_API_KEY_2 and GEMINI_API_KEY_3 to .env to enable rotation.
_KEY_SLOTS = [
    os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GEMINI_API_KEY_2", ""),
    os.getenv("GEMINI_API_KEY_3", ""),
]
AVAILABLE_API_KEYS: list[str] = [_valid_key(k) for k in _KEY_SLOTS if _valid_key(k)]

# Active key — starts at slot 0; rotate_api_key() advances this forward.
_current_key_index: int = 0
GOOGLE_API_KEY: str = AVAILABLE_API_KEYS[0] if AVAILABLE_API_KEYS else ""

# HARD RULE: gemini-2.5-flash is the required core model. Override only via env
# if a key genuinely lacks it; do NOT swap in a non-Google model.
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBED_MODEL: str = os.getenv("EMBED_MODEL", "text-embedding-004")
EMBED_DIMS: int = int(os.getenv("EMBED_DIMS", "768"))

# Make the AI Studio key visible to google-genai / ADK under the name they read.
if not USE_VERTEX and GOOGLE_API_KEY:
    os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY
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
COLL_CONVERSATIONS = "conversations"  # multi-turn follow-up memory over an investigation
COLL_USERS = "users"                 # registered users (email + hashed password)
COLL_USER_HISTORY = "user_history"   # per-user investigation history (query, verdict, score, rationale)

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


def rotate_api_key() -> bool:
    """Advance to the next available Gemini API key and update the live environment.

    Call this when a 429 / RESOURCE_EXHAUSTED is received so the next Gemini
    request uses a fresh quota bucket. Returns True if a new key was activated,
    False when all keys are exhausted (caller should degrade gracefully).

    No-op in Vertex AI mode (credentials are OAuth, not API keys).
    """
    global _current_key_index, GOOGLE_API_KEY
    if USE_VERTEX:
        return False  # Vertex AI uses OAuth credentials — no API-key rotation
    next_idx = _current_key_index + 1
    if next_idx >= len(AVAILABLE_API_KEYS):
        logging.warning(
            "API key rotation: all %d key(s) exhausted — falling back to rule engine.",
            len(AVAILABLE_API_KEYS),
        )
        return False
    _current_key_index = next_idx
    GOOGLE_API_KEY = AVAILABLE_API_KEYS[next_idx]
    os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY
    logging.info(
        "API key rotated to slot %d/%d.",
        next_idx + 1,
        len(AVAILABLE_API_KEYS),
    )
    return True


def current_api_key() -> str:
    """Return the API key currently in use (for diagnostics only — never log it)."""
    return GOOGLE_API_KEY


def mongo_configured() -> bool:
    uri = MONGODB_URI
    return bool(uri) and "<" not in uri and "your" not in uri.lower()


def gemini_configured() -> bool:
    if USE_VERTEX:
        return bool(GOOGLE_CLOUD_PROJECT)
    return bool(_valid_key(GOOGLE_API_KEY))


def backend_label() -> str:
    return "Vertex AI" if USE_VERTEX else "Google AI Studio"
