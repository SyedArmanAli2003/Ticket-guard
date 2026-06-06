"use client"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldAlert, AlertTriangle, ShieldCheck, Flag, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react"
import type { Investigation, RiskLevel } from "@/lib/types"
import ContributionBars from "@/components/ContributionBars"
import AskFollowUp from "@/components/AskFollowUp"
import { useCountUp } from "@/lib/useCountUp"
import { usePrefersReducedMotion, staggerContainer, cardRise, EASE_OUT } from "@/lib/motion"

// Verdict vocabulary stays SCAM / SUSPICIOUS / LIKELY-LEGIT (never authentic/genuine).
const RISK_THEME: Record<
  RiskLevel,
  { verdict: string; tag: string; signal: string; color: string; soft: string; border: string; glow: string; Icon: typeof ShieldAlert }
> = {
  HIGH: {
    verdict: "Scam",
    tag: "SCAM",
    signal: "High-risk signals",
    color: "var(--tg-risk-high)",
    soft: "var(--tg-risk-high-soft)",
    border: "var(--tg-risk-high-border)",
    glow: "var(--tg-risk-high-glow)",
    Icon: ShieldAlert,
  },
  MEDIUM: {
    verdict: "Suspicious",
    tag: "SUSPICIOUS",
    signal: "Elevated-risk signals",
    color: "var(--tg-risk-med)",
    soft: "var(--tg-risk-med-soft)",
    border: "var(--tg-risk-med-border)",
    glow: "var(--tg-risk-med-glow)",
    Icon: AlertTriangle,
  },
  LOW: {
    verdict: "Likely-legit",
    tag: "LIKELY-LEGIT",
    signal: "No high-risk signals",
    color: "var(--tg-risk-low)",
    soft: "var(--tg-risk-low-soft)",
    border: "var(--tg-risk-low-border)",
    glow: "var(--tg-risk-low-glow)",
    Icon: ShieldCheck,
  },
}

// Verified resale platforms to direct users to
const VERIFIED_PLATFORMS = [
  { name: "StubHub", url: "https://www.stubhub.com", description: "FanProtect Guarantee" },
  { name: "SeatGeek", url: "https://www.seatgeek.com", description: "Buyer guarantee" },
  { name: "Ticketmaster", url: "https://www.ticketmaster.com", description: "Official tickets" },
  { name: "Vivid Seats", url: "https://www.vividseats.com", description: "Buyer protection" },
]

function ScoreGauge({ score, color, reduced }: { score: number; color: string; reduced: boolean }) {
  const value = useCountUp(score, 950)
  const size = 96
  const stroke = 8
  const r = (size - stroke) / 2
  const semi = Math.PI * r
  const pct = Math.min(100, Math.max(0, score)) / 100

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size / 2 + 18 }} aria-hidden>
      <svg width={size} height={size / 2 + 4} viewBox={`0 0 ${size} ${size / 2 + 4}`}>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke="var(--tg-track)" strokeWidth={stroke} strokeLinecap="round"
        />
        <motion.path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={semi}
          initial={{ strokeDashoffset: reduced ? semi * (1 - pct) : semi }}
          animate={{ strokeDashoffset: semi * (1 - pct) }}
          transition={{ duration: reduced ? 0 : 0.95, ease: EASE_OUT }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: 0 }}>
        <span className="text-2xl font-bold tabular-nums leading-none font-display" style={{ color }}>{value}</span>
        <span className="text-[0.55rem] mt-0.5" style={{ color: "var(--tg-text-3)" }}>risk / 100</span>
      </div>
    </div>
  )
}

