"use client"
import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight, ArrowLeft, Search, Upload, Link2, FileText, AlertTriangle, X } from "lucide-react"
import Navbar from "@/components/Navbar"
import InvestigationStep from "@/components/InvestigationStep"
import RiskCard from "@/components/RiskCard"
import LiveFeed from "@/components/LiveFeed"
import HealthStrip from "@/components/HealthStrip"
import type {
  AgentStep,
  ToolSource,
  ToolActivity,
  Investigation,
  FeedItem,
  HealthResponse,
  InvestigateFrame,
  InvestigateRequestBody,
  RealListing,
  RealRetrievalHit,
  RealVerdict,
} from "@/lib/types"
import {
  investigate as mockInvestigate,
  SAMPLE_LISTINGS,
  seedFeed,
  feedItemFromInvestigation,
} from "@/lib/mock"
import { getMode } from "@/lib/config"
import { getHealth, investigateStream, postReport, openFeed, fileToDataUri } from "@/lib/api"
import {
  freshRealSteps,
  REAL_STEPS,
  REAL_TOTAL,
  buildInvestigation,
  reportToFeedItem,
  toolSource,
  type RealResult,
} from "@/lib/realmap"
import { usePrefersReducedMotion, staggerContainer, fadeUpItem, EASE_OUT } from "@/lib/motion"

// ── Mock 5-step plan (unchanged behaviour) ────────────────────────────────────
const STEP_DEFS: {
  name: string
  tool: ToolSource
  activity: ToolActivity[]
  delay: number
  pick: (inv: Investigation) => Record<string, unknown>
}[] = [
  { name: "Extract entities", tool: "gemini", activity: [{ tool: "extract_entities", source: "gemini", preview: "listing text" }], delay: 700, pick: inv => ({ entities: inv.entities }) },
  { name: "Hybrid search scam corpus", tool: "vector", activity: [{ tool: "vector_search", source: "vector", preview: "embedding · k=50" }, { tool: "text_search", source: "mongodb", preview: "$search index" }], delay: 1000, pick: inv => ({ matches: inv.matches }) },
  { name: "Score risk", tool: "mongodb", activity: [{ tool: "aggregate", source: "mongodb", preview: "$group · risk_score" }], delay: 750, pick: inv => ({ riskScore: inv.riskScore, riskLevel: inv.riskLevel }) },
  { name: "Check official-transfer rule", tool: "system", activity: [{ tool: "rule.official_transfer", source: "system", preview: "" }], delay: 650, pick: inv => ({ rule: inv.rule }) },
  { name: "Verdict", tool: "gemini", activity: [{ tool: "compose_verdict", source: "gemini", preview: "" }], delay: 850, pick: inv => ({ rationale: inv.rationale, riskLevel: inv.riskLevel }) },
]
const MOCK_TOTAL = STEP_DEFS.length
const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

type IngestKind = "text" | "url" | "file"

