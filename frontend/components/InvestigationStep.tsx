"use client"
import { memo } from "react"
import type { AgentStep, Entity, HybridMatch, RuleCheck } from "@/lib/types"
import ContributionBars from "@/components/ContributionBars"

type ToolKey = AgentStep["tool"]

const TOOL_BADGE: Record<ToolKey, { label: string; bg: string; color: string; border: string }> = {
  gemini:  { label: "GEMINI",  bg: "rgba(124,58,237,0.12)", color: "hsl(258,80%,78%)",  border: "rgba(124,58,237,0.25)" },
  mongodb: { label: "MONGODB", bg: "rgba(34,197,94,0.12)",  color: "rgb(74,222,128)",   border: "rgba(34,197,94,0.25)"  },
  vector:  { label: "VECTOR",  bg: "rgba(14,165,233,0.1)",  color: "rgb(125,211,252)",  border: "rgba(14,165,233,0.25)" },
  system:  { label: "SYSTEM",  bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.12)" },
}

// Short worker label per step (mirrors StepCard's "specialist" line)
const WORKER: Record<number, string> = {
  1: "Entity Extractor",
  2: "Hybrid Search",
  3: "Risk Scorer",
  4: "Transfer-Rule Check",
  5: "Verdict Writer",
}

function ToolBadge({ tool }: { tool: ToolKey }) {
  const b = TOOL_BADGE[tool] ?? TOOL_BADGE.gemini
  return (
    <span className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: b.bg, color: b.color, border: `1px solid ${b.border}` }}>
      {b.label}
    </span>
  )
}

function ActivityFeed({ activity }: { activity: NonNullable<AgentStep["activity"]> }) {
  return (
    <div className="mt-3 space-y-1.5">
      {activity.map((a, i) => {
        const isMongo = a.source === "mongodb"
        const icon = isMongo ? "🍃" : a.source === "vector" ? "🔎" : a.source === "gemini" ? "✦" : "⚙"
        const color = isMongo ? "rgb(74,222,128)" : a.source === "vector" ? "rgb(125,211,252)" : "rgba(255,255,255,0.55)"
        const sourceLabel =
          a.source === "vector" ? "Atlas Vector Search"
          : a.source === "mongodb" ? "MongoDB MCP"
          : a.source === "gemini" ? "Gemini 2.5"
          : "rule engine"
        return (
          <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            <span>{icon}</span>
            <span style={{ color }}>{sourceLabel}</span>
            <code style={{ color: "rgba(255,255,255,0.45)" }}>{a.tool}{a.preview ? `("${a.preview}")` : "()"}</code>
          </div>
        )
      })}
    </div>
  )
}

