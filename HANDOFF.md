# TicketGuard — Team Handoff & Contributor Guide

Hey Arman 👋 — this is everything you need to take TicketGuard the rest of the way.
Read top to bottom once; it's organized so you can jump back to any section.

---

## 1. What we're building

**TicketGuard** = an AI agent that flags **ticket-resale scams** (context: the 2026
World Cup resale-fraud wave). A user pastes a suspicious listing / seller DM (or
uploads a PDF/screenshot, or drops a URL); a team of **Gemini agents** runs a
multi-step investigation **grounded in MongoDB Atlas** and returns a risk verdict:
`SCAM | SUSPICIOUS | LIKELY-LEGIT` with confidence + evidence.

- **Hackathon:** Google Cloud Rapid Agent Hackathon — **MongoDB track**.
- **Deadline:** **June 11, 2026, 2:00 PM PDT.**
- **Prize (real numbers):** MongoDB track 1st = **$5,000**, 2nd $3k, 3rd $2k.

## 2. Links

- **Live demo (frontend, mock data):** https://frontend-nu-ochre-z41mw3z0l5.vercel.app
- **Repo:** https://github.com/vaibhav4046/PitchCraft-Agent — **branch `ticketguard`**
  (the repo name still says "PitchCraft" — same repo, TicketGuard lives on the `ticketguard` branch).

## 3. Current status (honest)

| Piece | State |
|-------|-------|
| Backend (Gemini + ADK + MongoDB pipeline) | ✅ **Real + working.** Proven: a live `/api/check` on a scam DM returned `SCAM @0.9` with real Gemini reasoning. |
| Frontend (premium UI, wired to real backend) | ✅ Done. Real SSE stream, ingestion (text/PDF/image/URL), health gating, honest "not configured" states. |
| Dark mode | ✅ Premium. |
| Light mode | ⚠️ Being fixed right now (white cards were rendering on a dark page). |
| **MongoDB live features** | ❌ **Blocked on Atlas auth** (see §4.1). Vector search / live feed / dedup / persistence are OFF until the DB connects. The app honestly shows "not configured" instead of faking it. |
| Hosted backend | ❌ Not deployed yet (see §4.3). |

**The #1 blocker is the Atlas login on your account.** Fixing it unlocks ~70% of the MongoDB score.

---

## 4. The 4 things only YOU can do (in order)

### 4.1 — Fix MongoDB Atlas auth ⛔ (the big one)
The backend currently fails with `bad auth : authentication failed`.
1. Atlas → **Database Access** → user `technicalarman2003_db_user` → **Edit → Edit Password**
   (or **Add New User**) → set a password with **no special chars** (or URL-encode `@ : / # %`)
   → role **Read and write to any database**.
2. Atlas → **Network Access** → **Add IP** → `0.0.0.0/0` (allow from anywhere).
3. Put the working string in `backend/.env`:
   `MONGODB_URI=mongodb+srv://<user>:<password>@pitchcraftcluster.fuylrsf.mongodb.net/?retryWrites=true&w=majority`
4. Verify: `cd backend && .venv\Scripts\python _smoke_pipeline.py` should run, and
   `GET /api/health` should show `"atlas": true`.

> Note: native `$rankFusion` hybrid search needs an **8.1+** cluster (Flex/M10+). Free **M0** is 8.0
> → the code automatically falls back to `$vectorSearch` + code-fusion and logs which path ran. Fine for the demo.

### 4.2 — Seed Atlas (one command)
Once 4.1 works:
```
cd backend
.venv\Scripts\python scripts\setup_atlas.py
```
This creates the collections, the vector index (768-dim) + Atlas Search index, and seeds the
synthetic scam corpus. Idempotent — safe to re-run.

