"use client"
import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Navbar from "@/components/Navbar"
import InvestigationStep from "@/components/InvestigationStep"
import RiskCard from "@/components/RiskCard"
import LiveFeed from "@/components/LiveFeed"
import type { AgentStep, ToolSource, ToolActivity, Investigation, FeedItem } from "@/lib/types"
import {
  investigate,
  SAMPLE_LISTINGS,
  seedFeed,
  feedItemFromInvestigation,
} from "@/lib/mock"

// The 5-step mock plan. Each step maps to a slice of the Investigation result.
const STEP_DEFS: {
  name: string
  tool: ToolSource
  activity: ToolActivity[]
  // delay before this step completes (ms)
  delay: number
  // pick the slice of the investigation shown when this step completes
  pick: (inv: Investigation) => Record<string, unknown>
}[] = [
  {
    name: "Extract entities",
    tool: "gemini",
    activity: [{ tool: "extract_entities", source: "gemini", preview: "listing text" }],
    delay: 700,
    pick: inv => ({ entities: inv.entities }),
  },
  {
    name: "Hybrid search scam corpus",
    tool: "vector",
    activity: [
      { tool: "vector_search", source: "vector", preview: "embedding · k=50" },
      { tool: "text_search", source: "mongodb", preview: "$search index" },
    ],
    delay: 1000,
    pick: inv => ({ matches: inv.matches }),
  },
  {
    name: "Score risk",
    tool: "mongodb",
    activity: [{ tool: "aggregate", source: "mongodb", preview: "$group · risk_score" }],
    delay: 750,
    pick: inv => ({ riskScore: inv.riskScore, riskLevel: inv.riskLevel }),
  },
  {
    name: "Check official-transfer rule",
    tool: "system",
    activity: [{ tool: "rule.official_transfer", source: "system", preview: "" }],
    delay: 650,
    pick: inv => ({ rule: inv.rule }),
  },
  {
    name: "Verdict",
    tool: "gemini",
    activity: [{ tool: "compose_verdict", source: "gemini", preview: "" }],
    delay: 850,
    pick: inv => ({ rationale: inv.rationale, riskLevel: inv.riskLevel }),
  },
]
const TOTAL = STEP_DEFS.length

const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

