"use client"
import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Shield, AlertTriangle, CheckCircle2, Clock, History, Search,
  ExternalLink, Trash2, X, RefreshCw, Loader2, WifiOff,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"
import { fadeUpItem, staggerContainer, EASE_OUT } from "@/lib/motion"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import PremiumBackground from "@/components/PremiumBackground"
import { API, isRealMode } from "@/lib/config"
import { getAuth } from "@/lib/auth"
// Local storage fallback
import {
  getUserHistory, deleteHistoryEntry, clearUserHistory,
  type HistoryEntry,
} from "@/lib/history"

const VERDICT_CONFIG = {
  HIGH: {
    Icon: AlertTriangle, color: "var(--tg-risk-high)",
    soft: "var(--tg-risk-high-soft)", border: "var(--tg-risk-high-border)", label: "High Risk",
  },
  MEDIUM: {
    Icon: Shield, color: "var(--tg-warn)",
    soft: "var(--tg-warn-tint)", border: "var(--tg-warn-border)", label: "Medium Risk",
  },
  LOW: {
    Icon: CheckCircle2, color: "var(--tg-risk-low)",
    soft: "var(--tg-risk-low-soft)", border: "var(--tg-risk-low-border)", label: "Low Risk",
  },
} as const

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Shape of entries returned from MongoDB (snake_case) vs localStorage (camelCase)
function normalizeEntry(e: Record<string, unknown>): HistoryEntry {
  return {
    id: (e.entry_id || e.id || e._id || "") as string,
    userId: (e.user_id || e.userId || null) as string | null,
    query: (e.query || "") as string,
    queryType: ((e.query_type || e.queryType || "text") as "text" | "url" | "file"),
    verdict: ((e.verdict || "LOW") as "HIGH" | "MEDIUM" | "LOW"),
    score: Number(e.score || 0),
    rationale: (e.rationale || "") as string,
    timestamp: (e.created_at || e.timestamp || new Date().toISOString()) as string,
    investigationId: (e.investigation_id || e.investigationId || undefined) as string | undefined,
  }
}

