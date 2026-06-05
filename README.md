# PitchCraft 🚀

**Turn a one-line startup idea into an investor-grade business plan — generated live by a Gemini agent that researches your market through MongoDB.**

PitchCraft is an autonomous **AI agent** built for the **Google Cloud Rapid Agent Hackathon** (MongoDB partner track). You type one sentence; the agent plans and executes a 7-step research mission — validating the idea, researching the market, building customer personas, writing the plan, projecting 3-year financials, analyzing risk, and producing a 30/60/90-day action plan — streaming every step (and every database query) to your screen in real time.

> Move beyond chat. PitchCraft **uses tools to accomplish a multi-step task**, keeping you in control with a human-in-the-loop gate when an idea looks risky.

---

## 🏆 How PitchCraft meets the hackathon requirements

| Requirement | How PitchCraft delivers |
|---|---|
| **Powered by Gemini** | Every reasoning step runs on **Gemini 2.5 Flash**. |
| **Google Cloud Agent Builder** | The agent is built with the **Agent Development Kit (ADK)** and calls Gemini through **Vertex AI** on Google Cloud. |
| **Integrates a Partner MCP server** | The agent connects to the **official MongoDB MCP server** (`mongodb-mcp-server`, stdio) and calls its tools (`find`, `aggregate`, `count`, schema) to ground its analysis in real data. |
| **Meaningful partner use** | Beyond MCP, PitchCraft uses **MongoDB Atlas Vector Search** (Gemini embeddings) for retrieval-augmented market intelligence, plus Atlas for plan persistence + shareable links. |
| **Multi-step agentic mission** | A 7-section pipeline where the agent autonomously decides which tools to call per section. |
| **Runs on web** | Next.js frontend + FastAPI backend. |
| **Hosted + open source** | Backend on **Cloud Run**, frontend on **Vercel**, MIT licensed. |

---

## 🏗️ Architecture

```
┌────────────┐   SSE    ┌──────────────────────── Cloud Run ───────────────────────┐
│  Next.js   │ ───────► │  FastAPI  →  ADK agent (Gemini 2.5 Flash via Vertex AI)    │
│  (Vercel)  │ ◄─────── │                 │                          │              │
└────────────┘  stream  │                 ▼                          ▼              │
   live steps           │   MongoDB MCP server (stdio)     search_market_intelligence│
   + tool calls         │   find · aggregate · count        (Gemini embeddings +     │
                        │          │                         Atlas $vectorSearch)     │
                        └──────────┼──────────────────────────────────┼─────────────┘
                                   ▼                                  ▼
                          ┌─────────────────────  MongoDB Atlas  ─────────────────┐
                          │  business_plans   ·   market_corpus (vector index)    │
                          └────────────────────────────────────────────────────────┘
```

The agent does real tool use: in the **Research Market** step it calls Atlas Vector
Search and queries the `business_plans` collection through the MongoDB MCP server,
and those tool calls stream to the UI so you can watch it work.

---

## 📦 Project structure

```
backend/    FastAPI + ADK agent
  config.py     model + backend (AI Studio vs Vertex) + Atlas settings
  agent.py      ADK LlmAgent: Gemini + MongoDB MCP toolset + vector-search tool
  pipeline.py   7-section orchestration over the agent (streams SSE events)
  db.py         Atlas: persistence, Gemini embeddings, vector search, seeding
  main.py       FastAPI routes (SSE /api/generate, /api/plan, /api/mcp/info, ...)
  Dockerfile    Cloud Run image (Node for MCP server + Python for ADK)
frontend/   Next.js 14 (App Router, Tailwind)
```

---

## 🚀 Quick start (local)

### 1. MongoDB Atlas
Create a free cluster, then **Network Access → Add IP → Allow from anywhere (0.0.0.0/0)**.
Copy the connection string.

### 2. Backend
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate     # Windows
# source .venv/bin/activate                         # macOS/Linux
pip install -r requirements.txt
cp .env.example .env        # fill MONGODB_URI + GOOGLE_API_KEY
uvicorn main:app --reload --port 8000
```
Needs **Node.js** on PATH (the agent launches the MongoDB MCP server via `npx`).

### 3. Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

---

## ☁️ Deploy

**Backend → Cloud Run** (uses Vertex AI; the service account provides Gemini auth):
```bash
cd backend
gcloud run deploy pitchcraft-agent --source . --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT,GOOGLE_CLOUD_LOCATION=us-central1,MONGODB_URI=YOUR_URI,GEMINI_MODEL=gemini-2.5-flash
```

**Frontend → Vercel**: set `NEXT_PUBLIC_API_URL` to the Cloud Run URL and deploy.

---

## 🔌 The MongoDB MCP integration (for judges)

`GET /api/mcp/info` returns the live integration status. The agent loads the
official `mongodb-mcp-server` over stdio (read-only) via ADK's `McpToolset`, and
uses Atlas Vector Search for RAG. See [`backend/agent.py`](backend/agent.py) and
[`backend/db.py`](backend/db.py).

## License
MIT — see [LICENSE](LICENSE).
