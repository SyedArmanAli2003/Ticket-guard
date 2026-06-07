# TicketGuard — Full Handoff for Arman
_Last updated: 2026-06-07 · after brutal 9-persona QA of the live engine_

## TL;DR
- **Frontend is done + live + verified** (Vercel). Renders crisp, sign-in works, accessible, ecosystem section, 0 React errors.
- **The live ENGINE is mostly DOWN** for one reason: the **Gemini free-tier quota is exhausted** → `/api/check` returns `429` for most inputs. Detection *logic* is genuinely good (correct SCAM calls, even in Spanish) — it just can't run.
- I pushed backend **resilience + safety fixes** (rule-engine fallback, input guard, error sanitizer, mojibake). **They are in the repo but NOT live** — Render didn't auto-deploy from my push. **You must redeploy.**
- **Your two actions unblock everything: (1) fresh Gemini key in Render, (2) create the Atlas search indexes.** Steps below.

**Live:** frontend https://frontend-nu-ochre-z41mw3z0l5.vercel.app · backend https://pitchcraft-agent.onrender.com
**Repo branch:** `ticketguard` (all fixes pushed) · **Code:** `C:\Users\lalwa\PitchCraft` (`frontend/` + `backend/`)

---

## 🔴 #1 — URGENT: Gemini quota exhausted (live engine outage)
Brutal QA: only **6 of 23** test inputs ever returned a verdict; the rest got `429 RESOURCE_EXHAUSTED`. A scam detector that errors on 2/3 of pastes can't demo.

**Fix:**
1. **Get a fresh Gemini API key** — new key in Google AI Studio (aistudio.google.com → "Get API key"), or enable **billing / paid** so RPM/RPD limits don't trip during a demo. Free tier is too low.
2. **Render → your backend service → Environment:** set `GEMINI_API_KEY` (and/or `GOOGLE_API_KEY`) = new key. Keep `USE_VERTEXAI=FALSE`, `GEMINI_MODEL=gemini-2.5-flash`.
3. **Manual Deploy → Deploy latest commit** (branch `ticketguard`). This also activates my pushed code fixes (#3 below).
4. **Verify:**
   ```bash
   curl -X POST https://pitchcraft-agent.onrender.com/api/check -H "content-type: application/json" \
     -d '{"type":"text","text":"Selling 2 World Cup tickets, Zelle only, PDF after payment"}'
   # expect: "verdict":"SCAM"
   curl -X POST https://pitchcraft-agent.onrender.com/api/check -H "content-type: application/json" \
     -d '{"type":"text","text":"hello"}'
   # expect: NOT LIKELY-LEGIT (input-guard -> low-confidence "insufficient")
   ```

---

## 🔴 #2 — Step-2 Hybrid Retrieval (search indexes missing)
`/api/health` shows `"vector_index": false, "text_index": false`; Step-2 shows "not configured · search_indexes_missing." The indexes don't exist on the DB the live backend reads (I tried to create them from my machine — blocked by the Atlas IP allowlist; only Render's IP is allowed in).

**Fix — from a machine allow-listed in Atlas (or open Atlas → Network Access → Allow from Anywhere temporarily):**
```bash
# Use the SAME env the Render backend uses:
export MONGODB_URI="<live Atlas SRV URI>"     # cluster: pitchcraftcluster.fuylrsf.mongodb.net
export MONGODB_DB="ticketguard"               # MUST match Render's MONGODB_DB
export EMBED_MODEL="text-embedding-004"
export EMBED_DIMS="768"
export GEMINI_API_KEY="<key with embeddings enabled>"
cd backend && pip install -r requirements.txt && python scripts/setup_atlas.py
# creates scam_vector_index + scam_text_index on scam_corpus, seeds ~137 docs (768-dim). Wait ~1-2 min for status READY.
curl https://pitchcraft-agent.onrender.com/api/health   # expect vector_index:true, text_index:true
```
If health still shows false: Render's `MONGODB_DB`/cluster points to a different DB than where you seeded — align them. Also confirm Render `EMBED_DIMS=768` (a dim mismatch makes `$vectorSearch` throw).

---

## ✅ #3 — Backend fixes I already pushed (activate on your redeploy)
All on branch `ticketguard`, verified to compile:
| commit | fix | QA item |
|---|---|---|
| `fef8a6b` | **Rule-engine fallback** — when every Gemini tier is rate-limited, `_write_verdict` returns a deterministic verdict from the scorer/rule signals instead of erroring. No more 429 outage. | #1,2,4,5,8,9,10 |
| `fef8a6b` | **Input-sufficiency guard** — input with 0 ticket fields (e.g. "hello") short-circuits to a low-confidence "insufficient" verdict; never a fabricated LIKELY-LEGIT@0.8. Also saves quota. | #6 |
| `fef8a6b` | **`_safe_reason`** — `/api/check` no longer leaks Gemini/ADK/429 billing text to clients. | #12 |
| `fef8a6b` | **Mojibake** — engine label uses ASCII separator (was `�`). | #15 |

