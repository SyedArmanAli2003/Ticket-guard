# TicketGuard — Backend (Google ADK + Gemini + MongoDB)

**TicketGuard is a multi-agent ticket-resale SCAM-RISK investigator.** Paste a
DM / post, upload a PDF or screenshot, or drop a listing URL, and a team of
**Gemini specialists** (Google **ADK**) investigates it for fraud signals —
grounded in **MongoDB Atlas** (Vector Search + Atlas Search full-text) and the
official **MongoDB MCP server** (read-only) — streaming every step over
Server-Sent Events.

The verdict vocabulary is deliberately **risk-signal only**:
`SCAM | SUSPICIOUS | LIKELY-LEGIT` with a confidence (0–1), evidence bullets, and
plain-English reasoning. TicketGuard **never** calls a ticket "authentic" or
"genuine" — it speaks only in terms of risk.

> Built for the Google Cloud Rapid Agent Hackathon 2026 — **MongoDB track**.

## No-fabrication guarantee

Unlike a demo with canned data, **every DB-dependent step returns an explicit
`not_configured` status when Atlas is unreachable or the Gemini key is missing.**
Static rows are NEVER used to fake a verdict. Synthetic data is used only to
*seed* the corpus you search against — the investigation itself is always live.

## The investigation pipeline

The coordinator (`pipeline.py`) runs an 8-step investigation, threading the
accumulating evidence and streaming each step:

| # | Step | Engine | Grounding |
|---|------|--------|-----------|
| 1 | **Normalizer** | Gemini `LlmAgent` (structured extraction) | — |
| 2 | **Hybrid Retrieval** | Atlas `$vectorSearch` + `$search`, fused | `scam_corpus` |
| 3 | **Reputation** | typosquat edit-distance + prior-report aggregation | `reports` |
| 4 | **Forgery / Duplicate** | `sha256(barcode/ref)` lookup + PDF/image tamper hints | `tickets_seen` |
| 5 | **Risk Scorer** | server-side `$group`/`$facet` aggregation (NOT the LLM) | Atlas |
| 6 | **Official-Transfer Rules** | deterministic rule engine | `official_rules` |
| 7 | **Verdict Writer** | Gemini `LlmAgent`, grounded ONLY on gathered evidence | — |
| 8 | **Persist** | explicit pymongo write | `investigations` |

- **Fusion** uses native `$rankFusion` on MongoDB **8.1+**, otherwise
  reciprocal-rank fusion in code — the path that ran is logged and reported.
- **Step 5 scores in the database**, not the model: signal weights are combined
  by a `$facet`/`$switch` aggregation so the score is reproducible and auditable.
- The **risk score is computed server-side**; the Verdict Writer only *explains*
  the evidence (and lowers confidence when a signal is `not_configured`).

## Multi-source ingestion (`ingest.py`)

| Source | How |
|--------|-----|
| **text** | Gemini structured-JSON extraction |
| **pdf** | `pypdf` text + metadata (tamper heuristics) → Gemini; scanned PDFs go to Gemini OCR |
| **image** | Gemini 2.5 multimodal OCR/parse + a vision tamper-hint pass; barcode decode (zxing-cpp) with Gemini digit-reading fallback |
| **url** | `httpx` fetch → `BeautifulSoup` text → Gemini; the real fetched host wins over any model guess |

Every optional native library (`pypdf`, `bs4`, `httpx`, `Pillow`, `zxing-cpp`) is
imported defensively — a missing lib degrades gracefully and never crashes a
request.

## Stack

