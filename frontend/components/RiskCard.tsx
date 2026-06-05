"use client"
import type { Investigation, RiskLevel } from "@/lib/types"
import ContributionBars from "@/components/ContributionBars"

const RISK_THEME: Record<RiskLevel, { label: string; color: string; soft: string; border: string; glow: string }> = {
  HIGH:   { label: "High risk",   color: "rgb(248,113,113)", soft: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.45)",  glow: "rgba(239,68,68,0.22)" },
  MEDIUM: { label: "Medium risk", color: "rgb(250,204,21)",  soft: "rgba(234,179,8,0.10)",  border: "rgba(234,179,8,0.45)",  glow: "rgba(234,179,8,0.20)" },
  LOW:    { label: "Low risk",    color: "rgb(74,222,128)",  soft: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.45)",  glow: "rgba(34,197,94,0.20)" },
}

export default function RiskCard({
  investigation,
  onReport,
  reported,
}: {
  investigation: Investigation
  onReport: () => void
  reported: boolean
}) {
  const { riskLevel, riskScore, rationale, evidence } = investigation
  const t = RISK_THEME[riskLevel]

  return (
    <div
      className="animate-fade-up rounded-2xl p-6 mb-4"
      style={{
        background: "hsl(240,15%,8%)",
        border: `1px solid ${t.border}`,
        boxShadow: `0 0 36px ${t.glow}`,
      }}
    >
      {/* Verdict header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div
            className="animate-risk-pop flex flex-col items-center justify-center rounded-2xl flex-shrink-0"
            style={{ width: 78, height: 78, background: t.soft, border: `1px solid ${t.border}` }}
          >
            <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: t.color }}>{riskScore}</span>
            <span className="text-[0.6rem] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>/ 100</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              Risk verdict
            </p>
            <p className="text-2xl font-bold" style={{ color: t.color }}>{t.label}</p>
          </div>
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider"
          style={{ background: `${t.color}1f`, color: t.color, border: `1px solid ${t.border}` }}
        >
          {riskLevel}
        </span>
      </div>

      {/* One-line rationale (risk-signal language) */}
      <p className="text-sm mt-4 mb-5" style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
        {rationale}
      </p>

      {/* Evidence chips */}
      <p className="text-xs uppercase tracking-[0.18em] mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
        Evidence
      </p>
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {evidence.map((e, i) => (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-xs font-semibold text-white mb-1.5">{e.label}</p>
            <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{e.why}</p>
            <ContributionBars vector={e.vectorScore} text={e.textScore} />
          </div>
        ))}
      </div>

      {/* Human-in-the-loop actions */}
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={onReport}
          disabled={reported}
          className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 disabled:cursor-default"
          style={{
            background: reported ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: reported ? "rgb(74,222,128)" : "rgb(248,113,113)",
            border: `1px solid ${reported ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}
        >
          {reported ? "✓ Reported to the corpus" : "⚑ Report listing"}
        </button>
        <a
          href="#"
          onClick={e => e.preventDefault()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))",
            color: "white",
            border: "1px solid rgba(16,185,129,0.4)",
          }}
        >
          Find verified resale →
        </a>
        <button
          className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Proceed, I accept the risk
        </button>
      </div>

      <p className="text-xs mt-4" style={{ color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
        Decision-support only, not a guarantee — verify the seller independently and pay only through official, protected channels. Risk signals reflect synthetic demo patterns.
      </p>
    </div>
  )
}
