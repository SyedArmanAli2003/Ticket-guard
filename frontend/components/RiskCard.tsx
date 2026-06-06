"use client"
import { motion } from "framer-motion"
import { ShieldAlert, AlertTriangle, ShieldCheck, Flag, ArrowRight } from "lucide-react"
import type { Investigation, RiskLevel } from "@/lib/types"
import ContributionBars from "@/components/ContributionBars"
import { useCountUp } from "@/lib/useCountUp"
import { usePrefersReducedMotion, staggerContainer, cardRise, EASE_OUT } from "@/lib/motion"

// Verdict vocabulary stays SCAM / SUSPICIOUS / LIKELY-LEGIT (never authentic/genuine).
// `verdict` is the headline call; `tag` is the short pill; `signal` keeps the
// risk-signal (not accusation) framing in the sub-line.
const RISK_THEME: Record<
  RiskLevel,
  { verdict: string; tag: string; signal: string; color: string; soft: string; border: string; glow: string; Icon: typeof ShieldAlert }
> = {
  HIGH: {
    verdict: "Scam",
    tag: "SCAM",
    signal: "High-risk signals",
    color: "rgb(248,113,113)",
    soft: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.45)",
    glow: "rgba(239,68,68,0.22)",
    Icon: ShieldAlert,
  },
  MEDIUM: {
    verdict: "Suspicious",
    tag: "SUSPICIOUS",
    signal: "Elevated-risk signals",
    color: "rgb(250,204,21)",
    soft: "rgba(234,179,8,0.10)",
    border: "rgba(234,179,8,0.45)",
    glow: "rgba(234,179,8,0.20)",
    Icon: AlertTriangle,
  },
  LOW: {
    verdict: "Likely-legit",
    tag: "LIKELY-LEGIT",
    signal: "No high-risk signals",
    color: "rgb(74,222,128)",
    soft: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.45)",
    glow: "rgba(34,197,94,0.20)",
    Icon: ShieldCheck,
  },
}

// Semicircular gauge that fills red/amber/green to the score (0–100).
function ScoreGauge({ score, color, reduced }: { score: number; color: string; reduced: boolean }) {
  const value = useCountUp(score, 950)
  const size = 96
  const stroke = 8
  const r = (size - stroke) / 2
  // half-circle: arc length is π·r; we fill `score`% of it.
  const semi = Math.PI * r
  const pct = Math.min(100, Math.max(0, score)) / 100

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size / 2 + 18 }} aria-hidden>
      <svg width={size} height={size / 2 + 4} viewBox={`0 0 ${size} ${size / 2 + 4}`}>
        {/* track (half ring) */}
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* filled arc */}
        <motion.path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={semi}
          initial={{ strokeDashoffset: reduced ? semi * (1 - pct) : semi }}
          animate={{ strokeDashoffset: semi * (1 - pct) }}
          transition={{ duration: reduced ? 0 : 0.95, ease: EASE_OUT }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: 0 }}>
        <span className="text-2xl font-bold tabular-nums leading-none font-display" style={{ color }}>{value}</span>
        <span className="text-[0.55rem] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>risk / 100</span>
      </div>
    </div>
  )
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
  const reduced = usePrefersReducedMotion()
  const { riskLevel, riskScore, rationale, evidence } = investigation
  const t = RISK_THEME[riskLevel]
  const Icon = t.Icon

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 20, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduced ? 0 : 0.6, ease: EASE_OUT }}
      className="rounded-2xl p-6 mb-4"
      style={{
        background: "hsl(240,15%,8%)",
        border: `1px solid ${t.border}`,
        boxShadow: `0 0 36px ${t.glow}`,
      }}
    >
      {/* Verdict header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <ScoreGauge score={riskScore} color={t.color} reduced={reduced} />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] mb-1 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              Risk verdict
            </p>
            <p className="text-2xl font-bold font-display flex items-center gap-2" style={{ color: t.color }}>
              <motion.span
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: reduced ? 0 : 0.15, duration: 0.4, ease: EASE_OUT }}
                style={{ display: "inline-flex" }}
              >
                <Icon size={24} strokeWidth={2.4} />
              </motion.span>
              {t.verdict}
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>{t.signal} detected</p>
          </div>
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider"
          style={{ background: `${t.color}1f`, color: t.color, border: `1px solid ${t.border}` }}
        >
          {t.tag}
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
      <motion.div
        className="grid md:grid-cols-3 gap-3 mb-6"
        variants={staggerContainer(0.08, 0.1)}
        initial={reduced ? false : "hidden"}
        animate="show"
      >
        {evidence.map((e, i) => (
          <motion.div
            key={i}
            variants={cardRise}
            className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-xs font-semibold text-white mb-1.5">{e.label}</p>
            <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{e.why}</p>
            <ContributionBars vector={e.vectorScore} text={e.textScore} />
          </motion.div>
        ))}
      </motion.div>

      {/* Human-in-the-loop actions */}
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={onReport}
          disabled={reported}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 disabled:cursor-default active:scale-[0.97]"
          style={{
            background: reported ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: reported ? "rgb(74,222,128)" : "rgb(248,113,113)",
            border: `1px solid ${reported ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}
        >
          {reported ? <ShieldCheck size={15} strokeWidth={2.4} /> : <Flag size={15} strokeWidth={2.4} />}
          {reported ? "Reported to the corpus" : "Report listing"}
        </button>
        <a
          href="#"
          onClick={e => e.preventDefault()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-[0.97]"
          style={{
            background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))",
            color: "white",
            border: "1px solid rgba(16,185,129,0.4)",
          }}
        >
          Find verified resale
          <ArrowRight size={14} strokeWidth={2.4} />
        </a>
        <button
          className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-[0.97]"
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
    </motion.div>
  )
}
