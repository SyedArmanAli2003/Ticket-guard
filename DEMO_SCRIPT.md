# PitchCraft — 3-minute demo video script

Judges weight the video heavily. Lead with the problem, show the working product
fast, name the tech. Keep it under 3:00 (only the first 3 min are judged).

## Shot list

**0:00–0:20 — Hook + problem**
> "Every founder has an idea. Almost none have an investor-ready plan — that takes
> weeks and an MBA. PitchCraft does it in 60 seconds, and it doesn't just chat —
> it's an agent that researches your market for you."

**0:20–0:35 — Name the stack (on screen)**
> "Built with Gemini on Google Cloud, the Agent Development Kit, and the MongoDB
> MCP server with Atlas Vector Search."
Show the landing page (pills: MongoDB Atlas · Gemini 2.5 · Agent Builder · Cloud Run).

**0:35–1:50 — The mission (the core)**
Type: *"A medicine delivery app for rural villages in India."* Hit Analyze.
Narrate as steps stream:
> "Step 1, it validates the idea. Step 2 — watch this — the agent calls **Atlas
> Vector Search** and queries MongoDB through the **MCP server** to ground its
> market research in real data."
Point at the live tool-activity chips (🍃 MongoDB MCP · 🔎 Atlas Vector Search).
> "It builds personas, writes the plan, projects three-year financials, analyzes
> risk — and you stay in control: if an idea scores low, it pauses and asks."
(If you have a risky idea queued, show the human-in-the-loop gate briefly.)

**1:50–2:30 — The payoff**
Open the finished plan page. Scroll: validation score, market research table,
personas, financials chart, SWOT, and the **30/60/90-day action plan** +
investor one-liner.
> "It doesn't stop at analysis — it hands you an execution plan and an investor
> pitch line. Every plan is saved to MongoDB with a shareable link."
Click Share / show the share URL.

**2:30–2:55 — Impact + close**
> "PitchCraft turns a sentence into a data-grounded plan — for the millions of
> founders, students, and small businesses who can't afford a consultant.
> Gemini provides the brain; MongoDB gives it memory and market intelligence."
Show the `/api/mcp/info` JSON for half a second as proof of the live MCP integration.

**2:55–3:00 — Logo + URL.**

## Tips
- Pre-warm the backend (Cloud Run cold start) right before recording.
- Have the plan pre-generated in another tab as a fallback if the live run is slow.
- Show the GitHub repo + hosted URL on screen at the end.
- English audio or subtitles. Upload to YouTube/Vimeo, public/unlisted.