### 4.3 — Host the backend (Render free)
The `backend/Dockerfile` already bundles **Node + Python** (the MongoDB MCP server runs via `npx`).
1. https://render.com → **New → Web Service** → connect this GitHub repo → root dir `backend` → **Docker**.
2. Set env vars (from `backend/.env.example`): `MONGODB_URI`, `GOOGLE_API_KEY`,
   `GEMINI_MODEL=gemini-2.5-flash`, `MONGODB_DB=ticketguard`.
3. Deploy → copy the service URL (e.g. `https://ticketguard-api.onrender.com`).
   (Render free spins down when idle → first request is slow; just warm it before the demo.)

### 4.4 — Point the frontend at the backend (Vercel)
1. Vercel → project **frontend** → **Settings → Environment Variables**.
2. Set `NEXT_PUBLIC_API_URL` = your Render URL. **Remove** `NEXT_PUBLIC_DEMO` (or set it to empty)
   so it leaves mock mode and goes REAL.
3. Redeploy: `cd frontend && npx vercel --prod`.
4. Open the site → it now runs the real agent end-to-end.

---

## 5. Repo structure

```
backend/
  main.py            FastAPI app — all endpoints (investigate/check/report/feed/health/mcp/info)
  pipeline.py        Orchestrates the 8-step investigation, streams SSE
  agent.py           The Gemini agents (ADK LlmAgent) + their PROMPTS  ← edit AI here
  ingest.py          Multi-source ingestion (text/PDF/image/URL) + extraction PROMPT  ← edit AI here
  db.py              MongoDB Atlas: vector search, aggregations, change stream, persistence
  config.py          Reads env; picks AI Studio vs Vertex; feature flags
  models.py          Request schemas
  scripts/setup_atlas.py   One-shot DB bootstrap (§4.2)
  data/scam_corpus.json    Synthetic corpus (seeded into Atlas)
  data/eval_set.json       50 labeled examples for precision/recall
  Dockerfile         Node + Python (MCP needs npx) — for Render/Cloud Run
  .env.example       Copy to .env and fill in
frontend/
  app/               Next.js App Router pages (/, /investigate, /plan)
  components/        UI (HeroSection, InvestigationStep, RiskCard, LiveFeed, ThemeToggle, ...)
  lib/api.ts         Calls the real backend (SSE + JSON)
  lib/config.ts      Mode switch: REAL (NEXT_PUBLIC_API_URL set) / MOCK / UNCONFIGURED
  lib/mock.ts        Self-contained demo data (mock mode only)
  app/globals.css    Design tokens (light + dark) — single source of theme truth
HANDOFF.md           This file
LICENSE              MIT
```

---

## 6. Working with the AI (Gemini) — where the prompts are + how to tune them

**This is what you asked about.** All AI prompts are plain strings in two files — edit them, save, re-run, done.

### Where the prompts live
| Prompt | File · symbol | What it controls |
|--------|---------------|------------------|
| Shared agent preamble | `backend/agent.py` → `_TEAM` (~L68) | Persona prepended to every agent |
| Listing Normalizer (agent) | `backend/agent.py` → `NORMALIZER_INSTRUCTION` (~L71) | How the agent extracts listing fields |
| **Verdict Writer** | `backend/agent.py` → `VERDICT_INSTRUCTION` (~L86) | The risk verdict + reasoning style (tune this for better verdicts) |
| Extraction prompt | `backend/ingest.py` → `_NORMALIZER_PROMPT` (~L105) | Structured extraction for text/PDF/image/URL |

The model + provider are env-driven (`backend/.env`):
`GEMINI_MODEL=gemini-2.5-flash`, `GOOGLE_API_KEY=...`, `GOOGLE_GENAI_USE_VERTEXAI=FALSE`.

### How to change a prompt and test it (fast loop)
1. Edit the string in `agent.py` or `ingest.py`. Keep the JSON-output instructions intact — the
   pipeline parses JSON, so the prompt must keep telling the model to return the same JSON shape.
2. Test extraction only (cheap, 1 Gemini call):
   `cd backend && .venv\Scripts\python _smoke_pipeline.py`
