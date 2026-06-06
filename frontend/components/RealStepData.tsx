"use client"
// ─────────────────────────────────────────────────────────────────────────────
// Renders the body of a REAL backend pipeline step (8 steps) using the exact
// data shapes from backend/pipeline.py + db.py, in the same visual language as
// the mock StepData. NEVER fabricates: a not_configured step shows what little is
// real (e.g. pure-compute typosquat distance) plus an honest note.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from "framer-motion"
import type {
  RealListing,
  RealRetrievalHit,
  RealVerdict,
  StepStatus,
} from "@/lib/types"
import ContributionBars from "@/components/ContributionBars"
import { retrievalToMatches, verdictToLevel } from "@/lib/realmap"
import { staggerContainer, cardRise, chipSlideIn, EASE_OUT } from "@/lib/motion"

type D = Record<string, unknown>

function Chip({ k, v, flagged }: { k: string; v: string; flagged: boolean }) {
  return (
    <motion.span
      variants={chipSlideIn}
      className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
      style={{
        background: flagged ? "var(--tg-risk-high-soft)" : "var(--tg-green-tint)",
        color: flagged ? "var(--tg-risk-high)" : "var(--tg-green)",
        border: `1px solid ${flagged ? "var(--tg-risk-high-border)" : "var(--tg-green-border)"}`,
      }}
    >
      <span style={{ opacity: 0.7 }}>{flagged ? "⚠" : "✓"}</span>
      <span style={{ color: "var(--tg-text-3)" }}>{k}:</span>
      <span className="font-medium">{v}</span>
    </motion.span>
  )
}

const RISKY_PAY = new Set(["zelle", "cashapp", "venmo_friends", "crypto", "wire", "gift_card", "bank_transfer"])
const RISKY_TRANSFER = new Set(["pdf", "screenshot", "barcode_image", "email"])

