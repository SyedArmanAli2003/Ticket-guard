# PitchCraft — Backend (Google ADK + Gemini + MongoDB)

Turn one sentence into an investor-grade business plan. A **team of 8 Gemini
specialist agents** (Google **ADK**) researches, validates, models, and
stress-tests the idea, grounded in **MongoDB Atlas Vector Search** and the
official **MongoDB MCP server**, streaming every step to the client over
Server-Sent Events.

> Built for the Google Cloud Rapid Agent Hackathon 2026 — **MongoDB track**.

## The agent team

A coordinator (`pipeline.py`) runs eight specialist `LlmAgent`s in turn,
threading the accumulating plan as shared context, then a QA critic scores the
finished plan:

| # | Agent | Tools | Output section |
|---|-------|-------|----------------|
| 1 | Idea Validator | Atlas Vector Search | `validation` |
| 2 | Market Analyst | Vector Search + similar-plans + **MongoDB MCP** (`find`/`aggregate`/`count`) | `market_research` |
| 3 | Persona Designer | — | `personas` |
| 4 | Business Architect | — | `business_plan` |
| 5 | Financial Modeler | — | `financials` |
| 6 | Risk Officer | — | `risks` |
| 7 | Chief of Staff | — | `action_items` |
| 8 | QA Critic | — | `qa_review` |

The **Market Analyst** is the data-grounded one: it calls
`search_market_intelligence` (semantic search over the `market_corpus` collection
via Atlas Vector Search) and, when Atlas is reachable, the official
`mongodb-mcp-server` over stdio.

## Stack

- **FastAPI** + Uvicorn — HTTP + SSE streaming
- **Google ADK** (`google-adk`) — multi-agent orchestration (`LlmAgent`, `InMemoryRunner`)
- **Gemini** via `google-genai` — AI Studio (dev) or **Vertex AI** (submission); embeddings via `text-embedding-004`
- **MongoDB Atlas** — plan persistence (`business_plans`), market corpus + **Vector Search** (`market_corpus`), and the **MongoDB MCP server**

Everything degrades gracefully: if Atlas is unreachable or the vector index is
still building, vector search falls back to a regex scan and then a static
in-memory corpus, so the agent always returns a plan (just without persistence /
share links / live MCP).

## Environment (`.env`)

```bash
# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DB=pitchcraft

# Gemini — dev (AI Studio): key + USE_VERTEXAI=FALSE
GOOGLE_API_KEY=                      # or GEMINI_API_KEY
GOOGLE_GENAI_USE_VERTEXAI=FALSE
GEMINI_MODEL=gemini-2.5-flash        # flash-lite is cheaper; 2.5-flash/pro give richer plans
EMBED_MODEL=text-embedding-004

# Gemini — submission (Vertex AI, full Google Cloud): set these instead
# GOOGLE_GENAI_USE_VERTEXAI=TRUE
# GOOGLE_CLOUD_PROJECT=your-project
# GOOGLE_CLOUD_LOCATION=us-central1

# Server
PORT=8000
CORS_ORIGINS=https://frontend-nu-ochre-z41mw3z0l5.vercel.app   # comma-separated; omit for *
```

If a password contains special characters (`@ : / ? # %`), percent-encode them.

## Atlas one-time setup

1. **Database user** — Atlas → *Database Access* → add a user with `readWrite`
   on `pitchcraft` (or `readWriteAnyDatabase`). Use that user/password in `MONGODB_URI`.
2. **Network access** — *Network Access* → allow your IP (and, for Cloud Run,
   `0.0.0.0/0` or a static egress IP).
3. **Vector index** — the app auto-creates `market_vector_index` on
   `market_corpus.embedding` (768 dims, cosine) on first boot. If your tier
   blocks programmatic creation, create it manually in *Atlas Search* with:
   ```json
   { "fields": [ { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" } ] }
   ```

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env            # then fill it in
uvicorn main:app --reload --port 8000
```

Check it: `GET http://localhost:8000/health` →
`{"db_connected": true, "mcp": true, ...}` means Atlas + MCP are live.
`db_connected: false` with `bad auth` means the `MONGODB_URI` credentials are wrong.

Full pipeline smoke test (DB/MCP off, Gemini only): `python _smoke_pipeline.py`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Run the team; stream sections + tool activity as SSE. New plan id in the `X-Plan-ID` header. |
| GET | `/api/plan/{id}` | Fetch a stored plan by id (404 if missing). |
| GET | `/api/share/{token}` | Fetch a plan by its public share token. |
| GET | `/api/stats` | `{ "total_plans": n }` — powers the landing-page counter. |
| GET | `/api/mcp/info` | Live status of the MongoDB MCP + Vector Search integration. |
| GET | `/health` | Health + `db_connected` / `mcp` flags. |

SSE frames: per-step `{"step":n,"status":"running|complete|error","data":{...}}`,
tool activity `{"type":"tool","step":n,"tool":"...","source":"vector|mongodb"}`,
and a finalize frame `{"step":99,"data":{"plan_id","share_token","engine"}}`.

## Deploy to Google Cloud Run

The `Dockerfile` uses a `node:20` base (so the MongoDB MCP server runs) with
Python on top, and pre-installs `mongodb-mcp-server`.

```bash
# Recommended: keep secrets in Secret Manager, not env vars
gcloud run deploy pitchcraft-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 600 \
  --min-instances 1 \
  --set-env-vars "MONGODB_DB=pitchcraft,GOOGLE_GENAI_USE_VERTEXAI=FALSE,GEMINI_MODEL=gemini-2.5-flash,CORS_ORIGINS=https://frontend-nu-ochre-z41mw3z0l5.vercel.app" \
  --set-secrets "MONGODB_URI=pitchcraft-mongo-uri:latest,GOOGLE_API_KEY=pitchcraft-gemini-key:latest"
```

`--min-instances 1` avoids cold starts during judging; `--timeout 600` covers the
multi-agent run. Then point the frontend at the service:

```bash
# Vercel → Project → Settings → Environment Variables
NEXT_PUBLIC_API_URL = https://pitchcraft-agent-xxxxx-uc.a.run.app
# redeploy the frontend
```

## Notes

- For the hackathon submission, flip to the **Vertex AI** backend
  (`GOOGLE_GENAI_USE_VERTEXAI=TRUE` + project/location) so all inference runs on
  Google Cloud — no code change needed.
- Gemini calls run inside ADK; transient `429/503` errors are retried with backoff.
