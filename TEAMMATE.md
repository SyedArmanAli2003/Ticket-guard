# TicketGuard — New Teammate Onboarding Guide

Welcome to the team. This document is your single source of truth for understanding
TicketGuard — what it is, why we built it, how it works under the hood, how to run it,
and what the rules are for the hackathon submission. Read it top to bottom once; after
that it works as a reference you can jump back to.

---

## 1. The Problem We're Solving

Every major event triggers a wave of ticket-resale fraud. The FBI, FTC, and Better
Business Bureau have all issued active warnings specifically around the **2026 FIFA
World Cup** — a highly predictable, months-long scam season. The pattern is the same
every time:

- Scammer posts plausible-looking listing (or DMs a buyer directly).
- Demands Zelle / Venmo / Cash App — irreversible payment methods with no chargeback.
- Sends a screenshot, PDF, or barcode image that looks real but is Photoshopped.
- Disappears after payment.

Buyers have **zero tools to investigate before they pay.** Platforms only act
after fraud is reported. There is no consumer-grade real-time risk checker.

**TicketGuard fills that gap.** A buyer pastes a suspicious listing or DM, uploads a
ticket PDF/screenshot, or drops a URL — and gets back a risk verdict in seconds:

> `SCAM · SUSPICIOUS · LIKELY-LEGIT`

with a confidence score, cited evidence, and a shareable public report link.

---

## 2. Why This Project for This Hackathon

The hackathon is the **Google Cloud Rapid Agent Hackathon — MongoDB Track (June 2026).**

The requirements are:
1. Multi-step Gemini agent (not just a chatbot).
2. Meaningful integration of the official **MongoDB MCP server**.
3. Deep MongoDB use (Vector Search, aggregations, change streams).
4. Hosted, open-source, real demo.

TicketGuard is a perfect fit because:

| Requirement | How TicketGuard satisfies it |
|---|---|
| Gemini agent, multi-step mission | 8 discrete specialist steps (not a single LLM call) |
| MongoDB MCP server | Agent calls the official `mongodb-mcp-server` via stdio for read-only Atlas lookups |
| Deep MongoDB usage | `$vectorSearch` + `$search` hybrid retrieval · server-side `$group`/`$facet` risk scoring · change streams for live feed · `sha256` barcode dedup |
| Human in the loop | Report listing → writes to Atlas → changes stream into the global corpus |
| Multimodal | Gemini Vision reads uploaded screenshots and ticket images with forensic analysis |
| Honest by design | Every DB-dependent step returns `not_configured` instead of faking — judges can verify |

Additionally, **the problem is real and emotionally resonant** — everyone has a friend
or family member who has been scammed buying event tickets. That narrative land well in
demos and judge evaluations.

---

## 3. Impact

- **Consumer protection at submit time** — risk signal delivered before the buyer pays.
- **Network effect** — every "Report listing" click adds to the MongoDB scam corpus,
  making the next investigation smarter (human-in-the-loop flywheel).
- **Shareable public reports** — a buyer can send a `/report/{id}` link to a friend,
  group chat, or social media post as a warning.
- **Forensic image analysis** — Gemini Vision detects Photoshop artifacts, mismatched
  fonts, and DM manipulation patterns that text-only tools miss.
- **No vendor lock-in on risk signals** — the risk score is computed in MongoDB's query
  engine (`$group`/`$facet`), not hallucinated by the LLM. Reproducible and auditable.

---

## 4. Architecture Overview

