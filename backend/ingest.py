"""Multi-source ingestion for TicketGuard.

Turns any of {raw text, uploaded PDF, uploaded image, URL} into normalized text
plus optional extracted artifacts (PDF metadata, barcode digits, tamper hints),
then runs the REAL Gemini Normalizer to produce the structured listing object.

Everything degrades gracefully and NEVER crashes if an optional native library
is missing:
  • pypdf            — PDF text + metadata
  • beautifulsoup4   — HTML extraction
  • httpx            — URL fetch
  • Pillow           — open image bytes for Gemini vision
  • zxing-cpp/pyzbar — barcode decode (optional native lib); if absent we ask
                       Gemini to read any visible barcode digits instead.

The Normalizer itself is Gemini (gemini-2.5-flash) via the google-genai SDK —
testable WITHOUT Atlas. If the Gemini key is missing, normalize_* returns a
``{"status": "not_configured"}`` envelope.
"""

from __future__ import annotations

import base64
import io
import json
import re
from typing import Any

from google import genai
from google.genai import types

import config

# Optional dependencies — import lazily / defensively so missing native libs
# never break import or a request.
try:
    import pypdf  # type: ignore
except Exception:  # noqa: BLE001
    pypdf = None  # type: ignore

try:
    import httpx  # type: ignore
except Exception:  # noqa: BLE001
    httpx = None  # type: ignore

try:
    from bs4 import BeautifulSoup  # type: ignore
except Exception:  # noqa: BLE001
    BeautifulSoup = None  # type: ignore

try:
    from PIL import Image  # type: ignore  # noqa: F401  (presence check only)
    _PIL_OK = True
except Exception:  # noqa: BLE001
    _PIL_OK = False


_genai_client: genai.Client | None = None


def _gc() -> genai.Client | None:
    """Shared google-genai client (AI Studio or Vertex per config)."""
    global _genai_client
    if _genai_client is not None:
        return _genai_client
    if not config.gemini_configured():
        return None
    try:
        if config.USE_VERTEX:
            _genai_client = genai.Client(vertexai=True, project=config.GOOGLE_CLOUD_PROJECT,
                                         location=config.GOOGLE_CLOUD_LOCATION)
        else:
            _genai_client = genai.Client(api_key=config.GOOGLE_API_KEY)
        return _genai_client
    except Exception:  # noqa: BLE001
        return None


