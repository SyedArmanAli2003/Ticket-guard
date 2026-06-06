"use client"
import { memo } from "react"
import { motion } from "framer-motion"
import { Leaf, Search, Sparkles, Settings2, Loader2, Check, MinusCircle } from "lucide-react"
import type { AgentStep, Entity, HybridMatch, RuleCheck } from "@/lib/types"
import ContributionBars from "@/components/ContributionBars"
import RealStepData from "@/components/RealStepData"
import {
  usePrefersReducedMotion,
  staggerContainer,
  cardRise,
  chipSlideIn,
  EASE_OUT,
} from "@/lib/motion"

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

// ── Animated circular progress ring around the step index ──────────────────────
// Shows step n / total as a filled arc. Snaps to full arc under reduced motion.
function StepRing({
  stepNumber,
  total,
  status,
  reduced,
}: {
  stepNumber: number
  total: number
  status: AgentStep["status"]
  reduced: boolean
}) {
  const size = 36
  const stroke = 2.5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = stepNumber / total
  const ringColor =
    status === "complete" ? "rgb(74,222,128)" :
    status === "running"  ? "hsl(160,84%,55%)" :
    status === "error"    ? "rgb(248,113,113)" :
    status === "not_configured" ? "rgba(255,255,255,0.28)" :
                            "rgba(255,255,255,0.25)"
  const fill = {
    waiting:  { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" },
    running:  { background: "rgba(16,185,129,0.18)",  color: "hsl(160,84%,72%)" },
    complete: { background: "rgba(34,197,94,0.14)",   color: "rgb(74,222,128)" },
    error:    { background: "rgba(239,68,68,0.15)",   color: "rgb(252,165,165)" },
    not_configured: { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" },
  }[status]

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden>
        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        {/* progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: reduced ? circ * (1 - pct) : circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: reduced ? 0 : 0.7, ease: EASE_OUT }}
          style={{ filter: status === "running" ? "drop-shadow(0 0 4px rgba(16,185,129,0.55))" : "none" }}
        />
      </svg>
      <div
        className="absolute inset-[3px] rounded-full flex items-center justify-center text-xs font-bold"
        style={fill}
      >
        {status === "complete" ? (
          <Check size={14} strokeWidth={3} />
        ) : status === "not_configured" ? (
          <MinusCircle size={13} strokeWidth={2.4} />
        ) : (
          stepNumber
        )}
      </div>
    </div>
  )
}

const SOURCE_META = {
  vector:  { label: "Atlas Vector Search", color: "rgb(125,211,252)", Icon: Search },
  mongodb: { label: "MongoDB MCP",         color: "rgb(74,222,128)",  Icon: Leaf },
  gemini:  { label: "Gemini 2.5",          color: "hsl(258,80%,80%)", Icon: Sparkles },
  system:  { label: "rule engine",         color: "rgba(255,255,255,0.55)", Icon: Settings2 },
} as const

// Tool-call chips that slide + fade in (staggered) while/after a step runs.
function ActivityFeed({
  activity,
  reduced,
}: {
  activity: NonNullable<AgentStep["activity"]>
  reduced: boolean
}) {
  return (
    <motion.div
      className="mt-3 space-y-1.5"
      variants={staggerContainer(0.08)}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      {activity.map((a, i) => {
        const meta = SOURCE_META[a.source] ?? SOURCE_META.gemini
        const Icon = meta.Icon
        return (
          <motion.div
            key={i}
            variants={chipSlideIn}
            className="inline-flex items-center gap-2 text-xs rounded-md px-2 py-1 mr-1.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Icon size={12} style={{ color: meta.color }} strokeWidth={2.2} />
            <span style={{ color: meta.color }}>{meta.label}</span>
            <code style={{ color: "rgba(255,255,255,0.45)" }}>{a.tool}{a.preview ? `("${a.preview}")` : "()"}</code>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

function InvestigationStep({ step, total }: { step: AgentStep; total: number }) {
  const reduced = usePrefersReducedMotion()
  const { stepNumber, name, status, data, startedAt, completedAt } = step
  const duration = startedAt && completedAt ? ((completedAt - startedAt) / 1000).toFixed(1) + "s" : null
  const workerLabel = step.worker ?? WORKER[stepNumber] ?? "Working"
  const isReal = step.kind === "real"

  const borderColor = {
    waiting:  "rgba(255,255,255,0.06)",
    running:  "rgba(16,185,129,0.5)",
    complete: "rgba(34,197,94,0.4)",
    error:    "rgba(239,68,68,0.4)",
    not_configured: "rgba(255,255,255,0.1)",
  }[status]

  return (
    <motion.div
      variants={cardRise}
      initial={reduced ? false : "hidden"}
      animate="show"
      layout={!reduced}
      className="relative w-full rounded-2xl p-5 mb-3 overflow-hidden transition-colors duration-300"
      style={{
        background: "hsl(240,15%,8%)",
        border: `1px solid ${borderColor}`,
        opacity: status === "waiting" ? 0.55 : 1,
        boxShadow: status === "running" ? "0 0 20px rgba(16,185,129,0.12)" : "none",
      }}
    >
      {/* scanning shimmer sweep while running (gated in CSS by reduced-motion) */}
      {status === "running" && <span className="scan-shimmer" aria-hidden />}

      <div className="relative flex justify-between items-center">
        <div className="flex items-center gap-3">
          <StepRing stepNumber={stepNumber} total={total} status={status} reduced={reduced} />
          <div>
            <p className="text-sm font-medium text-white">{name}</p>
            {status === "running" && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "hsl(160,72%,68%)" }}>
                <Loader2 size={11} className={reduced ? "" : "animate-spin"} strokeWidth={2.4} />
                {workerLabel} is working…
              </p>
            )}
            {status === "complete" && duration && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "rgba(74,222,128,0.85)" }}>
                <Check size={11} strokeWidth={3} /> {workerLabel} · done in {duration}
              </p>
            )}
            {status === "not_configured" && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                <MinusCircle size={11} strokeWidth={2.2} /> {workerLabel} · not configured
              </p>
            )}
            {status === "error" && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "rgb(252,165,165)" }}>
                {workerLabel} · failed
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status !== "waiting" && <ToolBadge tool={step.tool} />}
          {status === "running" && (
            <div className={`w-4 h-4 rounded-full border-2 ${reduced ? "" : "animate-spin"}`}
              style={{ borderColor: "hsl(160,84%,46%)", borderTopColor: "transparent" }} />
          )}
          {status === "complete" && <span className="text-xs" style={{ color: "rgb(74,222,128)" }}>Done</span>}
          {status === "not_configured" && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              not configured
            </span>
          )}
          {status === "error" && <span className="text-xs text-red-400">Failed</span>}
        </div>
      </div>

      {step.activity && step.activity.length > 0 && status !== "waiting" && (
        <div className="relative">
          <ActivityFeed activity={step.activity} reduced={reduced} />
        </div>
      )}

      {/* honest reason line for a not_configured / error step (real mode) */}
      {(status === "not_configured" || status === "error") && (step.reason || isReal) && (
        <p className="relative text-xs mt-3" style={{ color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
          {step.reason
            ? step.reason
            : status === "not_configured"
            ? "This signal needs a configured data source (e.g. MongoDB Atlas). It was skipped honestly rather than guessed."
            : "This step did not complete."}
        </p>
      )}

      <div className={`step-content ${(status === "complete" || status === "not_configured") && data ? "open" : ""}`}>
        {(status === "complete" || status === "not_configured") && data && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {isReal ? (
              <RealStepData stepNumber={stepNumber} status={status} data={data} reduced={reduced} />
            ) : (
              <StepData stepNumber={stepNumber} data={data} reduced={reduced} />
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function StepData({ stepNumber, data, reduced }: { stepNumber: number; data: Record<string, unknown>; reduced: boolean }) {
  // Step 1 — extracted entity chips (stagger in)
  if (stepNumber === 1) {
    const entities = (data.entities as Entity[] | undefined) || []
    return (
      <motion.div
        className="flex flex-wrap gap-2"
        variants={staggerContainer(0.05)}
        initial={reduced ? false : "hidden"}
        animate="show"
      >
        {entities.map((e, i) => (
          <motion.span
            key={i}
            variants={chipSlideIn}
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
          </motion.span>
        ))}
      </motion.div>
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
        <motion.div
          className="space-y-2.5"
          variants={staggerContainer(0.07)}
          initial={reduced ? false : "hidden"}
          animate="show"
        >
          {matches.map((m, i) => (
            <motion.div
              key={i}
              variants={cardRise}
              className="rounded-xl p-3 flex items-center justify-between gap-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
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
            </motion.div>
          ))}
        </motion.div>
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
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: color, boxShadow: `0 0 10px ${color}`, transformOrigin: "left center" }}
            initial={{ scaleX: reduced ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduced ? 0 : 0.7, ease: EASE_OUT }}
          >
            <div style={{ width: `${score}%`, height: "100%" }} />
          </motion.div>
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