3. Test the full verdict:
   ```
   .venv\Scripts\python -m uvicorn main:app --port 8001
   # then in another shell:
   curl -X POST http://localhost:8001/api/check -H "Content-Type: application/json" -d "{\"type\":\"text\",\"text\":\"Selling 2 World Cup tickets, Zelle only, PDF after payment\"}"
   ```

### Prompt-tuning tips
- **Don't let the model invent numbers.** The risk *score* is computed in MongoDB (`db.py`), not by Gemini — keep it that way (judges care).
- Keep the verdict vocabulary exactly `SCAM | SUSPICIOUS | LIKELY-LEGIT`. **Never** "authentic/genuine" (we can't truly authenticate a ticket — legal/honesty rule).
- Ground the verdict only in the evidence passed to it; tell it to say "insufficient evidence" rather than guess.
- Free Gemini tier is ~limited req/day — don't run the full pipeline in a loop while tuning; use the smoke test.

---

## 7. Run it locally

**Backend:**
```
cd backend
python -m venv .venv          # first time only
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env        # fill MONGODB_URI + GOOGLE_API_KEY
.venv\Scripts\python -m uvicorn main:app --reload --port 8001
```
Check `http://localhost:8001/api/health`.

**Frontend (new shell):**
```
cd frontend
npm install
npm run dev                   # http://localhost:3000 ; dev proxies /api → localhost:8001
```

---

## 8. Env vars reference

**backend/.env**
| Var | Unlocks |
|-----|---------|
| `MONGODB_URI` | everything MongoDB (vector search, feed, dedup, persistence) |
| `MONGODB_DB` | `ticketguard` |
| `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) | Gemini (extraction, verdict, embeddings) |
| `GOOGLE_GENAI_USE_VERTEXAI` | `FALSE` = AI Studio (free key) · `TRUE` = Vertex (needs GCP billing) |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `CORS_ORIGINS` | set to the Vercel URL in prod |
| `PORT` | server port |

**frontend (Vercel env)**
| Var | Effect |
|-----|--------|
| `NEXT_PUBLIC_API_URL` | set → **REAL** mode (calls backend) |
| `NEXT_PUBLIC_DEMO=mock` | no API URL → **MOCK** preview (watermarked) |
| neither | **UNCONFIGURED** banner (never fakes) |

---

## 9. Git workflow (how we collaborate)

We work on branch **`ticketguard`**.
- **Option A — direct:** `git checkout ticketguard` → make changes → `git commit` → `git push origin ticketguard`. We review on GitHub and it's already the working branch.
- **Option B — PR:** branch off `ticketguard` (`git checkout -b arman/<thing>`) → push → open a Pull Request → I review + merge.
- Either way: **never commit `.env`** (it's gitignored — secrets stay local).
- Pull before you start: `git pull origin ticketguard`.

---

## 10. Hackathon compliance — DON'T break these (they protect the score)

- **Core AI must be Google Gemini only.** Do NOT add OpenAI/DeepSeek/MiniMax/etc. or a non-Mongo vector DB. (This is a hard disqualifier.)
- **MongoDB is the only data/partner layer** — vectors live in Atlas.
- **No FIFA / "World Cup" logos or emblems** — text references only.
- **Risk-signal language**, never accusations or "authentic/genuine".
- **Synthetic data only** in the corpus/demo.
- Repo must be **Public** with the **MIT LICENSE** visible (Settings → Visibility).
- **Rotate the API keys** before/after submission (they were shared in chat).

---

## 11. Quick gotchas
- Atlas currently = `bad auth` → that's §4.1, your first job.
- Free M0 = no native `$rankFusion` (auto-falls back; fine).
- Render free cold-starts — warm it before the demo.
- Frontend deployed in **mock** right now; flip to real via §4.4 once the backend is hosted.

Ping me on WhatsApp for anything. Let's win this. 🏆