```
Browser  ──── POST /api/investigate ────►  FastAPI (Python)
   ▲                                           │
   │  SSE stream (step 1…8 + tool events)      ▼
   │                                    Google ADK Pipeline
   │                                    ┌────────────────────────────────┐
   │                                    │  Step 1  Normalizer  (Gemini)  │
   │                                    │  Step 2  Hybrid Retrieval      │──► MongoDB Atlas
   │                                    │  Step 3  Reputation Check      │──► MongoDB Atlas
   │                                    │  Step 4  Forgery / Duplicate   │──► MongoDB Atlas
   │                                    │  Step 5  Risk Scorer           │──► MongoDB Atlas
   │                                    │  Step 6  Transfer Rules        │
   │                                    │  Step 7  Verdict Writer (Gemini│
   │                                    │  Step 8  Persist               │──► MongoDB Atlas
   │                                    └────────────────────────────────┘
   │
   └──── GET /api/feed (SSE change stream) ◄── MongoDB Atlas (watch reports)
```

The frontend consumes the SSE stream and animates each step in real time.
The risk score is computed **inside MongoDB** (not by the LLM), so it is
reproducible and auditable — a deliberate design choice that impresses judges.

---

## 5. The 8 Investigation Steps — Detailed

| # | Name | Engine | What it does |
|---|------|--------|-------------|
| 1 | **Normalizer** | Gemini structured extraction | Turns raw text/image/PDF/URL into a canonical listing object: price, face_value, payment_method, transfer_method, urgency_cues, barcode_or_ref, etc. |
| 2 | **Hybrid Retrieval** | Atlas `$vectorSearch` + `$search` | Finds the closest known scam/legit patterns. On MongoDB 8.1+ uses native `$rankFusion`. Below 8.1, fuses in Python with reciprocal-rank fusion. |
| 3 | **Reputation** | Typosquat + prior reports | Computes Levenshtein distance to official domains (ticketmaster.com, stubhub.com…). Aggregates `reports` collection for this seller/domain. |
| 4 | **Forgery / Duplicate** | sha256 barcode lookup | Hashes the barcode/booking-ref and checks `tickets_seen` — has this ticket been offered to multiple buyers? Also runs Gemini Vision forensic tamper hints on image uploads. |
| 5 | **Risk Scorer** | MongoDB `$group`/`$facet` | Assigns weights to gathered signals and aggregates a 0–100 score. **Score is computed by the database, never the LLM.** |
| 6 | **Transfer Rules** | Deterministic rule engine | Checks whether the payment + transfer method combination violates official-transfer rules (e.g. "Zelle + PDF = violation"). |
| 7 | **Verdict Writer** | Gemini reasoning | Synthesizes the gathered evidence into a final `SCAM / SUSPICIOUS / LIKELY-LEGIT` verdict with confidence (0–1) and cited evidence bullets. Only explains evidence — never invents numbers. |
| 8 | **Persist** | pymongo write | Saves the full investigation document to `investigations` collection. Returns an `investigation_id` used for sharing and chat memory. |

Any step that requires Atlas and finds it unreachable returns `status: "not_configured"` —
the UI shows this honestly. **No step ever fabricates a result.**

---

## 6. Full Feature List (Current State)

### Core
- Text paste, PDF upload, image upload, URL paste as investigation inputs.
- Gemini Vision forensic image analysis (DM screenshots, ticket images, wallet passes).
- Real-time SSE stream showing each step's status, tool activity, and data.
- Evidence-backed verdict card with risk gauge, rationale, evidence chips.
- Contribution bars (vector vs text retrieval scores) per evidence chip.

### Model Selector
- User can pick the Gemini model before submitting: Flash (default) · Flash Lite · Pro.
- Automatic fallback chain: Flash → Flash Lite → Pro on quota/rate-limit errors.
- The model used (and whether it was a fallback) is shown in the result card.

### Sharing
- Every real investigation gets a public shareable link: `/report/{investigation_id}`.
- "Share Report" button on the result card copies the link to clipboard.
- Share button on the history page too (per entry, if an investigation_id exists).
- `/report/[id]` is a standalone public page — no login required. Shows the verdict,
  rationale, evidence, and extracted listing details.

### Visual Forensics Badge
- When the user uploaded a file (image/PDF), the result card shows a **Visual Forensics**
  section explaining that Gemini Vision looked at the actual pixels — font consistency,
  JPEG artifacts around edited fields, chat manipulation patterns.

