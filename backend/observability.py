"""Arize Phoenix observability for TicketGuard.

Traces every Gemini call and every investigation step via OpenTelemetry, exported
to Arize Phoenix (cloud or self-hosted) over OTLP/HTTP.

Design notes (why this differs slightly from a textbook setup):
  • The 8 pipeline steps are NOT separate functions — they are inline blocks in a
    single async generator (``pipeline.run_investigation``). A function decorator
    can't wrap an ``async def`` generator cleanly, so the ergonomic primitive here
    is the ``step_span`` context manager, used inline around each step's compute.
  • Every Gemini ``generate_content`` / ``embed_content`` call is captured for free
    by ``GoogleGenAIInstrumentor`` — no per-call code needed.
  • All helpers degrade to harmless no-op spans when Phoenix is not configured:
    ``trace.get_tracer`` returns a no-op tracer until a provider is installed, so
    importing/using these never crashes the app.

Env:
  PHOENIX_API_KEY    — enables export. Unset → tracing disabled (warns, no crash).
  PHOENIX_BASE_URL   — default https://app.phoenix.arize.com
  PHOENIX_PROJECT    — default "ticketguard"
"""

from __future__ import annotations

import os
import logging
from contextlib import contextmanager
from functools import wraps

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from openinference.instrumentation.google_genai import GoogleGenAIInstrumentor

logger = logging.getLogger(__name__)

# A real tracer once init_phoenix() installs a provider; a no-op tracer before
# that (so the helpers below are always safe to call).
tracer = trace.get_tracer("ticketguard")

_initialized = False


def init_phoenix() -> None:
    """Initialize Arize Phoenix tracing. Call once at app startup.

    Gracefully no-ops if PHOENIX_API_KEY is not set, and never raises — observability
    must not be able to take down the investigation API.
    """
    global _initialized
    if _initialized:
        return

    api_key = os.getenv("PHOENIX_API_KEY")
    base_url = os.getenv("PHOENIX_BASE_URL", "https://app.phoenix.arize.com").rstrip("/")
    project = os.getenv("PHOENIX_PROJECT", "ticketguard")

    if not api_key:
        logger.warning("PHOENIX_API_KEY not set — Arize Phoenix tracing disabled")
        return

    try:
        # Phoenix routes spans to a project via the resource attribute
        # `openinference.project.name`; auth is the `api_key` header.
        resource = Resource(attributes={
            "openinference.project.name": project,
            "service.name": "ticketguard",
        })
        exporter = OTLPSpanExporter(
            endpoint=f"{base_url}/v1/traces",
            headers={"api_key": api_key},
        )
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Rebind our module tracer to the now-configured provider.
        global tracer
        tracer = trace.get_tracer("ticketguard")

        # Auto-instrument every google-genai call (Gemini generate_content +
        # embed_content): input prompt, output, token counts — all for free.
        GoogleGenAIInstrumentor().instrument()

        _initialized = True
        logger.info(f"Arize Phoenix tracing enabled → {base_url} project={project}")
        print(f"📡 Arize Phoenix tracing enabled → {base_url} project={project}")
    except Exception as e:  # noqa: BLE001 — never crash the app on observability failure
        logger.error(f"Arize Phoenix init failed: {e}")
        print(f"⚠️  Arize Phoenix init failed ({str(e)[:120]}) — continuing without tracing")


def is_enabled() -> bool:
    """True once Phoenix export is live (PHOENIX_API_KEY present + init succeeded)."""
    return _initialized


@contextmanager
def step_span(step_number: int, step_name: str):
    """Trace one investigation step as a span.

    Used inline inside the async generator, wrapping ONLY a step's compute (the
    ``await``), not the surrounding SSE ``yield`` — so the span duration reflects
    real work, and any Gemini / MongoDB child spans created during that await nest
    underneath it.

        with step_span(2, "Hybrid Retrieval"):
            retrieval = await asyncio.to_thread(db.hybrid_search, query)
    """
    name = f"step_{step_number}_{step_name.lower().replace(' ', '_').replace('/', '_')}"
    with tracer.start_as_current_span(name) as span:
        span.set_attribute("step.number", step_number)
        span.set_attribute("step.name", step_name)
        try:
            yield span
            span.set_attribute("step.status", "complete")
        except Exception as e:  # noqa: BLE001
            span.set_attribute("step.status", "error")
            span.set_attribute("step.error", str(e)[:200])
            raise


def trace_investigation(investigation_id: str, idea: str = ""):
    """Open the parent span that wraps a full 8-step investigation.

    Returns a current-span context manager; use it around the whole run so every
    step span nests under one "investigation" trace.
    """
    return tracer.start_as_current_span(
        "investigation",
        attributes={
            "investigation.id": investigation_id,
            "investigation.input_length": len(idea or ""),
        },
    )


def trace_step(step_number: int, step_name: str):
    """Decorator form of step tracing — for any step that IS a standalone async
    function. (TicketGuard's steps are inline generator blocks, so the pipeline
    uses ``step_span`` instead; this is kept for future refactors.)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with step_span(step_number, step_name):
                return await func(*args, **kwargs)
        return wrapper
    return decorator