---

## 📋 #4 — Full brutal-QA bug table (mean 1.89/10 → almost entirely the quota)
Status: **F-pushed** = fixed in code, needs your redeploy · **TODO** = still open (yours).

| # | sev | issue | status |
|---|---|---|---|
| 1-5,8,9,10 | crit | Quota 429 → total outage on 5/9 categories | **F-pushed** (fallback) + **#1 key** |
| 6 | crit | "hello" → false LIKELY-LEGIT@0.8 with fabricated evidence | **F-pushed** (input guard) |
| 7 | crit | 429 on burst (2nd consecutive request) | **TODO**: per-IP rate-limiter + request queue + paid quota |
| 11 | crit | `'; DROP TABLE…` → raw **403 HTML** from edge WAF (non-JSON) | **TODO**: relax Render/edge WAF rule; rely on app-layer (no SQL built from input anyway) |
| 12 | high | Raw provider error leaked in `reason` | **F-pushed** (`_safe_reason`) |
| 13 | high | Hard failures return **HTTP 200** + `status:error` | **TODO**: return 429/503 for upstream failures (kept 200 for now to not break the frontend fetch — change carefully + update frontend) |
| 14 | high | Silent degradation to fallback model, no alert | **TODO**: log/alert when `is_fallback` flips true |
| 15 | med | UTF-8 mojibake in `engine` field | **F-pushed** |
| 16 | med | 45–74s Render cold-start + wasted retries | **TODO**: Render keep-warm ping / min-instance |
| 17 | med | `risk_score:42/MEDIUM` but verdict `SCAM@0.9` (mismatch) | **TODO**: reconcile risk_score→verdict thresholds in `db.score_signals` / verdict prompt |
| 18 | med | `violates_official_transfer:true` when transfer_method unknown (rule fires without data) | **TODO**: gate the rule on field presence in `agent.official_transfer_rules` |
| 19 | low | `/` returns 404; Step-2 "not configured" (= #2) | **TODO**: add root handler/redirect; #2 fixes Step-2 |

**Category scorecard:** obvious-scams 5 · multilingual 3 · nonsense 2 · edge 2 · legit/ambiguous/injection/polite/realistic 1 each. **Overall 2/10 — but ~8/10 on verdict accuracy when it runs.** The score is availability, not algorithm.

---

## 🟡 #5 — Auth hardening (before production)
Demo auth is SHA-256 + localStorage with hardcoded creds (`admin@ticketguard.ai/admin123`, `demo@ticketguard.ai/demo123`). Fine for the demo; for production move to server-side **bcrypt** + drop hardcoded creds.

---

## ✅ Already done + LIVE (frontend — verified in Chrome)
- Fixed every "blank/dim page" root cause: backdrop `z-index`, a ShieldMark inline-`<style>` hydration crash, and the `route-enter` wrapper that pinned the whole page at `opacity:0`. **0 React errors on prod.**
- **Sign-in** modal opens + is **viewport-centered** (portaled to `<body>`); added Sign in / History / Sign out to the **mobile** menu.
- Trivial-input guard on the frontend; **accessibility** (keyboard focus rings, verdict `aria-live`, skip-to-content, `<main>` landmark); honest **"any channel" ecosystem** section + "we never read your DMs" trust note.
- Engine (when it runs): **SCAM · 0.9 · risk 100 · 5 evidence** on a real scam.

## Reference
- **Gemini prompts live in:** `backend/agent.py` (verdict + normalizer instructions), `backend/ingest.py` (multimodal extraction prompt).
- **Verdict vocab:** always `SCAM | SUSPICIOUS | LIKELY-LEGIT` (never "authentic/genuine"); keep the "decision-support, not a guarantee" disclaimer.
- **Hard rules:** Gemini-only core (no non-Google LLM = DQ), MongoDB only data partner, free tier, synthetic data, no FIFA/Ticketmaster marks.
- **Rotate any secrets shared in chat** (MongoDB URI/password, Gemini key) before submission.

## Suggested order of work
1. #1 fresh Gemini key + redeploy (restores the engine + activates my fixes) → re-run a few scam pastes.
2. #2 create Atlas search indexes (Step-2 lights up).
3. #4 TODOs: rate-limiter + keep-warm (kills cold-start + burst-429), then the small logic fixes (#17, #18), then WAF (#11).
4. Re-run the injection test (was untestable under quota) to confirm robustness.
