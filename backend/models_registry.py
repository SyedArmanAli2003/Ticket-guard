"""Model registry for TicketGuard multi-model support — GEMINI-ONLY by design.

COMPLIANCE: the Google Cloud Rapid Agent Hackathon (MongoDB track) requires the
core AI to be Google Gemini ONLY (see HANDOFF.md §10 and config.py's HARD RULE).
So every model registered here is a Gemini variant served through the SAME
google-genai path the rest of the backend already uses. There is intentionally
NO non-Google provider (no NVIDIA / OpenAI / Llama / DeepSeek).

Why tiers, then? Two reasons:
  1. A per-request model picker (the frontend can offer the user a choice).
  2. Automatic fallback for resilience: each Gemini model has its OWN free-tier
     quota bucket, so when ``gemini-2.5-flash`` hits its daily limit the pipeline
     can fail over to ``gemini-2.5-flash-lite`` and keep working — without ever
     leaving Google/Gemini.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ModelTier(Enum):
    PRIMARY = 0    # gemini-2.5-flash — always tried first (hackathon core model)
    FALLBACK1 = 1  # gemini-2.5-flash-lite — separate quota bucket, fast/cheap
    FALLBACK2 = 2  # gemini-2.5-pro — highest-quality reasoning


@dataclass
class ModelConfig:
    id: str
    display_name: str
    tier: ModelTier
    provider: str          # always "google" — Gemini-only by design
    max_tokens: int
    description: str
    speed: str             # "fastest" | "fast" | "powerful"
    context_window: str    # human-readable, e.g. "1M tokens"
    best_for: str          # short use-case label for the UI picker


# All Gemini, all via google-genai. Kept to the 2.5 family per config.py's note
# ("do not use gemini-3.x / 1.5 / 2.0").
MODELS: dict[str, ModelConfig] = {
    "gemini-2.5-flash": ModelConfig(
        id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        tier=ModelTier.PRIMARY,
        provider="google",
        max_tokens=8192,
        description="Default — best speed/accuracy balance",
        speed="fastest",
        context_window="1M tokens",
        best_for="Most investigations",
    ),
    "gemini-2.5-flash-lite": ModelConfig(
        id="gemini-2.5-flash-lite",
        display_name="Gemini 2.5 Flash Lite",
        tier=ModelTier.FALLBACK1,
        provider="google",
        max_tokens=8192,
        description="Lighter — activates on quota fallback",
        speed="fast",
        context_window="1M tokens",
        best_for="High-volume / quota saving",
    ),
    "gemini-2.5-pro": ModelConfig(
        id="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro",
        tier=ModelTier.FALLBACK2,
        provider="google",
        max_tokens=8192,
        description="Most powerful — slower, deepest reasoning",
        speed="powerful",
        context_window="2M tokens",
        best_for="Complex PDFs, ambiguous cases",
    ),
}

DEFAULT_MODEL = "gemini-2.5-flash"

# Default tier order. Overridable via MODEL_FALLBACK_ORDER in .env, but any id not
# in MODELS (e.g. a non-Google model someone tries to slip in) is DROPPED — a
# small compliance guardrail so the registry stays Gemini-only.
_DEFAULT_ORDER = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]


def _load_order() -> list[str]:
    raw = os.getenv("MODEL_FALLBACK_ORDER", "")
    requested = [m.strip() for m in raw.split(",") if m.strip()] if raw else []
    order = [m for m in requested if m in MODELS]      # drop anything non-Gemini
    for m in _DEFAULT_ORDER:                            # ensure every tier is present
        if m in MODELS and m not in order:
            order.append(m)
    return order or list(MODELS.keys())


FALLBACK_ORDER: list[str] = _load_order()


def get_model(model_id: str) -> ModelConfig:
    if model_id not in MODELS:
        raise ValueError(f"Unknown model: {model_id!r}. Choose from: {list(MODELS)}")
    return MODELS[model_id]


def is_valid(model_id: str) -> bool:
    return model_id in MODELS


def fallback_chain(preferred: Optional[str]) -> list[str]:
    """Ordered models to try: the preferred model first, then the remaining tiers."""
    pref = preferred if preferred in MODELS else DEFAULT_MODEL
    return [pref] + [m for m in FALLBACK_ORDER if m != pref]


def get_all_models() -> list[dict]:
    """UI-facing list. ``available`` reflects whether the Google key is configured
    (every model is Gemini, so they share the same credential)."""
    import config  # local import keeps this module import-cheap / cycle-free
    gemini_ok = config.gemini_configured()
    return [
        {
            "id": m.id,
            "display_name": m.display_name,
            "tier": m.tier.value,
            "provider": m.provider,
            "max_tokens": m.max_tokens,
            "description": m.description,
            "speed": m.speed,
            "context_window": m.context_window,
            "best_for": m.best_for,
            "is_primary": m.tier == ModelTier.PRIMARY,
            "available": gemini_ok,
        }
        for m in MODELS.values()
    ]
