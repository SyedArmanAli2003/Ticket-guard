"""Pydantic request models for the TicketGuard API.

TicketGuard ingests a ticket-resale listing from one of four sources (raw text,
an uploaded PDF, an uploaded image, or a URL) and investigates it for scam risk.
The same payload shape drives both the streaming /api/investigate endpoint and
the synchronous /api/check endpoint.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class InvestigateRequest(BaseModel):
    """One ticket-resale listing to investigate.

    Exactly one of {text, file_b64, url} is required, matching ``type``:
      • type="text"          → text (the raw DM / post / pasted listing)
      • type="pdf"|"image"   → file_b64 (base64 or data-URI of the upload)
      • type="url"           → url (a listing / marketplace page to fetch)
    """

    type: Literal["text", "pdf", "image", "url"] = "text"
    text: Optional[str] = Field(default=None, max_length=20000)
    file_b64: Optional[str] = Field(default=None, description="base64 or data-URI for pdf/image")
    filename: Optional[str] = Field(default=None, max_length=400)
    content_type: Optional[str] = Field(default=None, max_length=200)
    url: Optional[str] = Field(default=None, max_length=2000)
    # Optional per-request AI model selector. Validated against the (Gemini-only)
    # models_registry so a bad id → 422; defaults to the primary model.
    model: Optional[str] = Field(default="gemini-2.5-flash")
    # Optional user identity — stored alongside investigations for history.
    user_id: Optional[str] = Field(default=None, max_length=200)
    session_id: Optional[str] = Field(default=None, max_length=200)

    @field_validator("model")
    @classmethod
    def _validate_model(cls, v: Optional[str]) -> str:
        from models_registry import DEFAULT_MODEL, MODELS
        if not v:
            return DEFAULT_MODEL
        if v not in MODELS:
            raise ValueError(f"Invalid model {v!r}. Choose from: {list(MODELS)}")
        return v

    @model_validator(mode="after")
    def _require_payload_for_type(self) -> "InvestigateRequest":
        if self.type == "text" and not (self.text and self.text.strip()):
            raise ValueError("type 'text' requires a non-empty 'text' field")
        if self.type == "url" and not (self.url and self.url.strip()):
            raise ValueError("type 'url' requires a 'url' field")
        if self.type in ("pdf", "image") and not (self.file_b64 and self.file_b64.strip()):
            raise ValueError(f"type '{self.type}' requires a 'file_b64' field")
        return self

    def to_source(self) -> dict:
        """Project to the internal ``source`` dict the pipeline expects."""
        return {
            "type": self.type,
            "text": self.text or "",
            "file_b64": self.file_b64 or "",
            "filename": self.filename or "",
            "content_type": self.content_type,
            "url": self.url or "",
        }


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """A follow-up conversation turn about a finished investigation.

    The client sends the running message history plus either the investigation
    `context` bundle it already has, or an `investigation_id` to load it from
    Atlas. `conversation_id` continues a persisted thread (set when Atlas is up).
    """

    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    context: Optional[dict] = Field(default=None, description="the investigation bundle (verdict/evidence/listing/...)")
    investigation_id: Optional[str] = Field(default=None, max_length=64)
    conversation_id: Optional[str] = Field(default=None, max_length=64)


class ReportRequest(BaseModel):
    """A user-submitted scam report — the change-stream source for /api/feed."""

    text: str = Field(min_length=3, max_length=4000, description="what happened")
    domain: Optional[str] = Field(default=None, max_length=400)
    handle: Optional[str] = Field(default=None, max_length=200)
    pattern_type: Optional[str] = Field(default=None, max_length=80)
    payment_method: Optional[str] = Field(default=None, max_length=40)
    barcode_or_ref: Optional[str] = Field(default=None, max_length=400)
    reporter: Optional[str] = Field(default="anonymous", max_length=120)

    def to_doc(self) -> dict:
        return self.model_dump(exclude_none=True)