- **FastAPI** + Uvicorn — HTTP + SSE streaming
- **Google ADK** (`google-adk`) — multi-agent orchestration (`LlmAgent`, `InMemoryRunner`)
- **Gemini** via `google-genai` — AI Studio (dev) or **Vertex AI** (submission); model `gemini-2.5-flash`, embeddings `text-embedding-004` (768-dim)
- **MongoDB Atlas** — Vector Search + Atlas Search over `scam_corpus`, the official **MongoDB MCP server** (read-only), and the **PyMongo async driver** for the `/api/feed` change stream
- **pymongo** (sync) for all request-time reads/writes; **`AsyncMongoClient`** (pymongo ≥4.9) for the live feed — *not* Motor

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/investigate` | Run the investigation; **stream** each step + tool activity as SSE. |
| POST | `/api/check` | Run to completion; return a **single JSON verdict** (for embedding / API use). |
| POST | `/api/report` | Write a user scam report (explicit pymongo write → `reports`). |
| GET | `/api/feed` | **Live SSE** of new reports via a real MongoDB change stream. |
| GET | `/api/health` | Live booleans: `gemini` / `atlas` / `mcp` / `gmail`(=false) + `cluster_version` + `rankfusion_capable`. |
| GET | `/api/mcp/info` | Honest description of the MongoDB MCP + hybrid-retrieval integration. |
| GET | `/health` | Minimal liveness probe. |

All SSE responses set `Cache-Control: no-cache` and `X-Accel-Buffering: no`. CORS
is open by default (set `CORS_ORIGINS` to restrict).

### `POST /api/investigate` request

```json
{ "type": "text", "text": "Selling 2 World Cup tickets, Zelle only, PDF after payment..." }
{ "type": "url",  "url": "https://example.test/listing/123" }
{ "type": "pdf",  "file_b64": "<base64 or data-URI>", "filename": "ticket.pdf", "content_type": "application/pdf" }
{ "type": "image","file_b64": "<base64 or data-URI>", "filename": "screenshot.png", "content_type": "image/png" }
```

### SSE event shapes (`data: <json>\n\n`)

```jsonc
// per-step
{ "step": 1, "name": "Normalize Listing", "status": "running" }
{ "step": 1, "name": "Normalize Listing", "status": "complete",
  "data": { "listing": { /* normalized listing */ }, "source": "text", "extracted": { /* pdf_metadata, tamper_hints, barcode */ } } }

// a DB-dependent step with Atlas down
{ "step": 2, "name": "Hybrid Retrieval", "status": "not_configured", "data": { "reason": "atlas_unreachable" } }

// tool activity (interleaved)
{ "type": "tool", "step": 2, "tool": "atlas_hybrid_search", "source": "reciprocal_rank_fusion" }

// finalize
{ "step": 99, "name": "Saved", "status": "complete",
  "data": { "verdict": "SCAM", "confidence": 0.93, "investigation_id": "…",
            "risk_score": 88, "engine": "gemini-2.5-flash · Google AI Studio" } }
```

Step numbers: 1 Normalize, 2 Retrieval, 3 Reputation, 4 Forgery/Duplicate,
5 Risk Scorer, 6 Official-Transfer Rules, 7 Verdict, 8 Persist, **99 finalize**.
`status` ∈ `running | complete | not_configured | error`.

### `POST /api/check` response

```jsonc
{
  "status": "ok",
  "verdict": "SCAM",                       // SCAM | SUSPICIOUS | LIKELY-LEGIT
  "confidence": 0.93,                       // 0.0–1.0
  "evidence": ["Price $120 is 34% of face $350.", "Payment via zelle removes buyer protection.", "..."],
  "reasoning": "2–4 plain-English sentences grounded in the evidence.",
  "risk_score": 88,                         // server-computed; null if Atlas down
  "listing": { /* normalized listing */ },
  "investigation_id": "665…",               // "no-db" string if Atlas down
  "steps": [ { "step": 1, "name": "Normalize Listing", "status": "complete" }, ... ],
  "engine": "gemini-2.5-flash · Google AI Studio"
}
```

On a hard stop (no Gemini key → can't normalize; or the verdict step failed):

```json
{ "status": "not_configured", "reason": "Gemini key missing (GOOGLE_API_KEY)", "step": 1 }
```

### `POST /api/report` request / response

```json
{ "text": "Lost $240 to a Zelle ticket seller", "domain": "tikcetmaster-resale.test",
  "handle": "@ticket_deals_77", "pattern_type": "too_good_price", "barcode_or_ref": "BARCODE-558122997431" }
