// Two tiny bars showing how a hybrid-search match's relevance splits between
// the vector pipeline and the full-text pipeline.
export default function ContributionBars({
  vector,
  text,
  compact = false,
}: {
  vector: number
  text: number
  compact?: boolean
}) {
  const rows = [
    { label: "vector", val: vector, color: "rgb(125,211,252)", bg: "rgba(14,165,233,0.16)" },
    { label: "text", val: text, color: "rgb(74,222,128)", bg: "rgba(34,197,94,0.16)" },
  ]
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"} style={{ minWidth: compact ? 96 : 132 }}>
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          <span
            className="uppercase tracking-wider flex-shrink-0"
            style={{ color: "rgba(255,255,255,0.4)", fontSize: compact ? "0.55rem" : "0.6rem", width: compact ? 30 : 34 }}
          >
            {r.label}
          </span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: compact ? 4 : 5, background: "rgba(255,255,255,0.07)" }}>
            <div
              className="bar-grow h-full rounded-full"
              style={{ width: `${Math.round(r.val * 100)}%`, background: r.color, boxShadow: `0 0 8px ${r.bg}` }}
            />
          </div>
          <span className="tabular-nums flex-shrink-0" style={{ color: r.color, fontSize: compact ? "0.6rem" : "0.65rem", width: 26, textAlign: "right" }}>
            {r.val.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}