function InvestigateContent() {
  const searchParams = useSearchParams()
  const [text, setText] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<Investigation | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [reported, setReported] = useState(false)
  const runId = useRef(0)

  // seed the feed on mount (client-side so timestamps are relative to "now")
  useEffect(() => {
    setFeed(seedFeed())
  }, [])

  const freshSteps = (): AgentStep[] =>
    STEP_DEFS.map((d, i) => ({ stepNumber: i + 1, name: d.name, status: "waiting", tool: d.tool }))

  const runInvestigation = useCallback(async (input: string) => {
    if (!input.trim()) return
    const id = ++runId.current
    setSubmitted(true)
    setIsRunning(true)
    setResult(null)
    setReported(false)
    setSteps(freshSteps())

    const inv = investigate(input)

    for (let i = 0; i < STEP_DEFS.length; i++) {
      if (runId.current !== id) return // a newer run superseded this one
      const n = i + 1
      const def = STEP_DEFS[i]
      // mark running + attach the tool activity trace
      setSteps(prev => prev.map(s =>
        s.stepNumber === n ? { ...s, status: "running", startedAt: Date.now(), activity: def.activity } : s))
      await wait(def.delay)
      if (runId.current !== id) return
      setSteps(prev => prev.map(s =>
        s.stepNumber === n ? { ...s, status: "complete", completedAt: Date.now(), data: def.pick(inv) } : s))
    }

    if (runId.current !== id) return
    setResult(inv)
    setIsRunning(false)
  }, [])

  // handle ?demo=true / ?example=<id> deep links
  useEffect(() => {
    const ex = searchParams.get("example")
    const demo = searchParams.get("demo")
    if (ex || demo === "true") {
      const sample = SAMPLE_LISTINGS.find(s => s.id === ex) || SAMPLE_LISTINGS[0]
      setText(sample.text)
      const t = setTimeout(() => runInvestigation(sample.text), 700)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fillExample = () => {
    // rotate through samples so repeated clicks vary the verdict
    const next = SAMPLE_LISTINGS[Math.floor(Math.random() * SAMPLE_LISTINGS.length)]
    setText(next.text)
  }

  const reset = () => {
    runId.current++
    setSubmitted(false)
    setSteps([])
    setResult(null)
    setReported(false)
    setIsRunning(false)
    setText("")
  }

  const handleReport = () => {
    if (!result || reported) return
    setReported(true)
    // mock change stream: prepend a fresh "live" item after a short delay
    setTimeout(() => {
      const item = feedItemFromInvestigation(result)
      setFeed(prev => [item, ...prev].slice(0, 8))
      // clear the live flag after the entry animation so future renders are calm
      setTimeout(() => {
        setFeed(prev => prev.map(f => (f.id === item.id ? { ...f, isLive: false } : f)))
      }, 2600)
    }, 1500)
  }

  const completedCount = steps.filter(s => s.status === "complete").length

  return (
    <div style={{ background: "hsl(240,25%,4%)", minHeight: "100vh" }}>
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* ── Main column ──────────────────────────────────────────── */}
          <div>
            {!submitted && (
              <div className="animate-fade-up">
                <h1 className="font-bold mb-3 tracking-tight" style={{ fontSize: "clamp(1.8rem,4.5vw,3rem)", color: "white" }}>
                  Check a resale listing
                </h1>
                <p className="mb-6 text-sm" style={{ color: "rgba(255,255,255,0.45)", maxWidth: 560, lineHeight: 1.6 }}>
                  Paste a suspicious listing or seller DM. The agent extracts the
                  signals, runs a hybrid search over a known-scam corpus, and
                  returns an evidence-backed risk verdict.
                </p>

                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Paste a resale listing or seller DM here…"
                  maxLength={600}
                  className="w-full rounded-xl p-5 text-white text-base resize-none outline-none"
                  style={{
                    minHeight: "150px",
                    background: "hsl(240,15%,8%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    caretColor: "hsl(160,84%,52%)",
                  }}
                  onFocus={e => (e.target.style.borderColor = "rgba(16,185,129,0.6)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runInvestigation(text) }}
                />
                <div className="flex justify-between items-center mt-2 mb-6 flex-wrap gap-2">
                  <button
                    onClick={fillExample}
                    className="text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  >
                    ✦ Try an example
                  </button>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>{text.length} / 600 · ⌘/Ctrl + Enter</p>
                </div>

                <button
                  onClick={() => runInvestigation(text)}
                  disabled={!text.trim() || isRunning}
                  className="w-full py-4 rounded-xl font-semibold text-white text-sm cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))", boxShadow: "0 8px 24px rgba(16,185,129,0.25)" }}
                >
                  {isRunning ? "Investigating…" : "Investigate this listing →"}
                </button>

                {/* quick example pills */}
                <div className="mt-6">
                  <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>Or try one of these</p>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_LISTINGS.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setText(s.text); runInvestigation(s.text) }}
                        className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                        style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(16,185,129,0.35)")}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs mt-8" style={{ color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
                  Decision-support only, not a guarantee — verify independently. About the data: synthetic demo data only.
                </p>
              </div>
            )}

            {submitted && (
              <>
                {/* input recap + progress */}
                <div className="mb-6">
                  <div className="flex justify-between items-start mb-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Investigating</p>
                      <p className="text-sm" style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>
                        &ldquo;{text.length > 180 ? text.slice(0, 180) + "…" : text}&rdquo;
                      </p>
                    </div>
                    <p className="text-xs flex-shrink-0 mt-4" style={{ color: "rgba(255,255,255,0.4)" }}>{completedCount}/{TOTAL}</p>
                  </div>
                  <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(completedCount / TOTAL) * 100}%`, background: "hsl(160,84%,46%)" }} />
                  </div>
                </div>

                {steps.map(step => <InvestigationStep key={step.stepNumber} step={step} />)}

                {result && !isRunning && (
                  <div className="mt-5">
                    <RiskCard investigation={result} onReport={handleReport} reported={reported} />
                  </div>
                )}

                {!isRunning && (
                  <button
                    onClick={reset}
                    className="w-full mt-2 py-3 rounded-xl font-medium text-sm cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    ← Check another listing
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Live feed sidebar (always visible) ───────────────────── */}
          <aside className="lg:sticky lg:top-28">
            <LiveFeed items={feed} />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function InvestigatePage() {
  return (
    <Suspense fallback={<div style={{ background: "hsl(240,25%,4%)", minHeight: "100vh" }} />}>
      <InvestigateContent />
    </Suspense>
  )
}