# --------------------------------------------------------------------------- #
# JSON parsing (Gemini may wrap in fences)
# --------------------------------------------------------------------------- #
def parse_json(text: str) -> dict | None:
    if not text:
        return None
    clean = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(clean)
    except Exception:  # noqa: BLE001
        pass
    m = re.search(r"\{.*\}", clean, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:  # noqa: BLE001
            return None
    return None


# Schema the Normalizer must emit — used both to instruct the model and to
# guarantee every key exists downstream.
_LISTING_KEYS = ["price", "face_value", "currency", "quantity", "payment_method",
                 "transfer_method", "seller_handle", "domain", "event",
                 "urgency_cues", "barcode_or_ref"]

_NORMALIZER_PROMPT = (
    "You are TicketGuard's LISTING NORMALIZER. Extract a single structured ticket-"
    "resale listing object from the content below. Infer only from the content; use "
    "null/empty when a field is truly absent. Capture each urgency/pressure cue in "
    "urgency_cues. Output ONLY one JSON object with EXACTLY these keys: "
    'price(number|null), face_value(number|null), currency(string|null), '
    'quantity(number|null), payment_method(one of: zelle, cashapp, venmo_friends, '
    'paypal_goods, crypto, wire, gift_card, bank_transfer, credit_card, official_app, '
    'unknown), transfer_method(one of: official_app, pdf, screenshot, barcode_image, '
    'email, in_person, unknown), seller_handle(string|null), domain(host string or ""), '
    'event(string|null), urgency_cues(array of strings), barcode_or_ref(string|null). '
    "No markdown, no prose.\n\n--- CONTENT ---\n"
)


def _ensure_keys(obj: dict) -> dict:
    """Guarantee the canonical listing shape (fill missing keys with defaults)."""
    out: dict[str, Any] = {}
    for k in _LISTING_KEYS:
        out[k] = obj.get(k, [] if k == "urgency_cues" else None)
    if not isinstance(out["urgency_cues"], list):
        out["urgency_cues"] = [str(out["urgency_cues"])] if out["urgency_cues"] else []
    if out["domain"] is None:
        out["domain"] = ""
    return out


# --------------------------------------------------------------------------- #
# Public: normalize from each source type. Returns:
#   {"status":"ok","listing":{...},"source":"text|pdf|image|url","extracted":{...}}
#   {"status":"not_configured","reason":"..."}              # Gemini key missing
#   {"status":"error","reason":"..."}                       # parse/IO failure
# --------------------------------------------------------------------------- #
def normalize_text(text: str, extracted: dict | None = None,
                   source: str = "text", model: str | None = None) -> dict:
    """Run the Gemini Normalizer on plain text. The shared core for all sources."""
    client = _gc()
    if client is None:
        return {"status": "not_configured", "reason": "Gemini key missing (GOOGLE_API_KEY)"}
    if not text or not text.strip():
        return {"status": "error", "reason": "empty content"}
    try:
        resp = client.models.generate_content(
            model=model or config.GEMINI_MODEL,
            contents=_NORMALIZER_PROMPT + text.strip()[:8000],
            config=types.GenerateContentConfig(
                temperature=0.0,
                response_mime_type="application/json",
            ),
        )
        obj = parse_json(resp.text or "")
        if obj is None:
            return {"status": "error", "reason": "normalizer returned non-JSON"}
        listing = _ensure_keys(obj)
        # Carry through a barcode we decoded ourselves if Gemini missed it.
        if extracted and extracted.get("barcode") and not listing.get("barcode_or_ref"):
            listing["barcode_or_ref"] = extracted["barcode"]
        return {"status": "ok", "listing": listing, "source": source,
                "extracted": extracted or {}}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": str(exc)[:160]}


def normalize_pdf(pdf_bytes: bytes, model: str | None = None) -> dict:
    """Extract PDF text + metadata (pypdf), then run the Gemini Normalizer."""
    text, meta, tamper = "", {}, []
    if pypdf is not None:
        try:
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
            md = reader.metadata or {}
            meta = {k.lstrip("/"): str(v) for k, v in dict(md).items()}
            # Lightweight tamper heuristics on PDF metadata.
            producer = (meta.get("Producer", "") + " " + meta.get("Creator", "")).lower()
            if any(t in producer for t in ("photoshop", "gimp", "canva", "illustrator")):
                tamper.append(f"PDF produced by image editor ({producer.strip()}).")
            if meta.get("ModDate") and meta.get("CreationDate") \
                    and meta["ModDate"] != meta["CreationDate"]:
                tamper.append("PDF modified after creation (CreationDate != ModDate).")
        except Exception as exc:  # noqa: BLE001
            return {"status": "error", "reason": f"pdf parse failed: {str(exc)[:120]}"}
    else:
        return {"status": "error", "reason": "pypdf not installed"}

    extracted = {"pdf_metadata": meta, "tamper_hints": "; ".join(tamper) or None,
                 "text_chars": len(text)}
    if not text.strip():
        # Scanned PDF with no text layer — hand the raw bytes to Gemini as a file.
        return _normalize_binary(pdf_bytes, "application/pdf", extracted, "pdf", model)
    return normalize_text(text, extracted, "pdf", model)


def normalize_image(image_bytes: bytes, mime: str = "image/png",
                    model: str | None = None) -> dict:
    """Gemini 2.5 multimodal OCR/parse of an image + tamper hints + barcode digits."""
    barcode = decode_barcode(image_bytes)
    extracted: dict[str, Any] = {"barcode": barcode}
    client = _gc()
    if client is None:
        return {"status": "not_configured", "reason": "Gemini key missing (GOOGLE_API_KEY)"}
    try:
        prompt = (
            _NORMALIZER_PROMPT +
            "(The content is an IMAGE — a ticket, digital wallet pass, or screenshot of a "
            "DM / WhatsApp / iMessage conversation. You are a forensic image analyst. "
            "OCR all visible text precisely. Read any visible barcode or QR code digits into "
            "barcode_or_ref. If this is a chat screenshot, capture manipulative language, "
            "urgency pressure, or refusal to use safe payment methods in urgency_cues. "
            "If this is a ticket or wallet-pass image, note any visual anomalies — mismatched "
            "fonts, blurring / JPEG artifacts around seat, row, or section numbers indicating "
            "Photoshop editing, inconsistent spacing, cloned regions, or a generic "
            "Ticketmaster / AXS template used fraudulently — also in urgency_cues as red flags.)"
        )
        resp = client.models.generate_content(
            model=model or config.GEMINI_MODEL,
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime), prompt],
            config=types.GenerateContentConfig(temperature=0.0,
                                               response_mime_type="application/json"),
        )
        obj = parse_json(resp.text or "")
        if obj is None:
            return {"status": "error", "reason": "image normalizer returned non-JSON"}
        listing = _ensure_keys(obj)
        if barcode and not listing.get("barcode_or_ref"):
            listing["barcode_or_ref"] = barcode

        # Separate Gemini call for tamper hints (vision), best-effort.
        extracted["tamper_hints"] = _image_tamper_hints(client, image_bytes, mime)
        return {"status": "ok", "listing": listing, "source": "image", "extracted": extracted}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": str(exc)[:160]}