// Modal for "Find Verified Resale"
function VerifiedResaleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)", boxShadow: "var(--tg-shadow)" }}>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={20} style={{ color: "var(--tg-risk-low)" }} />
              <h2 className="font-bold font-display text-lg" style={{ color: "var(--tg-text)" }}>Find Verified Resale</h2>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
              Skip the risk. Buy from these verified platforms with buyer-protection guarantees.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {VERIFIED_PLATFORMS.map(p => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col gap-1 p-4 rounded-xl cursor-pointer transition-all"
                  style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border-strong)" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--tg-accent-border)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--tg-border-strong)")}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: "var(--tg-text)" }}>{p.name}</span>
                    <ExternalLink size={12} style={{ color: "var(--tg-text-3)" }} />
                  </div>
                  <span className="text-xs" style={{ color: "var(--tg-risk-low)" }}>{p.description}</span>
                </a>
              ))}
            </div>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors"
              style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}>
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Modal for "Proceed, I accept the risk"
function ProceedModal({ open, onClose, riskLevel }: { open: boolean; onClose: () => void; riskLevel: RiskLevel }) {
  const [checked, setChecked] = useState(false)
  if (!open) return null
  const t = RISK_THEME[riskLevel]
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--tg-surface)", border: `1px solid ${t.border}`, boxShadow: `var(--tg-shadow), 0 0 36px ${t.glow}` }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={20} style={{ color: t.color }} />
              <h2 className="font-bold font-display text-lg" style={{ color: "var(--tg-text)" }}>Proceed with caution</h2>
            </div>
            <div className="rounded-xl px-4 py-3 mb-5" style={{ background: t.soft, border: `1px solid ${t.border}` }}>
              <p className="text-sm font-semibold mb-1" style={{ color: t.color }}>Risk level: {riskLevel}</p>
              <p className="text-xs" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
                TicketGuard flagged this listing with a {riskLevel.toLowerCase()} risk level. If you still choose to proceed, please ensure you:
              </p>
            </div>
            <ul className="space-y-2 mb-5">
              {[
                "Use a credit card (enables chargeback protection)",
                "Never pay via Zelle, Venmo, or cryptocurrency",
                "Ask the seller to use the official ticket transfer app",
                "Verify the ticket barcode with the event organizer before paying",
                "Meet in a public place if transferring physical tickets",
              ].map(tip => (
                <li key={tip} className="flex items-start gap-2 text-xs" style={{ color: "var(--tg-text-2)" }}>
                  <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: "var(--tg-risk-low)" }} />
                  {tip}
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5" />
              <span className="text-xs" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
                I understand this is decision-support only. TicketGuard cannot guarantee the authenticity of any ticket. I proceed at my own risk.
              </span>
            </label>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors"
                style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}>
                Cancel
              </button>
              <button disabled={!checked} onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all disabled:opacity-40"
                style={{ background: t.soft, color: t.color, border: `1px solid ${t.border}` }}>
                I accept the risk
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const [showResale, setShowResale] = useState(false)
  const [showProceed, setShowProceed] = useState(false)

  return (
    <>
      <VerifiedResaleModal open={showResale} onClose={() => setShowResale(false)} />
      <ProceedModal open={showProceed} onClose={() => setShowProceed(false)} riskLevel={riskLevel} />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 20, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.6, ease: EASE_OUT }}
        className="rounded-2xl p-6 mb-4"
        style={{
          background: "var(--tg-surface)",
          border: `1px solid ${t.border}`,
          boxShadow: `var(--tg-shadow), 0 0 36px ${t.glow}`,
        }}
      >
        {/* Verdict header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <ScoreGauge score={riskScore} color={t.color} reduced={reduced} />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] mb-1 flex items-center gap-1.5" style={{ color: "var(--tg-text-3)" }}>
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
              <p className="text-xs mt-1" style={{ color: "var(--tg-text-3)" }}>{t.signal} detected</p>
            </div>
          </div>
          <span
            className="text-xs px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider"
            style={{ background: `color-mix(in srgb, ${t.color} 12%, transparent)`, color: t.color, border: `1px solid ${t.border}` }}
          >
            {t.tag}
          </span>
        </div>

        {/* One-line rationale */}
        <p className="text-sm mt-4 mb-5" style={{ color: "var(--tg-text)", lineHeight: 1.6 }}>
          {rationale}
        </p>

        {/* Evidence chips */}
        <p className="text-xs uppercase tracking-[0.18em] mb-3" style={{ color: "var(--tg-text-3)" }}>
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
              style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border)" }}
            >
              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--tg-text)" }}>{e.label}</p>
              <p className="text-xs mb-3" style={{ color: "var(--tg-text-2)", lineHeight: 1.5 }}>{e.why}</p>
              <ContributionBars vector={e.vectorScore} text={e.textScore} />
            </motion.div>
          ))}
        </motion.div>

        {/* Human-in-the-loop actions — all 3 buttons now wired */}
        <div className="flex flex-wrap gap-2.5">
          <button
            id="btn-report-listing"
            onClick={onReport}
            disabled={reported}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 disabled:cursor-default active:scale-[0.97]"
            style={{
              background: reported ? "var(--tg-risk-low-soft)" : "var(--tg-risk-high-soft)",
              color: reported ? "var(--tg-risk-low)" : "var(--tg-risk-high)",
              border: `1px solid ${reported ? "var(--tg-risk-low-border)" : "var(--tg-risk-high-border)"}`,
            }}
          >
            {reported ? <ShieldCheck size={15} strokeWidth={2.4} /> : <Flag size={15} strokeWidth={2.4} />}
            {reported ? "Reported to the corpus" : "Report listing"}
          </button>

          {/* ✅ FIXED: Find verified resale now opens a modal */}
          <button
            id="btn-find-resale"
            onClick={() => setShowResale(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-[0.97]"
            style={{
              background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))",
              color: "var(--tg-on-accent)",
              border: "1px solid var(--tg-accent-border)",
            }}
          >
            Find verified resale
            <ArrowRight size={14} strokeWidth={2.4} />
          </button>

          {/* ✅ FIXED: Proceed button now opens a confirmation modal */}
          <button
            id="btn-proceed-risk"
            onClick={() => setShowProceed(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-[0.97]"
            style={{
              background: "var(--tg-surface-2)",
              color: "var(--tg-text-2)",
              border: "1px solid var(--tg-border-strong)",
            }}
          >
            Proceed, I accept the risk
          </button>
        </div>

        <p className="text-xs mt-4" style={{ color: "var(--tg-text-3)", lineHeight: 1.5 }}>
          Decision-support only, not a guarantee — verify the seller independently and pay only through official, protected channels. Risk signals reflect synthetic demo patterns.
        </p>
      </motion.div>

      {/* ✅ NEW: Ask a follow-up section */}
      <AskFollowUp investigation={investigation} />
    </>
  )
}