function InvestigateContent() {
  const searchParams = useSearchParams()
  const reduced = usePrefersReducedMotion()
  const mode = getMode()
  const isReal = mode === "real"
  const isMock = mode === "mock"

  // ── shared UI state ──
  const [ingest, setIngest] = useState<IngestKind>("text")
  const [text, setText] = useState("")
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<Investigation | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [reported, setReported] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const runId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const TOTAL = isReal ? REAL_TOTAL : MOCK_TOTAL

  // ── real-mode health + feed-offline state ──
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(isReal)
  const [feedOffline, setFeedOffline] = useState(false)
  // accumulate real result pieces across the stream
  const realAcc = useRef<RealResult>({ listing: null, retrieval: [], verdict: null, riskScore: null, confidence: 0 })

  // ── input recap text (what we show under "Investigating") ──
  const recap = ingest === "url" ? url : ingest === "file" ? (file?.name || "Uploaded file") : text

  // ── on mount: mock seeds the simulated feed; real fetches health + opens SSE feed ──
  useEffect(() => {
    if (isMock) {
      setFeed(seedFeed())
      return
    }
    if (!isReal) return
    let alive = true
    const ctrl = new AbortController()
    getHealth(ctrl.signal)
      .then(h => { if (alive) { setHealth(h); setHealthLoading(false) } })
      .catch(() => { if (alive) { setHealth(null); setHealthLoading(false) } })
    // Real live feed (change stream) — hello backfill + per-insert.
    const close = openFeed(
      (e) => {
        if (!alive) return
        if (e.type === "hello") {
          if (e.status === "not_configured") { setFeedOffline(true); return }
          setFeedOffline(false)
          setFeed((e.recent || []).map(r => reportToFeedItem(r, false)))
        } else if (e.type === "report") {
          setFeed(prev => {
            const item = reportToFeedItem(e.report, true)
            const next = [item, ...prev].slice(0, 12)
            setTimeout(() => { if (alive) setFeed(p => p.map(f => f.id === item.id ? { ...f, isLive: false } : f)) }, 2600)
            return next
          })
        } else if (e.type === "feed" && e.status === "not_configured") {
          setFeedOffline(true)
        }
      },
      () => { if (alive) setFeedOffline(true) }
    )
    return () => { alive = false; ctrl.abort(); close() }
  }, [isMock, isReal])

  const freshMockSteps = (): AgentStep[] =>
    STEP_DEFS.map((d, i) => ({ stepNumber: i + 1, name: d.name, status: "waiting", tool: d.tool, kind: "mock" }))

  // ── MOCK runner (preserved) ──
  const runMock = useCallback(async (input: string) => {
    if (!input.trim()) return
    const id = ++runId.current
    setSubmitted(true); setIsRunning(true); setResult(null); setReported(false); setRunError(null)
    setSteps(freshMockSteps())
    const inv = mockInvestigate(input)
    for (let i = 0; i < STEP_DEFS.length; i++) {
      if (runId.current !== id) return
      const n = i + 1
      const def = STEP_DEFS[i]
      setSteps(prev => prev.map(s => s.stepNumber === n ? { ...s, status: "running", startedAt: Date.now(), activity: def.activity } : s))
      await wait(def.delay)
      if (runId.current !== id) return
      setSteps(prev => prev.map(s => s.stepNumber === n ? { ...s, status: "complete", completedAt: Date.now(), data: def.pick(inv) } : s))
    }
    if (runId.current !== id) return
    setResult(inv); setIsRunning(false)
  }, [])

  // ── REAL runner: consume the SSE stream, map frames → steps + verdict ──
  const runReal = useCallback(async (body: InvestigateRequestBody, recapText: string) => {
    const id = ++runId.current
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSubmitted(true); setIsRunning(true); setResult(null); setReported(false); setRunError(null)
    setSteps(freshRealSteps())
    realAcc.current = { listing: null, retrieval: [], verdict: null, riskScore: null, confidence: 0 }

    const onFrame = (frame: InvestigateFrame) => {
      if (runId.current !== id) return
      // tool activity: append the real backend tool call (deduped by tool name).
      if ("type" in frame && frame.type === "tool") {
        setSteps(prev => prev.map(s => {
          if (s.stepNumber !== frame.step) return s
          const existing = s.activity || []
          if (existing.some(a => a.tool === frame.tool)) return s
          const preview = frame.source && !frame.source.includes("+") ? frame.source : ""
          return { ...s, activity: [...existing, { tool: frame.tool, source: toolSource(frame.source), preview }] }
        }))
        return
      }
      const f = frame as Exclude<InvestigateFrame, { type: "tool" }>
      // finalize
      if (f.step === 99) {
        const d = (f.status === "complete" ? (f as { data?: RealResult & { risk_score?: number | null } }).data : undefined)
        if (f.status === "error") { setRunError((f as { error?: string }).error || "Investigation failed."); setIsRunning(false); return }
        if (d) {
          realAcc.current.riskScore = (d as { risk_score?: number | null }).risk_score ?? realAcc.current.riskScore
          realAcc.current.investigationId = (d as { investigation_id?: string }).investigation_id
          realAcc.current.engine = (d as { engine?: string }).engine
        }
        setResult(buildInvestigation(realAcc.current, recapText))
        setIsRunning(false)
        return
      }
      // per-step
      const stepNo = f.step
      if (f.status === "running") {
        // Seed the step's representative tool chips immediately so the premium
        // chip-stagger motion plays for every step (real tool frames append on top).
        const seed = REAL_STEPS[stepNo - 1]?.activity || []
        setSteps(prev => prev.map(s => s.stepNumber === stepNo
          ? { ...s, status: "running", startedAt: s.startedAt || Date.now(), activity: (s.activity && s.activity.length ? s.activity : seed) }
          : s))
        return
      }
      // complete | not_configured | error → close out the step + capture data
      const data = f.data as Record<string, unknown> | undefined
      // capture accumulators for the final verdict
      if (stepNo === 1 && f.status === "complete" && data?.listing) realAcc.current.listing = data.listing as RealListing
      if (stepNo === 2 && f.status === "complete" && Array.isArray(data?.results)) realAcc.current.retrieval = data!.results as RealRetrievalHit[]
      if (stepNo === 5 && f.status === "complete" && typeof data?.score === "number") realAcc.current.riskScore = data!.score as number
      if (stepNo === 7 && f.status === "complete" && data) {
        realAcc.current.verdict = data as unknown as RealVerdict
        realAcc.current.confidence = Number((data as { confidence?: number }).confidence ?? 0)
      }
      const reason = f.status === "error"
        ? ((f as { error?: string }).error || "step failed")
        : (data && typeof data.reason === "string" ? (data.reason as string) : undefined)
      setSteps(prev => prev.map(s => s.stepNumber === stepNo
        ? { ...s, status: f.status, completedAt: Date.now(), data, reason }
        : s))
      // Hard stops: the backend returns early when step 1 (normalize) or step 7
      // (verdict) can't complete — no further frames arrive, so surface it now.
      if (stepNo === 1 && (f.status === "error" || f.status === "not_configured")) {
        setRunError(f.status === "not_configured"
          ? `Normalizer not configured: ${reason || "Gemini key missing"}.`
          : `Could not read the listing: ${reason || "normalize failed"}.`)
        setIsRunning(false)
      }
      if (stepNo === 7 && f.status === "error") {
        setRunError(`Verdict could not be produced: ${reason || "the verdict writer failed"}.`)
        setIsRunning(false)
      }
    }

    try {
      await investigateStream(body, onFrame, ctrl.signal)
      if (runId.current === id) setIsRunning(false)
    } catch (e) {
      if (runId.current !== id) return
      if ((e as Error)?.name === "AbortError") return
      setRunError(e instanceof Error ? e.message : "Investigation request failed.")
      setIsRunning(false)
    }
  }, [])

  // ── unified submit ──
  const submit = useCallback(async () => {
    if (isRunning) return
    if (isMock) { await runMock(text); return }
    if (!isReal) return
    if (ingest === "text") {
      if (!text.trim()) return
      await runReal({ type: "text", text: text.trim() }, text.trim())
    } else if (ingest === "url") {
      if (!url.trim()) return
      await runReal({ type: "url", url: url.trim() }, url.trim())
    } else if (ingest === "file") {
      if (!file) return
      const dataUri = await fileToDataUri(file)
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      await runReal(
        { type: isPdf ? "pdf" : "image", file_b64: dataUri, filename: file.name, content_type: file.type || (isPdf ? "application/pdf" : "image/png") },
        file.name
      )
    }
  }, [isRunning, isMock, isReal, ingest, text, url, file, runMock, runReal])

  // ── deep links (?demo=true / ?example=<id>) — only meaningful with text input ──
  useEffect(() => {
    const ex = searchParams.get("example")
    const demo = searchParams.get("demo")
    if (ex || demo === "true") {
      const sample = SAMPLE_LISTINGS.find(s => s.id === ex) || SAMPLE_LISTINGS[0]
      setIngest("text")
      setText(sample.text)
      if (isMock) {
        const t = setTimeout(() => runMock(sample.text), 700)
        return () => clearTimeout(t)
      }
      if (isReal) {
        const t = setTimeout(() => runReal({ type: "text", text: sample.text }, sample.text), 700)
        return () => clearTimeout(t)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fillExample = () => {
    setIngest("text")
    setText(SAMPLE_LISTINGS[Math.floor(Math.random() * SAMPLE_LISTINGS.length)].text)
  }

  const reset = () => {
    runId.current++
    abortRef.current?.abort()
    setSubmitted(false); setSteps([]); setResult(null); setReported(false); setIsRunning(false); setRunError(null)
    setText(""); setUrl(""); setFile(null)
  }

  // ── Report listing ──
  const handleReport = useCallback(async () => {
    if (!result || reported) return
    if (isMock) {
      setReported(true)
      setTimeout(() => {
        const item = feedItemFromInvestigation(result)
        setFeed(prev => [item, ...prev].slice(0, 8))
        setTimeout(() => setFeed(prev => prev.map(f => f.id === item.id ? { ...f, isLive: false } : f)), 2600)
      }, 1500)
      return
    }
    if (!isReal) return
    // Build a report from the real listing accumulator.
    const l = realAcc.current.listing
    const res = await postReport({
      text: recap || result.inputText || "Reported via TicketGuard",
      domain: l?.domain || undefined,
      handle: l?.seller_handle || undefined,
      pattern_type: realAcc.current.retrieval[0]?.pattern_type || undefined,
      payment_method: l?.payment_method || undefined,
      barcode_or_ref: l?.barcode_or_ref || undefined,
    })
    if (res.status === "ok") {
      setReported(true)
      // The change stream will echo it back into the feed; nothing else to do.
    } else {
      // honest: surface that the report could not be persisted
      setRunError(res.reason ? `Report not saved: ${res.reason}` : "Report not saved (backend not configured).")
    }
  }, [result, reported, isMock, isReal, recap])

  const completedCount = steps.filter(s => s.status === "complete" || s.status === "not_configured").length
  const geminiBlocked = isReal && health != null && health.gemini === false
  const atlasOffline = isReal && health != null && health.atlas === false
  const canSubmit = !isRunning && !geminiBlocked && (
    isMock ? text.trim().length > 0
    : ingest === "text" ? text.trim().length > 0
    : ingest === "url" ? url.trim().length > 0
    : !!file
  )

  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100vh" }}>
      <Navbar />

      {/* mock-mode watermark — corner badge complements the Navbar DEMO chip */}
      {isMock && (
        <div className="fixed bottom-4 right-4 z-40 pointer-events-none">
          <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: "var(--tg-warn-tint)", color: "var(--tg-warn)", border: "1px solid var(--tg-warn-border)", backdropFilter: "blur(8px)" }}>
            DEMO — no live backend
          </span>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div>
            {/* UNCONFIGURED state — explicit, no silent mock */}
            {mode === "unconfigured" && !submitted && (
              <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT }}
                className="rounded-2xl p-8" style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-warn-border)", boxShadow: "var(--tg-shadow), 0 0 36px var(--tg-warn-tint)" }}>
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle size={22} style={{ color: "var(--tg-warn)" }} strokeWidth={2.2} />
                  <h1 className="text-xl font-bold font-display" style={{ color: "var(--tg-text)" }}>Not configured</h1>
                </div>
                <p className="text-sm mb-2" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
                  No backend is wired up. Set <code style={{ color: "var(--tg-info)" }}>NEXT_PUBLIC_API_URL</code> to the TicketGuard
                  API to run live investigations, or set <code style={{ color: "var(--tg-info)" }}>NEXT_PUBLIC_DEMO=mock</code> to use the synthetic demo.
                </p>
                <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>
                  Nothing is mocked silently — this app never fabricates a verdict.
                </p>
              </motion.div>
            )}

            {(isReal || isMock) && !submitted && (
              <motion.div variants={staggerContainer(0.08, 0.04)} initial={reduced ? false : "hidden"} animate="show">
                <motion.h1 variants={fadeUpItem} className="font-bold mb-3 tracking-tight font-display" style={{ fontSize: "clamp(1.8rem,4.5vw,3rem)", color: "var(--tg-text)" }}>
                  Check a resale listing
                </motion.h1>
                <motion.p variants={fadeUpItem} className="mb-6 text-sm" style={{ color: "var(--tg-text-2)", maxWidth: 560, lineHeight: 1.6 }}>
                  Paste a suspicious listing or seller DM, drop in a ticket PDF/screenshot, or
                  paste a listing URL. The agent extracts the signals, runs a hybrid search over a
                  known-scam corpus, and returns an evidence-backed risk verdict.
                </motion.p>

                {/* REAL: health strip + gating notes */}
                {isReal && (
                  <motion.div variants={fadeUpItem}>
                    <HealthStrip health={health} loading={healthLoading} />
                    {geminiBlocked && (
                      <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-2" style={{ background: "var(--tg-risk-high-soft)", border: "1px solid var(--tg-risk-high-border)" }}>
                        <AlertTriangle size={15} style={{ color: "var(--tg-risk-high)" }} strokeWidth={2.2} />
                        <p className="text-xs" style={{ color: "var(--tg-risk-high)" }}>Gemini not configured — investigation is unavailable until the backend has a Gemini key.</p>
                      </div>
                    )}
                    {!geminiBlocked && atlasOffline && (
                      <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-2" style={{ background: "var(--tg-warn-tint)", border: "1px solid var(--tg-warn-border)" }}>
                        <AlertTriangle size={15} style={{ color: "var(--tg-warn)" }} strokeWidth={2.2} />
                        <p className="text-xs" style={{ color: "var(--tg-warn)" }}>DB features offline (retrieval, live feed, persistence). Gemini-only investigation still works — affected steps show “not configured”.</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Source selector */}
                <motion.div variants={fadeUpItem} className="flex flex-wrap gap-1.5 mb-3">
                  {([
                    { k: "text" as IngestKind, label: "Paste text", Icon: FileText },
                    { k: "file" as IngestKind, label: "Upload PDF/image", Icon: Upload },
                    { k: "url" as IngestKind, label: "Paste URL", Icon: Link2 },
                  ]).map(({ k, label, Icon }) => {
                    const active = ingest === k
                    const disabled = isMock && k !== "text"
                    return (
                      <button
                        key={k}
                        onClick={() => !disabled && setIngest(k)}
                        disabled={disabled}
                        title={disabled ? "Available in live mode" : undefined}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: active ? "var(--tg-accent-tint-2)" : "var(--tg-surface-2)",
                          color: active ? "var(--tg-accent)" : "var(--tg-text-2)",
                          border: `1px solid ${active ? "var(--tg-accent-border)" : "var(--tg-border-strong)"}`,
                        }}
                      >
                        <Icon size={13} strokeWidth={2.2} /> {label}
                      </button>
                    )
                  })}
                </motion.div>

                {/* Input surface (varies by source) */}
                {ingest === "text" && (
                  <motion.textarea
                    variants={fadeUpItem}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Paste a resale listing or seller DM here…"
                    maxLength={2000}
                    className="w-full rounded-xl p-5 text-base resize-none outline-none"
                    style={{ minHeight: "150px", background: "var(--tg-surface)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)", caretColor: "var(--tg-accent)" }}
                    onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
                    onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit() }}
                  />
                )}
                {ingest === "url" && (
                  <motion.input
                    variants={fadeUpItem}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://marketplace.example/listing/123"
                    inputMode="url"
                    className="w-full rounded-xl p-5 text-base outline-none"
                    style={{ background: "var(--tg-surface)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)", caretColor: "var(--tg-accent)" }}
                    onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
                    onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
                    onKeyDown={e => { if (e.key === "Enter") submit() }}
                  />
                )}
                {ingest === "file" && (
                  <motion.div variants={fadeUpItem}>
                    <label
                      className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer transition-colors"
                      style={{ minHeight: 150, background: "var(--tg-surface)", border: "1px dashed var(--tg-border-strong)" }}
                    >
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={e => setFile(e.target.files?.[0] || null)}
                      />
                      <Upload size={22} style={{ color: "var(--tg-accent)" }} strokeWidth={2} />
                      <p className="text-sm" style={{ color: "var(--tg-text-2)" }}>
                        {file ? file.name : "Click to upload a ticket PDF or screenshot"}
                      </p>
                      <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>PDF, PNG, JPG, WEBP</p>
                    </label>
                    {file && (
                      <button onClick={() => setFile(null)} className="inline-flex items-center gap-1 text-xs mt-2 cursor-pointer" style={{ color: "var(--tg-text-3)" }}>
                        <X size={12} /> Remove
                      </button>
                    )}
                  </motion.div>
                )}

                <motion.div variants={fadeUpItem} className="flex justify-between items-center mt-2 mb-6 flex-wrap gap-2">
                  {ingest === "text" ? (
                    <button onClick={fillExample} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-surface-2)")}>
                      <Sparkles size={12} strokeWidth={2.2} /> Try an example
                    </button>
                  ) : <span />}
                  {ingest === "text" && <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>{text.length} / 2000 · ⌘/Ctrl + Enter</p>}
                </motion.div>

                <motion.button
                  variants={fadeUpItem}
                  onClick={submit}
                  disabled={!canSubmit}
                  whileTap={reduced || !canSubmit ? undefined : { scale: 0.99 }}
                  className="w-full py-4 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)", boxShadow: "0 8px 24px var(--tg-accent-glow)" }}
                >
                  {isRunning ? "Investigating…" : (<><Search size={16} strokeWidth={2.4} /> Investigate this listing <ArrowRight size={15} strokeWidth={2.4} /></>)}
                </motion.button>

                {/* quick example pills (text only) */}
                {ingest === "text" && (
                  <motion.div variants={fadeUpItem} className="mt-6">
                    <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "var(--tg-text-3)" }}>Or try one of these</p>
                    <div className="flex flex-wrap gap-2">
                      {SAMPLE_LISTINGS.map(s => (
                        <button key={s.id} onClick={() => { setText(s.text) }}
                          className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                          style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--tg-accent-border)")}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--tg-border-strong)")}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                <motion.p variants={fadeUpItem} className="text-xs mt-8" style={{ color: "var(--tg-text-3)", lineHeight: 1.5 }}>
                  Decision-support only, not a guarantee — verify independently.{isMock ? " About the data: synthetic demo data only." : ""}
                </motion.p>
              </motion.div>
            )}

            {submitted && (
              <>
                <div className="mb-6">
                  <div className="flex justify-between items-start mb-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--tg-text-3)" }}>Investigating</p>
                      <p className="text-sm" style={{ color: "var(--tg-text)", lineHeight: 1.5 }}>
                        &ldquo;{recap.length > 180 ? recap.slice(0, 180) + "…" : recap}&rdquo;
                      </p>
                    </div>
                    <p className="text-xs flex-shrink-0 mt-4" style={{ color: "var(--tg-text-3)" }}>{completedCount}/{TOTAL}</p>
                  </div>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--tg-track-2)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: "var(--tg-accent)", boxShadow: "0 0 8px var(--tg-accent-glow)" }}
                      animate={{ width: `${(completedCount / TOTAL) * 100}%` }} transition={{ duration: reduced ? 0 : 0.7, ease: EASE_OUT }} />
                  </div>
                </div>

                {steps.map(step => <InvestigationStep key={step.stepNumber} step={step} total={TOTAL} />)}

                {/* hard-stop / transport error (honest) */}
                {runError && !isRunning && (
                  <div className="rounded-2xl p-5 mt-3 mb-1 flex items-start gap-3" style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-risk-high-border)" }}>
                    <AlertTriangle size={18} style={{ color: "var(--tg-risk-high)" }} strokeWidth={2.2} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--tg-risk-high)" }}>Investigation could not complete</p>
                      <p className="text-xs mt-1" style={{ color: "var(--tg-text-2)", lineHeight: 1.5 }}>{runError}</p>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {result && !isRunning && (
                    <motion.div className="mt-5" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <RiskCard investigation={result} onReport={handleReport} reported={reported} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isRunning && (
                  <button onClick={reset} className="w-full mt-2 py-3 rounded-xl font-medium text-sm cursor-pointer inline-flex items-center justify-center gap-1.5 transition-colors"
                    style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-surface-2)")}>
                    <ArrowLeft size={15} strokeWidth={2.2} /> Check another listing
                  </button>
                )}
              </>
            )}
          </div>

          {/* Live feed sidebar */}
          <aside className="lg:sticky lg:top-28">
            <LiveFeed items={feed} offline={isReal && feedOffline} mock={isMock} />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function InvestigatePage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100vh" }} />}>
      <InvestigateContent />
    </Suspense>
  )
}