def normalize_url(url: str, model: str | None = None) -> dict:
    """Fetch a URL (httpx), extract readable text (BeautifulSoup), then normalize."""
    if httpx is None:
        return {"status": "error", "reason": "httpx not installed"}
    try:
        with httpx.Client(follow_redirects=True, timeout=15.0,
                          headers={"User-Agent": "TicketGuard/1.0 (+scam-risk-check)"}) as cx:
            r = cx.get(url)
            r.raise_for_status()
            html = r.text
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": f"fetch failed: {str(exc)[:120]}"}

    if BeautifulSoup is not None:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            text = re.sub(r"\n{3,}", "\n\n", soup.get_text("\n")).strip()
        except Exception:  # noqa: BLE001
            text = html
    else:
        text = re.sub(r"<[^>]+>", " ", html)

    host = re.sub(r"^https?://", "", url).split("/")[0]
    result = normalize_text(text, {"url": url, "fetched_chars": len(text)}, "url", model)
    # Ensure the real fetched domain wins over any model guess.
    if result.get("status") == "ok":
        result["listing"]["domain"] = host
    return result


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _normalize_binary(data: bytes, mime: str, extracted: dict, source: str,
                      model: str | None = None) -> dict:
    """Hand raw bytes (e.g. scanned PDF) to Gemini for OCR + extraction."""
    client = _gc()
    if client is None:
        return {"status": "not_configured", "reason": "Gemini key missing (GOOGLE_API_KEY)"}
    try:
        resp = client.models.generate_content(
            model=model or config.GEMINI_MODEL,
            contents=[types.Part.from_bytes(data=data, mime_type=mime),
                      _NORMALIZER_PROMPT + "(OCR the attached document.)"],
            config=types.GenerateContentConfig(temperature=0.0,
                                               response_mime_type="application/json"),
        )
        obj = parse_json(resp.text or "")
        if obj is None:
            return {"status": "error", "reason": "binary normalizer returned non-JSON"}
        return {"status": "ok", "listing": _ensure_keys(obj), "source": source,
                "extracted": extracted}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": str(exc)[:160]}


def _image_tamper_hints(client: genai.Client, image_bytes: bytes, mime: str) -> str | None:
    """Ask Gemini vision for visual tamper hints. Best-effort, never raises."""
    try:
        resp = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime),
                      "You are a forensic image analyst looking for ticket scams. "
                      "If this is a screenshot of a DM or WhatsApp / iMessage chat, look for "
                      "manipulative language, urgency cues, or refusal to use safe payment "
                      "methods. "
                      "If this is a picture of a ticket or a digital wallet pass, look for "
                      "visual anomalies: mismatched fonts, blurring or JPEG compression "
                      "artifacts around the section / row / seat numbers that may indicate "
                      "Photoshop editing, inconsistent character spacing, cloned or copy-pasted "
                      "regions, or a generic Ticketmaster / AXS template used fraudulently. "
                      "List each specific red flag you observe as a short bullet. "
                      "Reply 'none' if the image appears authentic."],
            config=types.GenerateContentConfig(temperature=0.0),
        )
        txt = (resp.text or "").strip()
        return None if txt.lower().startswith("none") else txt[:200]
    except Exception:  # noqa: BLE001
        return None


def decode_barcode(image_bytes: bytes) -> str | None:
    """Best-effort barcode/QR decode.

    Tries zxing-cpp then pyzbar. If neither native lib is available (or decode
    fails), returns None — the image Normalizer then reads visible digits via
    Gemini. MUST NOT raise on a missing native library.
    """
    if not _PIL_OK:
        return None
    try:
        from PIL import Image  # local import to avoid hard dep at module load
        img = Image.open(io.BytesIO(image_bytes))
    except Exception:  # noqa: BLE001
        return None

    # zxing-cpp (preferred)
    try:
        import zxingcpp  # type: ignore
        results = zxingcpp.read_barcodes(img)
        if results:
            return results[0].text
    except Exception:  # noqa: BLE001
        pass

    # pyzbar (fallback)
    try:
        from pyzbar.pyzbar import decode as zbar_decode  # type: ignore
        res = zbar_decode(img)
        if res:
            return res[0].data.decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        pass

    return None


def decode_file(file_bytes: bytes, filename: str, content_type: str | None,
                model: str | None = None) -> dict:
    """Route an uploaded file to the right normalizer by type."""
    ct = (content_type or "").lower()
    name = (filename or "").lower()
    if ct == "application/pdf" or name.endswith(".pdf"):
        return normalize_pdf(file_bytes, model)
    if ct.startswith("image/") or name.rsplit(".", 1)[-1] in {"png", "jpg", "jpeg", "webp", "gif"}:
        mime = ct if ct.startswith("image/") else "image/png"
        return normalize_image(file_bytes, mime, model)
    # Unknown: treat as UTF-8 text.
    try:
        return normalize_text(file_bytes.decode("utf-8", "ignore"), {"filename": filename}, "text", model)
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": f"unsupported file: {str(exc)[:100]}"}


def b64_to_bytes(data_b64: str) -> bytes:
    """Decode a base64 (optionally data-URI) payload to bytes."""
    if "," in data_b64 and data_b64.strip().startswith("data:"):
        data_b64 = data_b64.split(",", 1)[1]
    return base64.b64decode(data_b64)
