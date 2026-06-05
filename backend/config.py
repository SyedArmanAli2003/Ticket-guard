"""Central configuration for the PitchCraft agent backend.

All Gemini access goes through the `google-genai` SDK. Two backends are
supported and selected by env:

  • AI Studio  (dev)        — GOOGLE_GENAI_USE_VERTEXAI=FALSE + GOOGLE_API_KEY
  • Vertex AI  (submission) — GOOGLE_GENAI_USE_VERTEXAI=TRUE  + GOOGLE_CLOUD_PROJECT
                              + GOOGLE_CLOUD_LOCATION

The hackathon requires Google Cloud AI; the hosted/submitted build must run on
the Vertex backend. Flip the env vars — no code change needed.
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

# Verified available on the project's key (2026-06): gemini-2.5-flash is the
# strongest GA Flash model. Do NOT use gemini-3.x (not available) or 1.5/2.0
# (retired / quota-limited). Override with GEMINI_MODEL if needed.
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
MONGODB_DB: str = os.getenv("MONGODB_DB", "pitchcraft")

COLL_PLANS = "business_plans"
COLL_CORPUS = "market_corpus"           # vector-searchable market intelligence
VECTOR_INDEX = "market_vector_index"
VECTOR_PATH = "embedding"
VECTOR_TOPK = int(os.getenv("VECTOR_TOPK", "4"))


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