function InvestigationStep({ step }: { step: AgentStep }) {
  const { stepNumber, name, status, data, startedAt, completedAt } = step
  const duration = startedAt && completedAt ? ((completedAt - startedAt) / 1000).toFixed(1) + "s" : null

  const borderColor = {
    waiting:  "rgba(255,255,255,0.06)",
    running:  "rgba(16,185,129,0.5)",
    complete: "rgba(34,197,94,0.4)",
    error:    "rgba(239,68,68,0.4)",
  }[status]

  const circleStyle = {
    waiting:  { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" },
    running:  { background: "rgba(16,185,129,0.2)",   color: "hsl(160,84%,70%)" },
    complete: { background: "rgba(34,197,94,0.15)",   color: "rgb(74,222,128)" },
    error:    { background: "rgba(239,68,68,0.15)",   color: "rgb(252,165,165)" },
  }[status]

  return (
    <div
      className="w-full rounded-2xl p-5 mb-3 transition-all duration-300"
      style={{
        background: "hsl(240,15%,8%)",
        border: `1px solid ${borderColor}`,
        opacity: status === "waiting" ? 0.5 : 1,
        boxShadow: status === "running" ? "0 0 20px rgba(16,185,129,0.12)" : "none",
      }}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${status === "running" ? "animate-pulse" : ""}`}
            style={circleStyle}
          >
            {status === "complete" ? "✓" : stepNumber}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{name}</p>
            {status === "running" && (
              <p className="text-xs mt-0.5" style={{ color: "hsl(160,72%,68%)" }}>
                ⚡ {WORKER[stepNumber]} is working...
              </p>
            )}
            {status === "complete" && duration && (
              <p className="text-xs mt-0.5" style={{ color: "rgba(74,222,128,0.8)" }}>
                ✓ {WORKER[stepNumber]} · done in {duration}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status !== "waiting" && <ToolBadge tool={step.tool} />}
          {status === "running" && (
            <div className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "hsl(160,84%,46%)", borderTopColor: "transparent" }} />
          )}
          {status === "complete" && <span className="text-xs" style={{ color: "rgb(74,222,128)" }}>Done</span>}
          {status === "error" && <span className="text-xs text-red-400">Failed</span>}
        </div>
      </div>

      {step.activity && step.activity.length > 0 && status !== "waiting" && (
        <ActivityFeed activity={step.activity} />
      )}

      <div className={`step-content ${status === "complete" && data ? "open" : ""}`}>
        {status === "complete" && data && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <StepData stepNumber={stepNumber} data={data} />
          </div>
        )}
      </div>
    </div>
  )
}

function StepData({ stepNumber, data }: { stepNumber: number; data: Record<string, unknown> }) {
  // Step 1 — extracted entity chips
  if (stepNumber === 1) {
    const entities = (data.entities as Entity[] | undefined) || []
    return (
      <div className="flex flex-wrap gap-2">
        {entities.map((e, i) => (
          <span
            key={i}
            className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{
              background: e.flagged ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
              color: e.flagged ? "rgb(252,165,165)" : "rgb(134,239,172)",
              border: `1px solid ${e.flagged ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.22)"}`,
            }}
          >
            <span style={{ opacity: 0.7 }}>{e.flagged ? "⚠" : "✓"}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{e.kind}:</span>
            <span className="font-medium">{e.value}</span>
          </span>
        ))}
      </div>
    )
  }

  // Step 2 — hybrid search: pipelines + 3 matches w/ contribution bars
  if (stepNumber === 2) {
    const matches = (data.matches as HybridMatch[] | undefined) || []
    return (
      <div>
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "rgba(14,165,233,0.1)", color: "rgb(125,211,252)", border: "1px solid rgba(14,165,233,0.22)" }}>
            $vectorSearch · knnBeta
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "rgba(34,197,94,0.1)", color: "rgb(74,222,128)", border: "1px solid rgba(34,197,94,0.22)" }}>
            $search · text
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
            $unionWith · rank fusion
          </span>
        </div>
        <div className="space-y-2.5">
          {matches.map((m, i) => (
            <div key={i} className="rounded-xl p-3 flex items-center justify-between gap-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{m.label}</p>
                <p className="text-xs mt-0.5 italic truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{m.excerpt}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <ContributionBars vector={m.vectorScore} text={m.textScore} compact />
                <div className="text-right" style={{ width: 44 }}>
                  <p className="text-sm font-bold tabular-nums" style={{ color: "hsl(160,84%,62%)" }}>{m.score.toFixed(2)}</p>
                  <p style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.35)" }}>score</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Step 3 — risk score
  if (stepNumber === 3) {
    const score = (data.riskScore as number) ?? 0
    const level = data.riskLevel as string
    const color = level === "HIGH" ? "rgb(248,113,113)" : level === "MEDIUM" ? "rgb(250,204,21)" : "rgb(74,222,128)"
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
          <span className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>/100</span>
        </div>
        <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div className="bar-grow h-full rounded-full" style={{ width: `${score}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
          {level}
        </span>
      </div>
    )
  }

  // Step 4 — official-transfer rule
  if (stepNumber === 4) {
    const rule = data.rule as RuleCheck | undefined
    if (!rule) return null
    const color = rule.passed ? "rgb(74,222,128)" : "rgb(248,113,113)"
    return (
      <div className="flex items-start gap-3">
        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
          {rule.passed ? "PASS" : "FAIL"}
        </span>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{rule.note}</p>
      </div>
    )
  }

  // Step 5 — verdict line
  if (stepNumber === 5) {
    const rationale = data.rationale as string | undefined
    const level = data.riskLevel as string
    const color = level === "HIGH" ? "rgb(248,113,113)" : level === "MEDIUM" ? "rgb(250,204,21)" : "rgb(74,222,128)"
    return (
      <p className="text-sm italic pl-3" style={{ borderLeft: `2px solid ${color}`, color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>
        {rationale}
      </p>
    )
  }

  return null
}

export default memo(InvestigationStep)
