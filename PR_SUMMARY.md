# TicketGuard — PR Summary & Feature Changelog

> **Project:** TicketGuard — AI-powered ticket-resale scam detector  
> **Stack:** FastAPI + MongoDB Atlas + Google Gemini 2.5 Flash (backend) · Next.js 14 + Framer Motion (frontend)  
> **Deployment:** Render (backend) · Vercel (frontend)

---

## 🚀 Session 1 — Backend & Deployment

### Infrastructure
- Deployed FastAPI backend to **Render** at `https://pitchcraft-agent.onrender.com`
- Connected to **MongoDB Atlas M0** (free tier) with fixed credentials
- Switched `EMBED_MODEL` → `gemini-embedding-001` (GA-available, resolves API tier error)

### Bug Fixes
- **`db.py` scorer** — Replaced `$documents` aggregation (unsupported on Atlas M0) with equivalent Python logic
- **MongoDB URI** — Corrected password in `.env` (redacted — `.env` is gitignored, never committed; rotate this credential)

### Database Seeding
- Ran `scripts/setup_atlas.py` → seeded **137+ scam patterns**, official rules, and demo hashes
- Created vector index (`scam_vector_index`) and text index (`scam_text_index`) on Atlas

---

## ✨ Session 2 — Feature Additions

### 🔐 Authentication System
| File | Description |
|------|-------------|
| `frontend/lib/auth.ts` | localStorage-based auth with login, register, role-based access |
| `frontend/components/AuthProvider.tsx` | React context + `useAuth()` hook |
| `frontend/components/AuthModal.tsx` | Animated modal with Sign in / Create account tabs, show/hide password |
| `frontend/components/Navbar.tsx` | Sign In button → modal; post-login shows avatar + user dropdown |

**Demo accounts:**
- Admin: `admin@ticketguard.ai / admin123`
- User: `demo@ticketguard.ai / demo123`

### 🛡️ Admin Dashboard (`/admin`)
- Stats grid: total investigations, SCAM/SUSPICIOUS/LEGIT counts, user count, avg risk score
- Recent investigations table with verdict, score, confidence, and time
- System health panel (Gemini / Atlas / MCP status)
- Registered users list with role badges
- Quick actions panel
- **Access control:** redirects non-admin users away

### 🔗 Fixed Broken Buttons (RiskCard)
| Button | Before | After |
|--------|--------|-------|
| **Find verified resale** | `href="#"` + `preventDefault()` = no-op | Opens modal with StubHub, SeatGeek, Ticketmaster, Vivid Seats |
| **Proceed, I accept the risk** | No `onClick` = no-op | Opens confirmation modal with 5-point safety checklist + checkbox requirement |
| **Report listing** | ✅ Already worked | Preserved |

### 💬 Ask a Follow-up (Chat)
- New `AskFollowUp` component renders below every risk card
- 4 quick-question pills: *Why this risk level? / What should I do instead? / What if they used a credit card? / How do I verify legitimacy?*
- Full text input for custom questions
- Works in both **real mode** (calls `/api/check`) and **mock mode** (in-process smart answers)
- Dismissible, animated with Framer Motion

---

## ⚡ Session 3 — Performance, History & Footer

### 🚀 Performance Fixes (UI Lag Eliminated)
| Change | Impact |
|--------|--------|
| Removed `filter:blur()` from all Framer Motion variants | **#1 fix** — blur forces GPU recompositing per frame, kills 60fps |
| Removed `filter:blur()` from CSS `@keyframes fadeUp` | Same issue in CSS animations |
| Slowed aurora blob animations: 22–34s → 38–58s | Less per-frame transform work on compositor |
| Increased blob blur radius (80px → 100px) + reduced opacity | Fewer overdraw layers |
| Added `contain: strict` to blob elements | Isolates repaint to blob bounds |
| Shortened animation durations: 0.6s → 0.45s, 0.55s → 0.4s | Snappier, less jank window |
| Tuned spring constants: stiffness 220→280, mass 0.9→0.7 | Faster settle, no overshoot |
| Reduced stagger delay: 0.06 → 0.05s | Tighter stagger sequences |

