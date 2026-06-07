"use client"
import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ShieldAlert, AlertTriangle, ShieldCheck, Share2, Check,
  ArrowRight, ExternalLink, Loader2, Search,
} from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import PremiumBackground from "@/components/PremiumBackground"
import RiskCard from "@/components/RiskCard"
import type { Investigation, RiskLevel } from "@/lib/types"
import { API } from "@/lib/config"
import { EASE_OUT, fadeUpItem, staggerContainer } from "@/lib/motion"

// ── Helpers ───────────────────────────────────────────────────────────────────

function verdictToLevel(v: string | undefined): RiskLevel {
  if (v === "SCAM") return "HIGH"
  if (v === "LIKELY-LEGIT") return "LOW"
  return "MEDIUM"
}

const RISK_LABEL: Record<RiskLevel, string> = {
  HIGH: "SCAM",
  MEDIUM: "SUSPICIOUS",
  LOW: "LIKELY LEGIT",
}

const RISK_ICON: Record<RiskLevel, typeof ShieldAlert> = {
  HIGH: ShieldAlert,
  MEDIUM: AlertTriangle,
  LOW: ShieldCheck,
}

const RISK_VARS: Record<RiskLevel, { color: string; soft: string; border: string; glow: string }> = {
  HIGH: {
    color: "var(--tg-risk-high)",
    soft: "var(--tg-risk-high-soft)",
    border: "var(--tg-risk-high-border)",
    glow: "var(--tg-risk-high-glow)",
  },
  MEDIUM: {
    color: "var(--tg-risk-med)",
    soft: "var(--tg-risk-med-soft)",
    border: "var(--tg-risk-med-border)",
    glow: "var(--tg-risk-med-glow)",
  },
  LOW: {
    color: "var(--tg-risk-low)",
    soft: "var(--tg-risk-low-soft)",
    border: "var(--tg-risk-low-border)",
    glow: "var(--tg-risk-low-glow)",
  },
}

