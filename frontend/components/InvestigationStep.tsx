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
  gemini:  { label: "GEMINI",  bg: "var(--tg-violet-tint)", color: "var(--tg-violet)",  border: "var(--tg-violet-border)" },
  mongodb: { label: "MONGODB", bg: "var(--tg-green-tint)",  color: "var(--tg-green)",   border: "var(--tg-green-border)"  },
  vector:  { label: "VECTOR",  bg: "var(--tg-info-tint)",   color: "var(--tg-info)",    border: "var(--tg-info-border)" },
  system:  { label: "SYSTEM",  bg: "var(--tg-hover)",       color: "var(--tg-text-3)",  border: "var(--tg-border-strong)" },
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
    status === "complete" ? "var(--tg-green)" :
    status === "running"  ? "var(--tg-accent)" :
    status === "error"    ? "var(--tg-risk-high)" :
    status === "not_configured" ? "var(--tg-text-3)" :
                            "var(--tg-text-3)"
  const fill = {
    waiting:  { background: "var(--tg-track)",      color: "var(--tg-text-3)" },
    running:  { background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)" },
    complete: { background: "var(--tg-green-tint)", color: "var(--tg-green)" },
    error:    { background: "var(--tg-risk-high-soft)", color: "var(--tg-risk-high)" },
    not_configured: { background: "var(--tg-hover)", color: "var(--tg-text-3)" },
  }[status]

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden>
        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tg-track)" strokeWidth={stroke} />
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
          style={{ filter: status === "running" ? "drop-shadow(0 0 4px var(--tg-accent-glow))" : "none" }}
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
  vector:  { label: "Atlas Vector Search", color: "var(--tg-info)", Icon: Search },
  mongodb: { label: "MongoDB MCP",         color: "var(--tg-green)",  Icon: Leaf },
  gemini:  { label: "Gemini 2.5",          color: "var(--tg-violet)", Icon: Sparkles },
  system:  { label: "rule engine",         color: "var(--tg-text-2)", Icon: Settings2 },
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
            style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border)" }}
          >
            <Icon size={12} style={{ color: meta.color }} strokeWidth={2.2} />
            <span style={{ color: meta.color }}>{meta.label}</span>
            <code style={{ color: "var(--tg-text-3)" }}>{a.tool}{a.preview ? `("${a.preview}")` : "()"}</code>
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
    waiting:  "var(--tg-border)",
    running:  "var(--tg-accent-border)",
    complete: "var(--tg-green-border)",
    error:    "var(--tg-risk-high-border)",
    not_configured: "var(--tg-border-strong)",
  }[status]

  return (
    <motion.div
      variants={cardRise}
      initial={reduced ? false : "hidden"}
      animate="show"
      layout={!reduced}
      className="relative w-full rounded-2xl p-5 mb-3 overflow-hidden transition-colors duration-300"
      style={{
        background: "var(--tg-surface)",
        border: `1px solid ${borderColor}`,
        opacity: status === "waiting" ? 0.6 : 1,
        boxShadow: status === "running" ? "var(--tg-shadow), 0 0 20px var(--tg-accent-tint-2)" : "var(--tg-shadow)",
      }}
    >
      {/* scanning shimmer sweep while running (gated in CSS by reduced-motion) */}
      {status === "running" && <span className="scan-shimmer" aria-hidden />}

      <div className="relative flex justify-between items-center">
        <div className="flex items-center gap-3">
          <StepRing stepNumber={stepNumber} total={total} status={status} reduced={reduced} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--tg-text)" }}>{name}</p>
            {status === "running" && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--tg-accent)" }}>
                <Loader2 size={11} className={reduced ? "" : "animate-spin"} strokeWidth={2.4} />
                {workerLabel} is working…
              </p>
            )}
            {status === "complete" && duration && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--tg-green)" }}>
                <Check size={11} strokeWidth={3} /> {workerLabel} · done in {duration}
              </p>
            )}
            {status === "not_configured" && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--tg-text-3)" }}>
                <MinusCircle size={11} strokeWidth={2.2} /> {workerLabel} · not configured
              </p>
            )}
            {status === "error" && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--tg-risk-high)" }}>
                {workerLabel} · failed
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status !== "waiting" && <ToolBadge tool={step.tool} />}
          {status === "running" && (
            <div className={`w-4 h-4 rounded-full border-2 ${reduced ? "" : "animate-spin"}`}
              style={{ borderColor: "var(--tg-accent)", borderTopColor: "transparent" }} />
          )}
          {status === "complete" && <span className="text-xs" style={{ color: "var(--tg-green)" }}>Done</span>}
          {status === "not_configured" && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--tg-hover)", color: "var(--tg-text-3)", border: "1px solid var(--tg-border-strong)" }}
            >
              not configured
            </span>
          )}
          {status === "error" && <span className="text-xs" style={{ color: "var(--tg-risk-high)" }}>Failed</span>}
        </div>
      </div>

      {step.activity && step.activity.length > 0 && status !== "waiting" && (
        <div className="relative">
          <ActivityFeed activity={step.activity} reduced={reduced} />
        </div>
      )}

      {/* honest reason line for a not_configured / error step (real mode) */}
      {(status === "not_configured" || status === "error") && (step.reason || isReal) && (
        <p className="relative text-xs mt-3" style={{ color: "var(--tg-text-3)", lineHeight: 1.5 }}>
          {step.reason
            ? step.reason
            : status === "not_configured"
            ? "This signal needs a configured data source (e.g. MongoDB Atlas). It was skipped honestly rather than guessed."
            : "This step did not complete."}
        </p>
      )}

      <div className={`step-content ${(status === "complete" || status === "not_configured") && data ? "open" : ""}`}>
        {(status === "complete" || status === "not_configured") && data && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--tg-border)" }}>
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