export default function HistoryPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dbMode, setDbMode] = useState<"mongo" | "local" | "none">("none")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL")

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    if (!user) {
      setEntries([])
      setLoading(false)
      setDbMode("none")
      return
    }

    // Try MongoDB first (real mode)
    if (isRealMode()) {
      try {
        const { token } = getAuth()
        const res = await fetch(API.history(user.id), {
          headers: token ? { "Authorization": `Bearer ${token}` } : {},
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === "ok") {
            setEntries((data.entries as Record<string, unknown>[]).map(normalizeEntry))
            setDbMode("mongo")
            setLoading(false)
            return
          }
        }
      } catch {
        // fall through to localStorage
      }
    }

    // Fallback: localStorage
    const local = getUserHistory(user.id)
    setEntries(local)
    setDbMode("local")
    setLoading(false)
  }, [user])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const handleDelete = useCallback(async (entry: HistoryEntry) => {
    if (!user) return
    // Optimistic update
    setEntries(prev => prev.filter(e => e.id !== entry.id))

    if (dbMode === "mongo" && isRealMode()) {
      try {
        const { token } = getAuth()
        await fetch(`${API.historyDeleteEntry(entry.id)}?user_id=${encodeURIComponent(user.id)}`, {
          method: "DELETE",
          headers: token ? { "Authorization": `Bearer ${token}` } : {},
        })
      } catch { /* best-effort */ }
    }
    // Always clean local too
    deleteHistoryEntry(entry.id)
  }, [user, dbMode])

  const handleClearAll = useCallback(async () => {
    if (!user || !confirm("Delete all your investigation history? This cannot be undone.")) return
    setEntries([])

    if (dbMode === "mongo" && isRealMode()) {
      try {
        const { token } = getAuth()
        await fetch(API.historyClear(user.id), { 
          method: "DELETE",
          headers: token ? { "Authorization": `Bearer ${token}` } : {},
        })
      } catch { /* best-effort */ }
    }
    clearUserHistory(user.id)
  }, [user, dbMode])

  const filtered = entries.filter(e => {
    if (filter !== "ALL" && e.verdict !== filter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!e.query.toLowerCase().includes(s) && !e.rationale.toLowerCase().includes(s)) return false
    }
    return true
  })

  const counts = {
    ALL: entries.length,
    HIGH: entries.filter(e => e.verdict === "HIGH").length,
    MEDIUM: entries.filter(e => e.verdict === "MEDIUM").length,
    LOW: entries.filter(e => e.verdict === "LOW").length,
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--tg-bg)" }}>
      <PremiumBackground teal />
      <Navbar />
      <div className="flex-1 relative z-10 max-w-3xl mx-auto w-full px-4 sm:px-6 pt-28 pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="flex items-center justify-between mb-6 flex-wrap gap-3"
        >
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold font-display tracking-tight"
              style={{ color: "var(--tg-text)" }}>
              <History size={24} style={{ color: "var(--tg-accent)" }} />
              Investigation History
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--tg-text-3)" }}>
              {user
                ? `Showing investigations for ${user.name} · ${entries.length} total`
                : "Sign in to view your investigation history"}
              {dbMode === "mongo" && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--tg-accent-tint)", color: "var(--tg-accent)" }}>
                  ● MongoDB
                </span>
              )}
              {dbMode === "local" && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--tg-warn-tint)", color: "var(--tg-warn)" }}>
                  <WifiOff size={10} className="inline mr-1" />local only
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchHistory} title="Refresh"
              className="p-2 rounded-xl cursor-pointer transition-colors"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)", color: "var(--tg-text-2)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--tg-text-2)")}>
              <RefreshCw size={15} />
            </button>
            {entries.length > 0 && (
              <button onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                style={{ background: "var(--tg-risk-high-soft)", color: "var(--tg-risk-high)", border: "1px solid var(--tg-risk-high-border)" }}>
                <Trash2 size={14} /> Clear all
              </button>
            )}
          </div>
        </motion.div>

        {/* Not logged in */}
        {!user && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 rounded-2xl"
            style={{ border: "1px dashed var(--tg-border-strong)" }}>
            <Shield size={32} className="mx-auto mb-3" style={{ color: "var(--tg-text-3)" }} />
            <p className="text-sm font-medium mb-1" style={{ color: "var(--tg-text-2)" }}>Sign in to see your history</p>
            <p className="text-xs mb-4" style={{ color: "var(--tg-text-3)" }}>Your investigations are saved per account.</p>
            <button onClick={() => router.push("/investigate")}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
              style={{ background: "var(--tg-accent)", color: "var(--tg-on-accent)" }}>
              Check a listing
            </button>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3" style={{ color: "var(--tg-text-3)" }}>
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading history…</span>
          </div>
        )}

        {/* Content */}
        {!loading && user && (
          <>
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
                        layout
                        variants={fadeUpItem}
                        initial="hidden"
                        animate="show"
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
                                {entry.query
                                  ? (entry.query.length > 120 ? entry.query.slice(0, 120) + "…" : entry.query)
                                  : "No query text available"}
                              </p>
                              {/* Rationale */}
                              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--tg-text-2)" }}>
                                {entry.rationale
                                  ? (entry.rationale.length > 160 ? entry.rationale.slice(0, 160) + "…" : entry.rationale)
                                  : "No rationale available"}
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
                                {dbMode === "mongo" && (
                                  <span className="text-[0.65rem] px-2 py-0.5 rounded-full"
                                    style={{ background: "var(--tg-accent-tint)", color: "var(--tg-accent)" }}>
                                    ● saved
                                  </span>
                                )}
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
                            <button onClick={() => handleDelete(entry)}
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
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