const MODEL_DISPLAY: Record<string, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicReportPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : ""

  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) { setError("No report ID provided."); setLoading(false); return }
    setLoading(true)
    fetch(API.publicReport(id))
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.detail || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((data: Record<string, unknown>) => {
        setRawData(data)
        const level = verdictToLevel(data.verdict as string | undefined)
        const confidence = typeof data.confidence === "number" ? data.confidence : 0.5
        const riskScore =
          typeof data.risk_score === "number"
            ? Math.max(0, Math.min(100, Math.round(data.risk_score)))
            : Math.round(confidence * 100)
        const evidenceRaw = Array.isArray(data.evidence) ? (data.evidence as string[]) : []
        const inv: Investigation = {
          inputText: "",
          entities: [],
          matches: [],
          riskScore,
          riskLevel: level,
          rule: { passed: data.verdict !== "SCAM", note: "" },
          rationale:
            typeof data.rationale === "string" && data.rationale
              ? data.rationale
              : "Verdict produced from available evidence.",
          evidence: evidenceRaw.map(e => ({
            label: (e || "").slice(0, 50),
            why: e,
            vectorScore: -1,
            textScore: -1,
          })),
          modelUsed: typeof data.model_used === "string" ? data.model_used : undefined,
          isFallback: Boolean(data.is_fallback),
        }
        setInvestigation(inv)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || "Failed to load report")
        setLoading(false)
      })
  }, [id])

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const level = investigation?.riskLevel ?? "MEDIUM"
  const vars = RISK_VARS[level]
  const Icon = RISK_ICON[level]
  const isScam = level === "HIGH"

  const listing = rawData?.listing as Record<string, unknown> | null | undefined

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--tg-bg)" }}>
      <PremiumBackground />
      <Navbar />

      <div className="flex-1 relative z-10 max-w-2xl mx-auto w-full px-4 sm:px-6 pt-28 pb-16">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-32 gap-3" style={{ color: "var(--tg-text-3)" }}>
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm">Loading report…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-8 text-center"
            style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-risk-high-border)" }}>
            <ShieldAlert size={36} className="mx-auto mb-4" style={{ color: "var(--tg-risk-high)" }} />
            <h1 className="text-xl font-bold mb-2" style={{ color: "var(--tg-text)" }}>Report not found</h1>
            <p className="text-sm mb-6" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
              {error === "HTTP 404" || error === "Report not found"
                ? "This investigation report doesn't exist or may have been removed."
                : error}
            </p>
            <button
              onClick={() => router.push("/investigate")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm cursor-pointer"
              style={{ background: "var(--tg-accent)", color: "var(--tg-on-accent)" }}>
              Check a listing <ArrowRight size={15} />
            </button>
          </motion.div>
        )}

        {/* Report */}
        {!loading && investigation && (
          <motion.div
            variants={staggerContainer(0.07, 0.04)}
            initial="hidden"
            animate="show">

            {/* Header */}
            <motion.div variants={fadeUpItem} className="mb-6">
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--tg-text-3)" }}>
                TicketGuard · Shared Investigation Report
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ background: vars.soft, border: `1px solid ${vars.border}` }}>
                  <Icon size={15} style={{ color: vars.color }} strokeWidth={2.3} />
                  <span className="text-sm font-bold" style={{ color: vars.color }}>
                    {RISK_LABEL[level]}
                  </span>
                </div>
                {typeof rawData?.model_used === "string" && rawData.model_used && (
                  <span className="text-xs px-2 py-1 rounded-full"
                    style={{
                      background: rawData.is_fallback ? "rgba(234,179,8,0.1)" : "rgba(66,133,244,0.1)",
                      color: rawData.is_fallback ? "rgb(250,204,21)" : "rgba(66,133,244,0.9)",
                      border: `1px solid ${rawData.is_fallback ? "rgba(234,179,8,0.2)" : "rgba(66,133,244,0.2)"}`,
                    }}>
                    {rawData.is_fallback ? "↩ Fallback: " : "✦ "}
                    {MODEL_DISPLAY[rawData.model_used] ?? rawData.model_used}
                  </span>
                )}
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors ml-auto"
                  style={{
                    background: copied ? "rgba(34,197,94,0.1)" : "var(--tg-surface-2)",
                    color: copied ? "rgb(34,197,94)" : "var(--tg-text-2)",
                    border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "var(--tg-border-strong)"}`,
                  }}>
                  {copied ? <Check size={12} /> : <Share2 size={12} />}
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
            </motion.div>

            {/* SCAM warning banner */}
            {isScam && (
              <motion.div
                variants={fadeUpItem}
                className="rounded-2xl p-5 mb-6 flex items-start gap-4"
                style={{
                  background: vars.soft,
                  border: `1px solid ${vars.border}`,
                  boxShadow: `0 0 32px ${vars.glow}`,
                }}>
                <ShieldAlert size={22} style={{ color: vars.color, flexShrink: 0, marginTop: 2 }} strokeWidth={2.2} />
                <div>
                  <p className="font-bold text-base mb-1" style={{ color: vars.color }}>
                    Warning: This listing was flagged as a likely SCAM
                  </p>
                  <p className="text-sm" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
                    TicketGuard's AI agent found high-risk signals in this listing. Do NOT send
                    money or personal information to this seller. Verify any ticket purchase
                    through an official, protected resale platform.
                  </p>
                </div>
              </motion.div>
            )}

            {/* RiskCard */}
            <motion.div variants={fadeUpItem}>
              <RiskCard investigation={investigation} onReport={() => {}} reported={false} />
            </motion.div>

            {/* Listing detail (if available) */}
            {listing && (
              <motion.div
                variants={fadeUpItem}
                className="mt-5 rounded-2xl p-5"
                style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
                <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--tg-text-3)" }}>
                  Extracted Listing Details
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    ["Event", listing.event],
                    ["Price", listing.price != null ? `${listing.currency ?? ""} ${listing.price}`.trim() : null],
                    ["Face value", listing.face_value != null ? `${listing.currency ?? ""} ${listing.face_value}`.trim() : null],
                    ["Quantity", listing.quantity],
                    ["Payment", listing.payment_method],
                    ["Transfer", listing.transfer_method],
                    ["Domain", listing.domain],
                    ["Seller", listing.seller_handle],
                  ] as [string, unknown][]).filter(([, v]) => v != null && v !== "").map(([label, value]) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: "var(--tg-surface-2)" }}>
                      <p className="text-[0.6rem] uppercase tracking-wider mb-1" style={{ color: "var(--tg-text-3)" }}>{label}</p>
                      <p className="text-sm font-medium truncate" style={{ color: "var(--tg-text)" }}>{String(value)}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* CTA */}
            <motion.div
              variants={fadeUpItem}
              className="mt-6 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: "var(--tg-text)" }}>
                  Check your own listing
                </p>
                <p className="text-xs" style={{ color: "var(--tg-text-2)" }}>
                  Paste a suspicious ticket listing or DM and get an AI-backed risk verdict in seconds.
                </p>
              </div>
              <button
                onClick={() => router.push("/investigate")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm cursor-pointer flex-shrink-0 transition-all"
                style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)", boxShadow: "0 4px 16px var(--tg-accent-glow)" }}>
                <Search size={14} strokeWidth={2.4} /> Investigate <ArrowRight size={14} strokeWidth={2.4} />
              </button>
            </motion.div>

            {/* Meta footer */}
            <motion.p
              variants={fadeUpItem}
              className="text-xs mt-6 text-center"
              style={{ color: "var(--tg-text-3)", lineHeight: 1.6 }}>
              Decision-support only — not a guarantee. Verify independently before transacting.
              {rawData?.created_at ? ` · Generated ${new Date(rawData.created_at as string).toLocaleDateString()}` : ""}
            </motion.p>
          </motion.div>
        )}
      </div>

      <Footer />
    </div>
  )
}