### Auth & History
- Register / login (MongoDB-backed, SHA-256 + salt).
- Every investigation auto-saved to per-user history (MongoDB first, localStorage fallback).
- History page: filter by risk level, search, re-investigate, share, delete.

### Live Feed
- Real-time scam-report feed powered by MongoDB Atlas change streams.
- "Report listing" from the result card writes to MongoDB → streams to all connected users.
- Backfills the 20 most recent reports on connect.

### Chat (Follow-up Q&A)
- After an investigation completes, a `ChatPanel` component lets users ask follow-up
  questions grounded in that investigation's context.
- Conversation turns are persisted to the `conversations` collection in Atlas.

### Admin
- `/api/admin/users` — list all registered users (auth-gated).
- Demo accounts seeded on startup: `admin@ticketguard.ai / admin123` and `demo@ticketguard.ai / demo123`.

---

## 7. Tech Stack

### Frontend
| Tool | Version / Notes |
|------|----------------|
| Next.js | 14, App Router |
| TypeScript | Strict |
| Tailwind CSS | Dark-first design tokens in `globals.css` |
| Framer Motion | Step animations, card entrances, contribution bars |
| lucide-react | All icons |

Key frontend directories:
```
frontend/
  app/
    investigate/page.tsx   Main investigation page (text/file/URL input, SSE consumer)
    history/page.tsx       Per-user investigation history
    report/[id]/page.tsx   Public shareable report page
    admin/page.tsx         Admin user list
  components/
    RiskCard.tsx           Verdict card (gauge, rationale, evidence, Visual Forensics)
    InvestigationStep.tsx  Per-step animated row
    ModelSelector.tsx      Gemini model picker dropdown
    ChatPanel.tsx          Post-investigation follow-up chat
    LiveFeed.tsx           Real-time scam report feed
    HealthStrip.tsx        Backend capability status bar
    Navbar.tsx             Top navigation + auth modal
  lib/
    config.ts              Mode detection + all API endpoint builders
    types.ts               All shared TypeScript interfaces
    realmap.ts             Maps backend SSE frames → UI shapes
    api.ts                 fetch wrappers (SSE stream, health, report, feed)
    mock.ts                Self-contained mock engine (demo mode)
    history.ts             localStorage history helpers
    auth.ts                Token encode/decode helpers
```

### Backend
| Tool | Notes |
|------|-------|
| Python 3.11+ | |
| FastAPI | All endpoints, CORS middleware, SSE streaming |
| Google ADK (`google-adk`) | `LlmAgent` + `InMemoryRunner` — Gemini agents |
| `google-genai` | Direct Gemini calls (embeddings, image analysis) |
| `pymongo` | Sync writes + async change stream (native async driver, not Motor) |
| MongoDB Atlas | Vector Search, Atlas Search, aggregations, change streams |
| `pypdf` | PDF text + metadata extraction |
| `httpx` | URL fetch |
| `beautifulsoup4` | HTML → clean text for URL ingest |
| `Pillow` | Image open for barcode decode |
| `zxing-cpp` / `pyzbar` | Barcode/QR decode (optional; Gemini reads it if absent) |
| `certifi` | TLS CA bundle for Atlas |

Key backend files:
```
backend/
  main.py             All FastAPI endpoints
  pipeline.py         8-step SSE orchestrator
  agent.py            Gemini LlmAgents + prompts (edit AI here)
  ingest.py           Text/PDF/image/URL → normalized listing (edit AI here)
  db.py               All MongoDB logic (retrieval, scoring, persistence, auth, history)
  config.py           Env vars + feature flags
  models.py           Pydantic request schemas
  models_registry.py  Gemini model tiers + fallback chain
  chat.py             Follow-up Q&A grounded in an investigation
  scripts/
    setup_atlas.py    One-shot DB bootstrap (indexes + corpus seed)
  data/
    scam_corpus.json  Synthetic labelled corpus
    eval_set.json     50 labelled examples for precision/recall measurement
  Dockerfile          Node + Python (MCP server needs npx)
  .env.example        Copy → .env and fill in
```