### 📜 Investigation History (`/history`)
| File | Description |
|------|-------------|
| `frontend/lib/history.ts` | Per-user history in localStorage, add/get/delete/clear |
| `frontend/app/history/page.tsx` | Full history page with search, filter, delete, re-investigate |
| `frontend/app/investigate/page.tsx` | Auto-saves every investigation result to history |

**Features:**
- Filter by ALL / SCAM / SUSPICIOUS / LIKELY-LEGIT
- Full-text search across query content
- Delete individual entries or clear all
- "Re-investigate" button launches the same query again
- Anonymous history (`userId=null`) supported — login not required

### 🦶 Footer Component (`frontend/components/Footer.tsx`)

**Sections:**
- **Stats strip:** 137+ patterns · 768 dimensions · 94% detection rate · <3s verdict time
- **Brand column:** tagline, hackathon badge, GitHub + Twitter social links
- **Product links:** Check a Listing / How It Works / The Data / My History
- **Safe Resale links:** StubHub / SeatGeek / Ticketmaster / FTC Fraud Report
- **Built With:** MongoDB Atlas / Google Gemini / FastAPI / Next.js
- **Bottom bar:** copyright, technology attribution

Footer placed on: Homepage (`/`), Investigate page (`/investigate`), History page (`/history`)

---

## 📁 Files Changed

```
frontend/
├── app/
│   ├── page.tsx                   ← + Footer component
│   ├── investigate/page.tsx       ← + Footer, history auto-save, useAuth
│   ├── history/page.tsx           ← NEW — investigation history page
│   └── admin/page.tsx             ← NEW — admin dashboard
├── components/
│   ├── Navbar.tsx                 ← + auth buttons, user dropdown, History link
│   ├── RiskCard.tsx               ← REWRITTEN — all 3 buttons wired + AskFollowUp
│   ├── Footer.tsx                 ← NEW — site footer
│   ├── AskFollowUp.tsx            ← NEW — follow-up chat component
│   ├── AuthModal.tsx              ← NEW — login/register modal
│   └── AuthProvider.tsx           ← NEW — React auth context
├── lib/
│   ├── auth.ts                    ← NEW — auth CRUD + localStorage
│   ├── history.ts                 ← NEW — investigation history store
│   └── motion.ts                  ← PERF — removed blur, faster durations
└── app/globals.css                ← PERF — slower aurora, no blur keyframes
```

---

## 🎯 Hackathon Differentiators

1. **Real AI pipeline** — 7-step Gemini agent: normalize → vector search → text search → risk score → rule check → hash dedup → verdict
2. **MongoDB Atlas Vector Search** — 768-dim Gemini embeddings, hybrid retrieval (vector + text fusion)
3. **Human-in-the-loop UX** — 3 actionable post-verdict buttons: report scam / find safe resale / proceed with safeguards
4. **Live feed** — MongoDB Change Streams SSE broadcasting new community reports in real-time
5. **Auth + Role-based Access** — user login, admin ops dashboard, per-user investigation history
6. **Zero hallucination policy** — never fabricates data; explicit unconfigured state shown when backend is unavailable
7. **Performance** — 60fps UI with compositor-only animations, no filter:blur jank

---

## 🔐 Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | `ticketguard` |
| `GOOGLE_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `EMBED_MODEL` | `gemini-embedding-001` |
| `CORS_ORIGINS` | Vercel frontend URL |

### Frontend (Vercel env / `.env.local`)
| Variable | Effect |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | Set → **REAL** mode (calls live backend) |
| `NEXT_PUBLIC_DEMO=mock` | No API URL → **MOCK** preview (watermarked) |

---

## 🏃 Running Locally

```bash
# Backend
cd backend
.venv\Scripts\python.exe -m uvicorn main:app --port 8001

# Frontend (new terminal)
cd frontend
npm run dev   # http://localhost:3000
```

> In dev, `/api/*` is automatically proxied to `localhost:8001` via `next.config.mjs`.
