"use client"
import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Navbar from "@/components/Navbar"
import StepCard from "@/components/StepCard"
import type { AgentStep, ToolActivity, ToolSource } from "@/lib/types"
import { API } from "@/lib/config"

const STEP_DEFS: { name: string; tool: ToolSource }[] = [
  { name: "Validate Idea",         tool: "gemini"  },
  { name: "Research Market",       tool: "mongodb" },
  { name: "Define Audience",       tool: "gemini"  },
  { name: "Build Business Plan",   tool: "gemini"  },
  { name: "Financial Projections", tool: "gemini"  },
  { name: "Risk Analysis",         tool: "gemini"  },
  { name: "Action Plan",           tool: "gemini"  },
  { name: "QA Review",             tool: "system"  },
]
const TOTAL = STEP_DEFS.length

function GenerateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [idea, setIdea]               = useState("")
  const [submitted, setSubmitted]     = useState(false)
  const [steps, setSteps]             = useState<AgentStep[]>([])
  const [planId, setPlanId]           = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [showGate, setShowGate]       = useState(false)
  const [gateData, setGateData]       = useState<Record<string, unknown> | null>(null)
  const [engine, setEngine]           = useState<string>("")
  const [error, setError]             = useState<string | null>(null)
  const ideaRef = useRef(idea)
  ideaRef.current = idea
  const bypassGate = useRef(false)

  useEffect(() => {
    if (searchParams.get("demo") === "true") {
      const demoIdea = "A medicine delivery app for rural villages in India"
      setIdea(demoIdea)
      setTimeout(() => startGeneration(demoIdea), 1200)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const freshSteps = (): AgentStep[] =>
    STEP_DEFS.map((d, i) => ({ stepNumber: i + 1, name: d.name, status: "waiting", tool: d.tool }))

  const updateStep = (n: number, patch: Partial<AgentStep>) =>
    setSteps(prev => prev.map(s => (s.stepNumber === n ? { ...s, ...patch } : s)))

  const addActivity = (n: number, act: ToolActivity) =>
    setSteps(prev => prev.map(s =>
      s.stepNumber === n ? { ...s, activity: [...(s.activity || []), act] } : s))

  const startGeneration = async (ideaText: string) => {
    if (!ideaText.trim() || isStreaming) return
    setSubmitted(true)
    setIsStreaming(true)
    setError(null)
    setSteps(freshSteps())
    updateStep(1, { status: "running", startedAt: Date.now() })

    try {
      const res = await fetch(API.generate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: ideaText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const headerId = res.headers.get("X-Plan-ID")
      if (headerId) setPlanId(headerId)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() || ""              // keep incomplete frame
        for (const frame of frames) {
          const line = frame.split("\n").find(l => l.startsWith("data: "))
          if (!line) continue
          let ev: Record<string, unknown>
          try { ev = JSON.parse(line.slice(6)) } catch { continue }

          // Tool-activity event
          if (ev.type === "tool") {
            addActivity(ev.step as number, {
              tool: ev.tool as string,
              source: ev.source as ToolSource,
              preview: (ev.args_preview as string) || "",
            })
            continue
          }

          const step = ev.step as number
          const status = ev.status as string
          const data = ev.data as Record<string, unknown> | undefined

          // Finalize event
          if (step === 99) {
            if (data?.engine) setEngine(data.engine as string)
            const pid = (data?.plan_id as string) || headerId
            if (pid && pid !== "no-db") setTimeout(() => router.push(`/plan/${pid}`), 1000)
            continue
          }

          updateStep(step, {
            status: status as AgentStep["status"],
            data,
            completedAt: status === "complete" ? Date.now() : undefined,
          })

          // Human-in-the-loop gate on low viability (once)
          if (step === 1 && status === "complete"
              && (data?.viability_score as number) < 5 && !bypassGate.current) {
            setGateData(data || null)
            setShowGate(true)
            setIsStreaming(false)
            reader.cancel()
            return
          }

          if (status === "error") setError(`Step ${step} failed: ${ev.error || "unknown error"}`)
          if (status === "complete" && step < TOTAL) updateStep(step + 1, { status: "running", startedAt: Date.now() })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSteps(prev => prev.map(s => (s.status === "running" ? { ...s, status: "error" } : s)))
    } finally {
      setIsStreaming(false)
    }
  }

  const reset = () => {
    bypassGate.current = false
    setSubmitted(false)
    setSteps(freshSteps())
    setPlanId(null)
    setError(null)
    setEngine("")
  }

  const completedCount = steps.filter(s => s.status === "complete").length

  return (
    <div style={{ background: "hsl(240,25%,4%)", minHeight: "100vh" }}>
      <Navbar />

      {showGate && gateData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-8 max-w-sm w-full mx-4 text-center"
            style={{ background: "hsl(240,15%,10%)", border: "1px solid rgba(234,179,8,0.4)" }}>
            <p className="text-5xl font-bold mb-1" style={{ color: "rgb(250,204,21)" }}>
              {gateData.viability_score as number}/10
            </p>
            <p className="text-white font-semibold text-lg mb-2">Low viability score</p>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
              The agent flagged this idea as risky. Continue the full analysis anyway?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { bypassGate.current = true; setShowGate(false); startGeneration(ideaRef.current) }}
                className="flex-1 py-3 rounded-xl font-medium text-sm text-white cursor-pointer"
                style={{ background: "hsl(258,85%,64%)" }}>
                Continue →
              </button>
              <button
                onClick={() => { setShowGate(false); reset() }}
                className="flex-1 py-3 rounded-xl font-medium text-sm cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 pt-28 pb-20">
        {!submitted && (
          <div className="animate-fade-up">
            <h1 className="font-bold mb-3 tracking-tight"
              style={{ fontSize: "clamp(2rem,5vw,3.5rem)", color: "white" }}>
              What&apos;s your startup idea?
            </h1>
            <p className="mb-8 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              Describe it in one sentence. A Gemini agent will research it live with MongoDB.
            </p>

            <textarea
              value={idea}
              onChange={e => setIdea(e.target.value)}
              placeholder="e.g. An app that delivers medicine to rural villages in India..."
              maxLength={280}
              className="w-full rounded-xl p-5 text-white text-base resize-none outline-none"
              style={{
                minHeight: "120px", background: "hsl(240,15%,8%)",
                border: "1px solid rgba(255,255,255,0.08)", caretColor: "hsl(258,90%,66%)",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.6)")}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) startGeneration(idea) }}
            />
            <div className="flex justify-between items-center mt-2 mb-6">
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>{idea.length} / 280</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>⌘ + Enter to submit</p>
            </div>

            <button
              onClick={() => startGeneration(idea)}
              disabled={!idea.trim() || isStreaming}
              className="w-full py-4 rounded-xl font-semibold text-white text-sm cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "hsl(258,85%,64%)" }}
            >
              {isStreaming ? "Generating..." : "Analyze with Gemini →"}
            </button>
          </div>
        )}

        {submitted && (
          <>
            <div className="mb-8">
              <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">&quot;{idea}&quot;</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(124,58,237,0.12)", color: "hsl(258,80%,78%)", border: "1px solid rgba(124,58,237,0.3)" }}>
                      ✦ {engine || "Gemini · MongoDB MCP"}
                    </span>
                  </div>
                </div>
                <p className="text-xs flex-shrink-0 ml-4 mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {completedCount}/{TOTAL}
                </p>
              </div>
              <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(completedCount / TOTAL) * 100}%`, background: "hsl(258,85%,64%)" }} />
              </div>
            </div>

            {steps.map(step => <StepCard key={step.stepNumber} step={step} />)}

            {error && !isStreaming && (
              <div className="mt-4 p-4 rounded-xl"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-sm mb-3" style={{ color: "rgb(252,165,165)" }}>⚠ {error}</p>
                <button onClick={() => startGeneration(idea)}
                  className="py-2 px-4 rounded-lg text-xs font-medium cursor-pointer"
                  style={{ background: "rgba(124,58,237,0.15)", color: "hsl(258,80%,78%)", border: "1px solid rgba(124,58,237,0.3)" }}>
                  ↻ Retry
                </button>
              </div>
            )}

            {planId && completedCount === TOTAL && planId !== "no-db" && (
              <button onClick={() => router.push(`/plan/${planId}`)}
                className="w-full mt-4 py-4 rounded-xl font-semibold text-white text-sm cursor-pointer"
                style={{ background: "hsl(142,71%,35%)" }}>
                View Full Business Plan →
              </button>
            )}

            {planId === "no-db" && completedCount === TOTAL && (
              <div className="w-full mt-4 p-4 rounded-xl text-center"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "rgb(74,222,128)" }}>🎉 Plan generated!</p>
                <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                  MongoDB is offline — plan not saved. Connect Atlas to enable persistence + sharing.
                </p>
                <button onClick={reset} className="text-xs px-4 py-2 rounded-lg cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  Generate Another
                </button>
              </div>
            )}

            {!isStreaming && completedCount < TOTAL && !error && (
              <button onClick={reset}
                className="w-full mt-3 py-3 rounded-xl font-medium text-sm cursor-pointer"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                ← Try a different idea
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div style={{ background: "hsl(240,25%,4%)", minHeight: "100vh" }} />}>
      <GenerateContent />
    </Suspense>
  )
}