```
→ `{ "status": "ok", "report_id": "665…" }`  (or `{"status":"not_configured","reason":"…"}`)

### `GET /api/feed` SSE frames

```jsonc
{ "type": "hello",  "status": "ok", "recent": [ /* last 20 reports */ ] }   // initial backfill
{ "type": "report", "status": "ok", "report": { /* newly inserted */ } }    // per change-stream insert
{ "type": "feed",   "status": "not_configured", "reason": "…" }             // stream can't open (Atlas down / not a replica set)
```

## Environment (`.env`)

```bash
# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ticketguard

# Gemini — dev (AI Studio): key + USE_VERTEXAI=FALSE
GOOGLE_API_KEY=                      # or GEMINI_API_KEY
GOOGLE_GENAI_USE_VERTEXAI=FALSE
GEMINI_MODEL=gemini-2.5-flash        # HARD RULE: core model is gemini-2.5-flash
EMBED_MODEL=text-embedding-004
EMBED_DIMS=768

# Gemini — submission (Vertex AI): set these instead
# GOOGLE_GENAI_USE_VERTEXAI=TRUE
# GOOGLE_CLOUD_PROJECT=your-project
# GOOGLE_CLOUD_LOCATION=us-central1

# Server
PORT=8000
CORS_ORIGINS=                        # comma-separated; omit for *
```

If a password contains special characters (`@ : / ? # %`), percent-encode them.

## Atlas one-time setup

Everything is created and seeded by the idempotent bootstrap script:

```bash
python scripts/setup_atlas.py
```

It will (safe to re-run):
1. create the collections — `scam_corpus`, `tickets_seen`, `reports`, `investigations`, `official_rules`;
2. create the **vector index** (`embedding`, 768 dims, cosine) and the **Atlas Search** text index;
3. seed `scam_corpus` from `data/scam_corpus.json` **with real Gemini embeddings** (it refuses to seed fake/zero vectors if the key is missing);
4. seed `official_rules` and a few demo `tickets_seen` barcode hashes;
5. print a summary + collection counts.

Atlas Search indexes build asynchronously — give them a minute before querying.
The `/api/feed` change stream requires a replica set (Atlas clusters are; a
standalone local mongod is not — it will report `not_configured`).

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env            # then fill it in
python scripts/setup_atlas.py     # one-time Atlas bootstrap (needs Gemini key for embeddings)
uvicorn main:app --reload --port 8000
```

Check it: `GET http://localhost:8000/api/health` →
`{"gemini": true, "atlas": true, "mcp": true, ...}` means everything is live.
`atlas: false` with `bad auth` means the `MONGODB_URI` credentials are wrong.

Gemini-only smoke test (no Atlas, single Gemini call): `python _smoke_pipeline.py`.

## Deploy to Google Cloud Run

The `Dockerfile` uses a `node:20` base (so the MongoDB MCP server runs) with
Python on top, and pre-installs `mongodb-mcp-server`.

```bash
gcloud run deploy ticketguard-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 600 \
  --min-instances 1 \
  --set-env-vars "MONGODB_DB=ticketguard,GOOGLE_GENAI_USE_VERTEXAI=FALSE,GEMINI_MODEL=gemini-2.5-flash" \
  --set-secrets "MONGODB_URI=ticketguard-mongo-uri:latest,GOOGLE_API_KEY=ticketguard-gemini-key:latest"
```

For the submission, flip to **Vertex AI** (`GOOGLE_GENAI_USE_VERTEXAI=TRUE` +
project/location) so all inference runs on Google Cloud — no code change needed.

## Deferred (intentionally stubbed)

- **Gmail OAuth ingestion** — `/api/health` reports `gmail: false`; not built.
- **TicketGuard exposed as its own MCP server** — `/api/mcp/info` reports
  `ticketguard_as_mcp_server: false`. (TicketGuard *consumes* the MongoDB MCP
  server read-only; it does not yet *publish* one.)

## Notes

- Gemini calls run inside ADK; transient `429/503` errors are retried with backoff.
  A `RequestsPerDay` quota error is treated as terminal (not retried).
- MCP is **read-only**; all writes (`reports`, `investigations`, `tickets_seen`)
  go through the explicit pymongo path in `db.py`.
