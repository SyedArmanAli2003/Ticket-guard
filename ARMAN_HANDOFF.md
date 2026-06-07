# TicketGuard — Action Handoff for Arman (2026-06-07)

**Everything is live and working except ONE backend item: Step-2 hybrid retrieval.**
Fixing it is ~5 minutes and one script. Details below.

Live: frontend https://frontend-nu-ochre-z41mw3z0l5.vercel.app · backend https://pitchcraft-agent.onrender.com
Repo branch: `ticketguard` (all my fixes are pushed).

---

## 🔴 #1 — Fix Step-2 (Hybrid Retrieval) — HIGH IMPACT, ~5 min

**Symptom:** `/api/health` shows `"vector_index": false, "text_index": false`. In an investigation, Step-2 (Hybrid Retrieval) shows **"not configured · search_indexes_missing."**

**Root cause:** the Atlas Search indexes (`scam_vector_index`, `scam_text_index`) don't exist on the database the **live Render backend** connects to — OR the query embedding dimensions don't match the index. Everything else (Gemini, Atlas connection, reputation, forgery, scoring, persistence, change-stream feed) works, so the cluster connection itself is fine; only the corpus search indexes are missing/mismatched.

**Fix — run from a machine that can reach the cluster (your laptop, IP allow-listed in Atlas), with the SAME env the Render backend uses:**

```bash
# 1) Set the EXACT same env vars Render uses (check Render dashboard → Environment):
export MONGODB_URI="<the live Atlas SRV URI>"      # same one Render has
export MONGODB_DB="ticketguard"                     # MUST match Render's MONGODB_DB
export EMBED_MODEL="text-embedding-004"
export EMBED_DIMS="768"
export GEMINI_API_KEY="<a key with embeddings enabled>"   # or GOOGLE_API_KEY

# 2) Create the indexes + seed the corpus (idempotent):
cd backend
pip install -r requirements.txt
python scripts/setup_atlas.py
# -> creates scam_vector_index + scam_text_index on scam_corpus, seeds ~137 docs WITH 768-dim embeddings.
#    Atlas builds search indexes ASYNC — wait ~1-2 min until they report status READY.

# 3) Verify:
curl https://pitchcraft-agent.onrender.com/api/health
# Expect: "vector_index": true, "text_index": true
```

**If health still shows false after the script reports success:** the live backend's `MONGODB_URI`/`MONGODB_DB` point to a **different DB** than where you just ran the script. Align them — make Render's `MONGODB_DB` and cluster match the DB you seeded. (The DB name defaults to `ticketguard`; confirm both sides agree.)

**Also confirm on Render** (these are the usual culprits):
- `EMBED_MODEL=text-embedding-004` and `EMBED_DIMS=768` (the index was built for 768 dims — a mismatch makes `$vectorSearch` throw → `search_indexes_missing`).
- `GEMINI_API_KEY` has embedding access + quota (if embeddings fail you'd instead see `embeddings_unavailable`).

When fixed, Step-2 returns `"ok"` with hits and the engine's accuracy/MongoDB-track depth jumps (native `$rankFusion` if cluster ≥ 8.1, else reciprocal-rank fusion).

---

## 🟡 #2 — Auth hardening (before any public/production use)

Current auth is demo-grade: SHA-256 + localStorage on the client, with hardcoded demo creds (`admin@ticketguard.ai/admin123`, `demo@ticketguard.ai/demo123`). Fine for the hackathon demo; **for production**: move auth server-side with **bcrypt** password hashing and remove the hardcoded creds.

---

## ✅ Already done + deployed (frontend — verified live)
- Site-blank bugs fixed (backdrop z-index, a ShieldMark inline-`<style>` hydration crash, animations that hid content). **0 React errors on prod now.**
- **Sign in** works (modal was mounting invisible) + **added Sign in/History/Sign out to the mobile menu** (was missing).
- **Trivial-input guard**: typing "hi" no longer returns a misleading 0% verdict — it prompts for a real listing.
- **Accessibility**: keyboard focus rings, verdict `aria-live` announcement, skip-to-content link, `<main>` landmark.
- Honest **"any channel" ecosystem section** + "we never read your DMs" trust note.
- Engine verified on a real scam: **SCAM · confidence 0.9 · risk 100 · 5 evidence items.**

## ⚠️ Reminders
- Rotate any secrets that were shared in chat (MongoDB, Gemini, Atlas password).
- Verdict vocabulary stays **SCAM / SUSPICIOUS / LIKELY-LEGIT** (never "authentic/genuine"); keep the "decision-support, not a guarantee" disclaimer.
- Where the Gemini prompts live: `backend/agent.py` (verdict + normalizer instructions) and `backend/ingest.py` (multimodal extraction prompt).