export default function RealStepData({
  stepNumber,
  status,
  data,
  reduced,
}: {
  stepNumber: number
  status: StepStatus
  data: D
  reduced: boolean
}) {
  // ── Step 1: Normalize Listing → entity chips from the structured listing ──
  if (stepNumber === 1) {
    const listing = (data.listing as RealListing | undefined) || null
    if (!listing) return <Note text="No structured listing was produced." />
    const chips: { k: string; v: string; flagged: boolean }[] = []
    const price = listing.price
    const face = listing.face_value
    const cur = listing.currency || ""
    if (price != null) {
      const belowFace = face != null && Number(face) > 0 && Number(price) / Number(face) <= 0.75
      chips.push({ k: "Price", v: `${cur}${price}${face != null ? ` / face ${cur}${face}` : ""}`, flagged: belowFace })
    }
    if (listing.quantity != null) chips.push({ k: "Qty", v: String(listing.quantity), flagged: false })
    if (listing.seller_handle) chips.push({ k: "Seller", v: listing.seller_handle, flagged: false })
    if (listing.domain) chips.push({ k: "Domain", v: listing.domain, flagged: true })
    if (listing.payment_method && listing.payment_method !== "unknown")
      chips.push({ k: "Payment", v: pretty(listing.payment_method), flagged: RISKY_PAY.has(listing.payment_method) })
    if (listing.transfer_method && listing.transfer_method !== "unknown")
      chips.push({ k: "Transfer", v: pretty(listing.transfer_method), flagged: RISKY_TRANSFER.has(listing.transfer_method) })
    if (listing.event) chips.push({ k: "Event", v: trunc(listing.event, 40), flagged: false })
    const urg = listing.urgency_cues || []
    if (urg.length) chips.push({ k: "Urgency", v: `${urg.length} cue${urg.length > 1 ? "s" : ""}`, flagged: true })
    if (chips.length === 0) chips.push({ k: "Signal", v: "No strong fields parsed", flagged: false })
    return (
      <motion.div className="flex flex-wrap gap-2" variants={staggerContainer(0.05)} initial={reduced ? false : "hidden"} animate="show">
        {chips.map((c, i) => (
          <Chip key={i} k={c.k} v={c.v} flagged={c.flagged} />
        ))}
      </motion.div>
    )
  }

  // ── Step 2: Hybrid Retrieval → pipeline pills + matches w/ contribution bars ──
  if (stepNumber === 2) {
    if (status === "not_configured") {
      return <Note text={`Hybrid retrieval offline: ${String(data.reason || "Atlas / embeddings unavailable")}. Retrieval did not contribute to this verdict.`} />
    }
    const results = (data.results as RealRetrievalHit[] | undefined) || []
    const fusion = String(data.fusion || "")
    const matches = retrievalToMatches(results)
    return (
      <div>
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--tg-info-tint)", color: "var(--tg-info)", border: "1px solid var(--tg-info-border)" }}>
            $vectorSearch
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--tg-green-tint)", color: "var(--tg-green)", border: "1px solid var(--tg-green-border)" }}>
            $search · text
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--tg-hover)", color: "var(--tg-text-3)", border: "1px solid var(--tg-border-strong)" }}>
            {fusion === "native_rankfusion" ? "$rankFusion (native)" : "reciprocal-rank fusion"}
          </span>
        </div>
        {matches.length === 0 ? (
          <Note text="No similar cases were returned for this listing." />
        ) : (
          <motion.div className="space-y-2.5" variants={staggerContainer(0.07)} initial={reduced ? false : "hidden"} animate="show">
            {matches.map((m, i) => (
              <motion.div key={i} variants={cardRise} className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border)" }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--tg-text)" }}>{m.label}</p>
                  <p className="text-xs mt-0.5 italic truncate" style={{ color: "var(--tg-text-3)" }}>{m.excerpt}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <ContributionBars vector={m.vectorScore} text={m.textScore} compact />
                  <div className="text-right" style={{ width: 44 }}>
                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--tg-accent)" }}>{m.score.toFixed(2)}</p>
                    <p style={{ fontSize: "0.55rem", color: "var(--tg-text-3)" }}>fused</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    )
  }

  // ── Step 3: Reputation → typosquat (compute) + prior reports (DB) ──
  if (stepNumber === 3) {
    const typo = (data.typosquat as D | undefined) || {}
    const prior = (data.prior_reports as D | undefined) || {}
    const isSquat = Boolean(typo.is_typosquat)
    const isOfficial = Boolean(typo.is_official)
    return (
      <div className="space-y-3">
        {typo.input ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Pill color={isSquat ? "var(--tg-risk-high)" : isOfficial ? "var(--tg-risk-low)" : "var(--tg-text-3)"}>
              {isSquat ? "LOOK-ALIKE" : isOfficial ? "OFFICIAL" : "DOMAIN"}
            </Pill>
            <span className="text-xs" style={{ color: "var(--tg-text-2)" }}>
              <code>{String(typo.input)}</code>
              {typo.nearest != null && typo.distance != null && (
                <> · edit-distance {String(typo.distance)} from <code>{String(typo.nearest)}</code></>
              )}
            </span>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>No domain to check.</p>
        )}
        {prior.status === "ok" ? (
          <p className="text-xs" style={{ color: "var(--tg-text-2)" }}>
            {Number(prior.total) > 0
              ? `${prior.total} prior report(s) match this domain/handle.`
              : "No prior reports match this domain/handle."}
          </p>
        ) : (
          <Note text={`Prior-report lookup not configured: ${String(prior.reason || "Atlas unreachable")}.`} />
        )}
      </div>
    )
  }

  // ── Step 4: Forgery & Duplicate ──
  if (stepNumber === 4) {
    if (status === "not_configured" || data.status === "not_configured") {
      return <Note text={`Duplicate lookup not configured: ${String(data.reason || "Atlas unreachable")}.`} />
    }
    if (data.status === "no_reference") {
      return <p className="text-xs" style={{ color: "var(--tg-text-2)" }}>No barcode/booking reference was present to check for duplication.</p>
    }
    const offered = Number(data.offered_to || 0)
    const tamper = data.tamper_hints ? String(data.tamper_hints) : ""
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Pill color={offered >= 1 ? "var(--tg-risk-high)" : "var(--tg-risk-low)"}>
            {offered >= 1 ? "DUPLICATE" : "UNIQUE"}
          </Pill>
          <span className="text-xs" style={{ color: "var(--tg-text-2)" }}>
            {offered >= 1 ? `Barcode/ref already offered to ${offered} buyer(s).` : "Barcode/ref not seen before."}
          </span>
        </div>
        {tamper && (
          <p className="text-xs" style={{ color: "var(--tg-risk-high)", lineHeight: 1.5 }}>⚠ Tamper hints: {tamper}</p>
        )}
      </div>
    )
  }

  // ── Step 5: Risk Scorer → score bar + band + severity breakdown ──
  if (stepNumber === 5) {
    if (status === "not_configured" || data.status === "not_configured") {
      const signals = (data.signals as D[] | undefined) || []
      return (
        <div className="space-y-3">
          <Note text={`Server-side scoring not configured: ${String(data.reason || "Atlas unreachable")}. The verdict falls back to the deterministic rule band.`} />
          {signals.length > 0 && <SignalList signals={signals} />}
        </div>
      )
    }
    const score = Number(data.score || 0)
    const band = String(data.band || "LOW")
    const color = riskColorVar(band)
    const bySeverity = (data.by_severity as D[] | undefined) || []
    const signals = (data.signals as D[] | undefined) || []
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
            <span className="text-sm mb-1" style={{ color: "var(--tg-text-3)" }}>/100</span>
          </div>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--tg-track-2)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: color, boxShadow: `0 0 10px ${tint(color, 60)}`, transformOrigin: "left center" }}
              initial={{ scaleX: reduced ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduced ? 0 : 0.7, ease: EASE_OUT }}
            >
              <div style={{ width: `${score}%`, height: "100%" }} />
            </motion.div>
          </div>
          <Pill color={color}>{band}</Pill>
        </div>
        {bySeverity.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bySeverity.map((s, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border)" }}>
                {String(s.severity)}: {String(s.count)} · w{String(s.weight)}
              </span>
            ))}
          </div>
        )}
        {signals.length > 0 && <SignalList signals={signals} />}
      </div>
    )
  }

  // ── Step 6: Official-Transfer Rules ──
  if (stepNumber === 6) {
    const violates = Boolean(data.violates_official_transfer)
    const signals = (data.signals as D[] | undefined) || []
    const rulesApplied = (data.rules_applied as string[] | undefined) || []
    const color = violates ? "var(--tg-risk-high)" : "var(--tg-risk-low)"
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Pill color={color}>{violates ? "VIOLATION" : "OK"}</Pill>
          <p className="text-xs" style={{ color: "var(--tg-text-2)", lineHeight: 1.5 }}>
            {violates
              ? "Listing relies on a non-official transfer and/or irreversible payment."
              : "No official-transfer rule violation detected."}
          </p>
        </div>
        {signals.length > 0 && <SignalList signals={signals} />}
        {rulesApplied.length > 0 && (
          <ul className="space-y-1">
            {rulesApplied.map((r, i) => (
              <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--tg-text-3)", lineHeight: 1.45 }}>
                <span style={{ color: "var(--tg-text-faint)" }}>·</span>{r}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // ── Step 7: Verdict → verdict pill + reasoning + evidence ──
  if (stepNumber === 7) {
    const v = (data as unknown) as RealVerdict
    const level = verdictToLevel(v.verdict)
    const color = riskColorVar(level)
    const evidence = v.evidence || []
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill color={color}>{v.verdict}</Pill>
          {typeof v.confidence === "number" && (
            <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>confidence {Math.round(v.confidence * 100)}%</span>
          )}
        </div>
        {v.reasoning && (
          <p className="text-sm italic pl-3" style={{ borderLeft: `2px solid ${color}`, color: "var(--tg-text)", lineHeight: 1.5 }}>
            {v.reasoning}
          </p>
        )}
        {evidence.length > 0 && (
          <ul className="space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--tg-text-2)", lineHeight: 1.45 }}>
                <span style={{ color }}>•</span>{e}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // ── Step 8: Persist ──
  if (stepNumber === 8) {
    if (status === "not_configured" || data.investigation_id === "no-db" || !data.investigation_id) {
      return <Note text={`Not persisted: ${String(data.reason || "Atlas unreachable")}. The verdict above is still valid for this session.`} />
    }
    return (
      <p className="text-xs" style={{ color: "var(--tg-text-2)" }}>
        Saved to <code>investigations</code> ·{" "}
        <code style={{ color: "var(--tg-green-2)" }}>{String(data.investigation_id)}</code>
      </p>
    )
  }

  return null
}

// ── small shared bits ─────────────────────────────────────────────────────────
// Translucent fills/borders derived from a CSS-var colour (theme-safe).
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
// Risk band → semantic CSS var (matches RiskCard / InvestigationStep).
function riskColorVar(level: string): string {
  return level === "HIGH" ? "var(--tg-risk-high)" : level === "MEDIUM" ? "var(--tg-risk-med)" : "var(--tg-risk-low)"
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: tint(color, 13), color, border: `1px solid ${tint(color, 27)}` }}>
      {children}
    </span>
  )
}

function Note({ text }: { text: string }) {
  return (
    <p className="text-xs" style={{ color: "var(--tg-text-3)", lineHeight: 1.5 }}>
      {text}
    </p>
  )
}

function SignalList({ signals }: { signals: D[] }) {
  return (
    <div className="space-y-1.5">
      {signals.slice(0, 6).map((s, i) => {
        const w = Number(s.weight || 0)
        const color = w >= 30 ? "var(--tg-risk-high)" : w >= 15 ? "var(--tg-risk-med)" : "var(--tg-text-3)"
        return (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded tabular-nums flex-shrink-0" style={{ background: tint(color, 12), color, border: `1px solid ${tint(color, 20)}` }}>
              +{w}
            </span>
            <span className="text-xs" style={{ color: "var(--tg-text-2)", lineHeight: 1.4 }}>
              {String(s.detail || s.signal || "")}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function pretty(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}