---

## 8. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/investigate` | — | Runs the 8-step pipeline, streams SSE |
| `POST` | `/api/check` | — | Same pipeline, returns single JSON verdict |
| `GET` | `/api/report/{inv_id}` | — | **Public.** Fetch a finished investigation by ID |
| `POST` | `/api/report` | — | Submit a user scam report |
| `GET` | `/api/feed` | — | SSE live change stream of new scam reports |
| `GET` | `/api/health` | — | Live capability booleans (Gemini, Atlas, MCP) |
| `GET` | `/api/models` | — | Available Gemini models for the UI selector |
| `GET` | `/api/mcp/info` | — | MCP integration description |
| `POST` | `/api/chat` | — | Follow-up Q&A on a completed investigation |
| `POST` | `/api/auth/register` | — | Create a new user account |
| `POST` | `/api/auth/login` | — | Verify credentials, returns a token |
| `GET` | `/api/history` | Bearer token | Fetch the authenticated user's history |
| `POST` | `/api/history/save` | Bearer token | Save a history entry |
| `DELETE` | `/api/history/entry/{id}` | Bearer token | Delete one history entry |
| `DELETE` | `/api/history/clear` | Bearer token | Clear all history for the user |
| `GET` | `/api/admin/users` | Bearer token | List all registered users |
| `GET` | `/health` | — | Minimal liveness probe for Cloud Run |

The auth token is a base64-encoded `user_id:email` string (simple, no JWT dependency).
Check `backend/main.py → get_current_user_id()` for the decode logic.

---

## 9. Environment Variables

### Backend (`backend/.env`)

```env
# Required for Gemini (pick one backend):
GOOGLE_API_KEY=your_google_ai_studio_key        # AI Studio (free tier)
GOOGLE_GENAI_USE_VERTEXAI=FALSE

# OR for Vertex AI (GCP billing):
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_PROJECT=your-gcp-project
GOOGLE_CLOUD_LOCATION=us-central1

# Required for all MongoDB features:
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ticketguard

# Optional overrides:
GEMINI_MODEL=gemini-2.5-flash
EMBED_MODEL=text-embedding-004
EMBED_DIMS=768
CORS_ORIGINS=https://your-vercel-url.vercel.app
PORT=8001
```

### Frontend (Vercel env or `.env.local`)

```env
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com   # → REAL mode
# NEXT_PUBLIC_DEMO=mock                                  # → MOCK demo mode
# (neither set)                                          # → UNCONFIGURED banner
```

In development, `next.config.mjs` proxies `/api/*` → `http://localhost:8001`, so you
don't need `NEXT_PUBLIC_API_URL` locally — the frontend runs in REAL mode automatically.

---

## 10. Running Locally

### Backend

