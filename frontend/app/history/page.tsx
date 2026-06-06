"use client"
import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Clock, ShieldAlert, AlertTriangle, ShieldCheck,
  Trash2, RefreshCw, Search, X, History, ExternalLink
} from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/AuthProvider"
import { getUserHistory, deleteHistoryEntry, clearUserHistory, type HistoryEntry } from "@/lib/history"
import { EASE_OUT, staggerContainer, fadeUpItem } from "@/lib/motion"
import { useRouter } from "next/navigation"

const VERDICT_CONFIG = {
  HIGH: { label: "SCAM", color: "var(--tg-risk-high)", soft: "var(--tg-risk-high-soft)", border: "var(--tg-risk-high-border)", Icon: ShieldAlert },
  MEDIUM: { label: "SUSPICIOUS", color: "var(--tg-risk-med)", soft: "var(--tg-risk-med-soft)", border: "var(--tg-risk-med-border)", Icon: AlertTriangle },
  LOW: { label: "LIKELY-LEGIT", color: "var(--tg-risk-low)", soft: "var(--tg-risk-low-soft)", border: "var(--tg-risk-low-border)", Icon: ShieldCheck },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function HistoryPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL")
  const [search, setSearch] = useState("")
  const [clearing, setClearing] = useState(false)

  const load = useCallback(() => {
    setEntries(getUserHistory(user?.id ?? null))
  }, [user?.id])

  useEffect(() => { load() }, [load])

  const handleDelete = (id: string) => {
    deleteHistoryEntry(id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const handleClearAll = async () => {
    setClearing(true)
    await new Promise(r => setTimeout(r, 400))
    clearUserHistory(user?.id ?? null)
    setEntries([])
    setClearing(false)
  }

  const filtered = entries.filter(e => {
    if (filter !== "ALL" && e.verdict !== filter) return false
    if (search && !e.query.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    ALL: entries.length,
    HIGH: entries.filter(e => e.verdict === "HIGH").length,
    MEDIUM: entries.filter(e => e.verdict === "MEDIUM").length,
    LOW: entries.filter(e => e.verdict === "LOW").length,
  }

  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100vh" }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-20">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <History size={20} style={{ color: "var(--tg-accent)" }} />
              <h1 className="text-2xl font-bold font-display" style={{ color: "var(--tg-text)" }}>Investigation History</h1>
            </div>
            <p className="text-sm" style={{ color: "var(--tg-text-3)" }}>
              {user ? `Showing investigations for ${user.name}` : "Anonymous session history"} · {entries.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors"
              style={{ background: "var(--tg-surface)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}>
              <RefreshCw size={14} />
            </button>
            {entries.length > 0 && (
              <button onClick={handleClearAll} disabled={clearing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm cursor-pointer transition-colors disabled:opacity-40"
                style={{ background: "var(--tg-risk-high-soft)", color: "var(--tg-risk-high)", border: "1px solid var(--tg-risk-high-border)" }}>
                <Trash2 size={14} /> Clear all
              </button>
            )}
          </div>
        </motion.div>

        {/* Search + filter */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.05 }}
          className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--tg-text-3)" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search your queries…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--tg-surface)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)" }}
              onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map(f => {
              const active = filter === f
              const c = f === "ALL" ? "var(--tg-accent)" : VERDICT_CONFIG[f as keyof typeof VERDICT_CONFIG].color
              return (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all"
                  style={{
                    background: active ? (f === "ALL" ? "var(--tg-accent-tint-2)" : VERDICT_CONFIG[f as keyof typeof VERDICT_CONFIG].soft) : "var(--tg-surface)",
                    color: active ? c : "var(--tg-text-3)",
                    border: `1px solid ${active ? (f === "ALL" ? "var(--tg-accent-border)" : VERDICT_CONFIG[f as keyof typeof VERDICT_CONFIG].border) : "var(--tg-border-strong)"}`,
                  }}>
                  {f} ({counts[f]})
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* Entries */}
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 rounded-2xl"
            style={{ border: "1px dashed var(--tg-border-strong)" }}>
            <History size={32} className="mx-auto mb-3" style={{ color: "var(--tg-text-3)" }} />
            <p className="text-sm font-medium mb-1" style={{ color: "var(--tg-text-2)" }}>
              {entries.length === 0 ? "No investigations yet" : "No results match your filter"}
            </p>
            <p className="text-xs mb-4" style={{ color: "var(--tg-text-3)" }}>
              {entries.length === 0 ? "Run an investigation to see your history here." : "Try a different search or filter."}
            </p>
            {entries.length === 0 && (
              <button onClick={() => router.push("/investigate")}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                style={{ background: "var(--tg-accent)", color: "var(--tg-on-accent)" }}>
                Check a listing
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer(0.04, 0)}
            initial="hidden" animate="show"
            className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map(entry => {
                const cfg = VERDICT_CONFIG[entry.verdict]
                const VIcon = cfg.Icon
                return (
                  <motion.div key={entry.id}
                    variants={fadeUpItem}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="rounded-2xl p-5"
                    style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Verdict icon */}
                        <div className="flex-shrink-0 p-2 rounded-xl mt-0.5"
                          style={{ background: cfg.soft, color: cfg.color }}>
                          <VIcon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          {/* Query text */}
                          <p className="text-sm font-medium mb-2 leading-relaxed" style={{ color: "var(--tg-text)" }}>
                            {entry.query.length > 120 ? entry.query.slice(0, 120) + "…" : entry.query}
                          </p>
                          {/* Rationale */}
                          <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--tg-text-2)" }}>
                            {entry.rationale.length > 160 ? entry.rationale.slice(0, 160) + "…" : entry.rationale}
                          </p>
                          {/* Tags */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold uppercase"
                              style={{ background: cfg.soft, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                              {cfg.label}
                            </span>
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full"
                              style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-3)" }}>
                              Score: {entry.score}
                            </span>
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full"
                              style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-3)", textTransform: "capitalize" }}>
                              {entry.queryType}
                            </span>
                            <span className="text-xs flex items-center gap-1" style={{ color: "var(--tg-text-3)" }}>
                              <Clock size={11} /> {timeAgo(entry.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => router.push(`/investigate?q=${encodeURIComponent(entry.query)}`)}
                          title="Re-investigate"
                          className="p-2 rounded-lg cursor-pointer transition-colors"
                          style={{ color: "var(--tg-accent)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-accent-tint-2)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <ExternalLink size={14} />
                        </button>
                        <button onClick={() => handleDelete(entry.id)}
                          title="Delete"
                          className="p-2 rounded-lg cursor-pointer transition-colors"
                          style={{ color: "var(--tg-text-3)" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-risk-high)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--tg-text-3)")}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
      <Footer />
    </div>
  )
}
