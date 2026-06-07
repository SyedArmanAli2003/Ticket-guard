"use client"
// Two tiny bars showing how a hybrid-search match's relevance splits between
// the vector pipeline and the full-text pipeline. Bars animate to their target
// width on mount; under prefers-reduced-motion they render at final width.
import { motion } from "framer-motion"
import { usePrefersReducedMotion, EASE_OUT } from "@/lib/motion"

export default function ContributionBars({
  vector,
  text,
  compact = false,
}: {
  vector: number
  text: number
  compact?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  // A negative value is the "no data" sentinel (real mode: retrieval offline /
  // no contribution for this chip). Render nothing rather than a fake 0% bar.
  if (vector < 0 || text < 0) return null
  const rows = [
    { label: "vector", val: vector, color: "var(--tg-info)", bg: "var(--tg-info-tint)" },
    { label: "text", val: text, color: "var(--tg-green)", bg: "var(--tg-green-tint)" },
  ]
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"} style={{ minWidth: compact ? 96 : 132 }}>
      {rows.map((r, i) => {
        const target = `${Math.round(r.val * 100)}%`
        return (
          <div key={r.label} className="flex items-center gap-2">
            <span
              className="uppercase tracking-wider flex-shrink-0"
              style={{ color: "var(--tg-text-3)", fontSize: compact ? "0.55rem" : "0.6rem", width: compact ? 30 : 34 }}
            >
              {r.label}
            </span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: compact ? 4 : 5, background: "var(--tg-track-2)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: r.color, boxShadow: `0 0 8px ${r.bg}` }}
                initial={{ width: reduced ? target : 0 }}
                animate={{ width: target }}
                transition={{ duration: reduced ? 0 : 0.75, ease: EASE_OUT, delay: reduced ? 0 : 0.1 + i * 0.09 }}
              />
            </div>
            <motion.span
              className="tabular-nums flex-shrink-0"
              style={{ color: r.color, fontSize: compact ? "0.6rem" : "0.65rem", width: 26, textAlign: "right" }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT, delay: reduced ? 0 : 0.32 + i * 0.09 }}
            >
              {r.val.toFixed(2)}
            </motion.span>
          </div>
        )
      })}
    </div>
  )
}