```bash
cd backend

# First time only:
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux

pip install -r requirements.txt

# Copy env and fill in your keys:
copy .env.example .env

# Seed Atlas (first time, or after wiping the DB):
python scripts/setup_atlas.py

# Start the server:
uvicorn main:app --reload --port 8001
# → http://localhost:8001/api/health should return {"status":"ok","atlas":true,...}
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

The dev server proxies `/api/*` to the backend automatically.
No `NEXT_PUBLIC_API_URL` needed for local dev.

---

## 11. Deploying

### Backend — Render (free)

1. Go to https://render.com → New → Web Service → connect the GitHub repo.
2. Root directory: `backend`, runtime: **Docker** (the `Dockerfile` bundles Node + Python
   so the MongoDB MCP server can run via `npx`).
3. Set the env vars from §9.
4. Copy the service URL once deployed.

> Render free tier spins down when idle. Warm it before a demo by hitting `/health`.

### Frontend — Vercel

1. Import the repo, root directory `frontend`.
2. Set `NEXT_PUBLIC_API_URL` = your Render URL.
3. Remove or leave blank `NEXT_PUBLIC_DEMO` (to switch out of mock mode).
4. Deploy.

---

## 12. MongoDB Atlas Setup

### One-time bootstrap (run `setup_atlas.py`)

This creates:
- `scam_corpus` — labelled synthetic listings + their 768-dim embeddings.
- `reports` — user-submitted scam reports.
- `investigations` — persisted investigation results.
- `tickets_seen` — sha256 barcode dedup table.
- `users` — registered user accounts.
- `user_history` — per-user investigation history.
- `conversations` — post-investigation chat memory.
- `official_rules` — transfer-rule knowledge.
- Vector Search index (`scam_vector_index`) — 768-dim cosine, `text-embedding-004`.
- Atlas Search index (`scam_text_index`) — full-text over `text`, `pattern_type`, `source_pattern`.

### Atlas requirements

| Feature | Minimum tier |
|---------|-------------|
| `$vectorSearch` | Any tier (M0 works) |
| Atlas Search (`$search`) | Any tier (M0 works) |
| Native `$rankFusion` | MongoDB 8.1+ (Flex / M10+). M0 is 8.0 → code falls back to reciprocal-rank fusion automatically. |
| Change streams (live feed) | Replica set (any Atlas tier is a replica set) |

**Network Access:** Add `0.0.0.0/0` in Atlas → Network Access so the backend can connect
from Render / Cloud Run. In production you'd lock this to your service's IP.

---

## 13. Where the AI Prompts Live

All prompts are plain Python strings. Edit them, save, restart — no recompile needed.

| Prompt | File | What to tune |
|--------|------|-------------|
| Shared agent persona | `backend/agent.py` → `_TEAM` | The "TicketGuard team" framing |
| Listing Normalizer | `backend/agent.py` → `NORMALIZER_INSTRUCTION` | How fields are extracted from text |
| Verdict Writer | `backend/agent.py` → `VERDICT_INSTRUCTION` | Risk reasoning style, evidence grounding |
| Text/PDF extraction | `backend/ingest.py` → `_NORMALIZER_PROMPT` | Structured extraction for all source types |
| Image forensics (normalization) | `backend/ingest.py` → `normalize_image()` prompt | What the OCR + field extraction looks for in images |
| Image forensics (tamper hints) | `backend/ingest.py` → `_image_tamper_hints()` | The forensic visual analysis prompt — Photoshop detection, DM manipulation |

**Hard rules when editing prompts:**
- Never let the model invent the risk score (it comes from MongoDB `$group`/`$facet`).
- Keep the verdict vocabulary exactly: `SCAM | SUSPICIOUS | LIKELY-LEGIT`. No "authentic" or "genuine".
- Keep JSON output shapes intact — the pipeline parses JSON from the model response.

---

## 14. Hackathon Compliance Rules

These are hard rules. Breaking any of them is a **disqualifier or score killer.**

| Rule | Why it matters |
|------|---------------|
| **All LLMs must be Google Gemini only.** No OpenAI, DeepSeek, Llama, Cohere, Ollama. | Hackathon requirement. Hard disqualifier. |
| **MongoDB is the only vector DB / data layer.** No Pinecone, Weaviate, Chroma, etc. | Hackathon requirement. |
| **No FIFA / World Cup logos, emblems, or trademarks.** Text references only. | IP / legal compliance. |
| **Risk-signal language.** Say "high risk" not "this is a scam". Say "LIKELY-LEGIT" not "authentic/genuine". | TicketGuard cannot verify a ticket is real — only signal risk. Legal and honesty rule. |
| **Synthetic data only** in the corpus and demo. No real personal data. | Privacy + legal. |
| **Repo must be public** with MIT LICENSE visible. | Hackathon submission requirement. |
| **Rotate API keys** before and after submission (they were shared in chat/commits). | Security hygiene. |
| The core model is `gemini-2.5-flash`. The other two models in the registry (`flash-lite`, `pro`) are Gemini too — they exist as fallback tiers, not as alternatives to the rule. | Compliance guardrail already in `models_registry.py`. |

---

## 15. Key Design Decisions (and Why)

**"No fabrication" contract.**
Every DB-dependent step degrades to `not_configured` instead of returning static fake
data. This is a deliberate hackathon strategy — judges can demo with Atlas off and see
honest, labelled degradation instead of fabricated results that would lose credibility.

**Risk score is computed by MongoDB, not Gemini.**
The `$group`/`$facet` aggregation in `db.py → score_signals()` is the source of truth
for the numeric score. Gemini only explains the evidence. This makes the score auditable.

**MCP server is read-only.**
The MongoDB MCP server (`mongodb-mcp-server`) is wired only for `find`, `aggregate`,
`count`, `collection-schema`, and `list-collections`. All writes go through the explicit
`pymongo` path in `db.py`. This prevents the agent from accidentally mutating data.

**Two Gemini calls per investigation (not eight).**
Steps 2–6 are deterministic Python/MongoDB. Only steps 1 (normalization) and 7 (verdict)
call Gemini. This keeps costs low and makes the pipeline fast.

**Frontend runs the same UI in mock and real mode.**
`lib/mock.ts` is a self-contained synthetic engine that drives the identical animated
components. This means the demo always looks polished even if the backend is cold-starting.

---

## 16. Git Workflow

We work on the `ticketguard` branch of the repo
(the repo is still named `PitchCraft-Agent` on GitHub — same repo, different branch).

```bash
# Pull before you start:
git pull origin ticketguard

# Work on a feature:
git checkout -b your-name/feature-name

# Push and open a PR into ticketguard:
git push origin your-name/feature-name
```

**Never commit `.env`** — it's gitignored. Keep secrets local.

---

## 17. Common Gotchas

| Symptom | Cause | Fix |
|---------|-------|-----|
| `bad auth: authentication failed` | Atlas password has special chars or user doesn't exist | Re-create the Atlas DB user with a simple alphanumeric password |
| `atlas: false` in `/api/health` | Network Access in Atlas blocks the server IP | Add `0.0.0.0/0` in Atlas → Network Access |
| `reciprocal_rank_fusion` in logs (not `native_rankfusion`) | MongoDB version < 8.1 (M0 = 8.0) | Expected — the code falls back automatically. Fine for the demo. |
| Frontend stuck in mock mode | `NEXT_PUBLIC_API_URL` not set in Vercel | Set the env var + redeploy |
| Render backend slow on first request | Free tier cold start | Hit `/health` before the demo to warm it up |
| Gemini 429 / quota exceeded | Free tier daily limit hit | The model fallback chain kicks in automatically (Flash → Lite → Pro). If all three hit quota, wait 24h or upgrade the API key. |
| `normalizer returned non-JSON` | Gemini wrapped output in markdown fences | `ingest.py → parse_json()` already strips fences — if it persists, the prompt or model response is malformed |
| Image analysis produces no tamper hints | `_image_tamper_hints()` returned `None` | Best-effort — if Gemini returns "none" or an exception occurs, the step still completes without tamper data |

---

## 18. Quick Links

- **Live demo (Vercel):** https://frontend-nu-ochre-z41mw3z0l5.vercel.app
- **GitHub repo (ticketguard branch):** https://github.com/vaibhav4046/PitchCraft-Agent/tree/ticketguard
- **Hackathon deadline:** June 11, 2026, 2:00 PM PDT
- **Prize (MongoDB track):** 1st = $5,000 · 2nd = $3,000 · 3rd = $2,000

---

*Decision-support only — not a legal or financial guarantee. Good luck, let's win this.*