// Risk band → semantic CSS var (single source of truth for step-level colours).
function riskColorVar(level: string): string {
  return level === "HIGH" ? "var(--tg-risk-high)" : level === "MEDIUM" ? "var(--tg-risk-med)" : "var(--tg-risk-low)"
}
// Translucent fills/borders derived from a CSS-var colour (theme-safe).
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

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
            whileHover={reduced ? undefined : { y: -1 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{
              background: e.flagged ? "var(--tg-risk-high-soft)" : "var(--tg-green-tint)",
              color: e.flagged ? "var(--tg-risk-high)" : "var(--tg-green)",
              border: `1px solid ${e.flagged ? "var(--tg-risk-high-border)" : "var(--tg-green-border)"}`,
            }}
          >
            <span style={{ opacity: 0.7 }}>{e.flagged ? "⚠" : "✓"}</span>
            <span style={{ color: "var(--tg-text-3)" }}>{e.kind}:</span>
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
        <motion.div
          className="flex flex-wrap gap-2 mb-3"
          variants={staggerContainer(0.06)}
          initial={reduced ? false : "hidden"}
          animate="show"
        >
          {[
            { label: "$vectorSearch · knnBeta", bg: "var(--tg-info-tint)", color: "var(--tg-info)", border: "var(--tg-info-border)" },
            { label: "$search · text", bg: "var(--tg-green-tint)", color: "var(--tg-green)", border: "var(--tg-green-border)" },
            { label: "$unionWith · rank fusion", bg: "var(--tg-hover)", color: "var(--tg-text-3)", border: "var(--tg-border-strong)" },
          ].map(p => (
            <motion.span key={p.label} variants={chipSlideIn} className="text-xs px-2 py-0.5 rounded-md font-mono"
              style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}` }}>
              {p.label}
            </motion.span>
          ))}
        </motion.div>
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
              whileHover={reduced ? undefined : { y: -2, borderColor: "var(--tg-border-strong)" }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              className="rounded-xl p-3 flex items-center justify-between gap-3"
              style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border)" }}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--tg-text)" }}>{m.label}</p>
                <p className="text-xs mt-0.5 italic truncate" style={{ color: "var(--tg-text-3)" }}>{m.excerpt}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <ContributionBars vector={m.vectorScore} text={m.textScore} compact />
                <div className="text-right" style={{ width: 44 }}>
                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--tg-accent)" }}>{m.score.toFixed(2)}</p>
                  <p style={{ fontSize: "0.55rem", color: "var(--tg-text-3)" }}>score</p>
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
    const color = riskColorVar(level)
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
          <span className="text-sm mb-1" style={{ color: "var(--tg-text-3)" }}>/100</span>
        </div>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--tg-track-2)" }}>
          {/* Bar width tracks the actual score (0–100), animated in like ContributionBars. */}
          <motion.div
            className="h-full rounded-full"
            style={{ background: color, boxShadow: `0 0 10px ${tint(color, 60)}` }}
            initial={{ width: reduced ? `${score}%` : 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: reduced ? 0 : 0.8, ease: EASE_OUT, delay: reduced ? 0 : 0.1 }}
          />
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: tint(color, 13), color, border: `1px solid ${tint(color, 27)}` }}>
          {level}
        </span>
      </div>
    )
  }

  // Step 4 — official-transfer rule
  if (stepNumber === 4) {
    const rule = data.rule as RuleCheck | undefined
    if (!rule) return null
    const color = rule.passed ? "var(--tg-risk-low)" : "var(--tg-risk-high)"
    return (
      <div className="flex items-start gap-3">
        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
          style={{ background: tint(color, 13), color, border: `1px solid ${tint(color, 27)}` }}>
          {rule.passed ? "PASS" : "FAIL"}
        </span>
        <p className="text-xs" style={{ color: "var(--tg-text-2)", lineHeight: 1.5 }}>{rule.note}</p>
      </div>
    )
  }

  // Step 5 — verdict line
  if (stepNumber === 5) {
    const rationale = data.rationale as string | undefined
    const level = data.riskLevel as string
    const color = riskColorVar(level)
    return (
      <div className="relative pl-3">
        {/* accent rule draws in from the top */}
        <motion.span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 rounded-full"
          style={{ width: 2, background: color, transformOrigin: "top" }}
          initial={{ scaleY: reduced ? 1 : 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT }}
        />
        <motion.p
          className="text-sm italic"
          style={{ color: "var(--tg-text)", lineHeight: 1.5 }}
          initial={reduced ? false : { opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduced ? 0 : 0.45, ease: EASE_OUT, delay: reduced ? 0 : 0.12 }}
        >
          {rationale}
        </motion.p>
      </div>
    )
  }

  return null
}

export default memo(InvestigationStep)
