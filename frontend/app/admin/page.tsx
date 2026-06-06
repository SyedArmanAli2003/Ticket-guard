"use client"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Shield, Users, AlertTriangle, CheckCircle2, BarChart3,
  Database, Cpu, Activity, RefreshCw, LogOut, Clock, TrendingUp,
  ShieldAlert, ShieldCheck, Eye
} from "lucide-react"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/AuthProvider"
import { getAllUsers, getAuth } from "@/lib/auth"
import type { AuthUser } from "@/lib/auth"
import { getHealth } from "@/lib/api"
import { getMode, API } from "@/lib/config"
import { EASE_OUT, staggerContainer, fadeUpItem } from "@/lib/motion"
import { useRouter } from "next/navigation"

interface StatCard {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  sub?: string
}

function StatBox({ card }: { card: StatCard }) {
  return (
    <motion.div variants={fadeUpItem}
      className="rounded-2xl p-5"
      style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-xl" style={{ background: `color-mix(in srgb, ${card.color} 12%, transparent)` }}>
          {card.icon}
        </div>
      </div>
      <p className="text-3xl font-bold font-display mb-1" style={{ color: card.color }}>{card.value}</p>
      <p className="text-sm font-medium" style={{ color: "var(--tg-text)" }}>{card.label}</p>
      {card.sub && <p className="text-xs mt-0.5" style={{ color: "var(--tg-text-3)" }}>{card.sub}</p>}
    </motion.div>
  )
}

// Simulate investigation data for demo
const MOCK_INVESTIGATIONS = [
  { id: "inv-001", verdict: "SCAM", score: 95, text: "Selling 2 World Cup tickets via Zelle only, PDF after payment", time: "2 min ago", confidence: 0.9 },
  { id: "inv-002", verdict: "SUSPICIOUS", score: 55, text: "Two tickets available, cash or Venmo, urgency — must sell today", time: "14 min ago", confidence: 0.7 },
  { id: "inv-003", verdict: "LIKELY-LEGIT", score: 12, text: "Transferring via Ticketmaster official app, credit card accepted", time: "31 min ago", confidence: 0.85 },
  { id: "inv-004", verdict: "SCAM", score: 88, text: "Below market price, asking crypto payment only, no refunds", time: "1 hr ago", confidence: 0.92 },
  { id: "inv-005", verdict: "SUSPICIOUS", score: 48, text: "Meet in person to exchange physical tickets, Zelle preferred", time: "2 hr ago", confidence: 0.65 },
]

const VERDICT_COLORS: Record<string, string> = {
  SCAM: "var(--tg-risk-high)",
  SUSPICIOUS: "var(--tg-risk-med)",
  "LIKELY-LEGIT": "var(--tg-risk-low)",
}

const VERDICT_ICONS: Record<string, React.ReactNode> = {
  SCAM: <ShieldAlert size={14} />,
  SUSPICIOUS: <AlertTriangle size={14} />,
  "LIKELY-LEGIT": <ShieldCheck size={14} />,
}

export default function AdminPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const mode = getMode()

  useEffect(() => {
    if (!user) { router.push("/"); return }
    if (user.role !== "admin") { router.push("/investigate"); return }
    
    // Fetch users (MongoDB in real mode, local otherwise)
    if (mode === "real") {
      const { token } = getAuth()
      fetch(API.adminUsers(), {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === "ok" && data.users) setUsers(data.users)
        else setUsers(getAllUsers()) // fallback to local on failure
      })
      .catch(() => setUsers(getAllUsers()))
    } else {
      setUsers(getAllUsers())
    }
  }, [user, router, mode])

  useEffect(() => {
    if (mode === "real") {
      getHealth()
        .then(h => { setHealth(h as unknown as Record<string, unknown>); setHealthLoading(false) })
        .catch(() => setHealthLoading(false))
    } else {
      setHealthLoading(false)
      setHealth({ status: "ok", gemini: true, atlas: true, mcp: true, cluster_version: "8.0.24" })
    }
  }, [mode])

  const handleRefresh = async () => {
    setRefreshing(true)
    if (mode === "real") {
      try { const h = await getHealth(); setHealth(h as unknown as Record<string, unknown>) } catch { /* */ }
      try {
        const { token } = getAuth()
        const res = await fetch(API.adminUsers(), { headers: token ? { "Authorization": `Bearer ${token}` } : {} })
        const data = await res.json()
        if (data.status === "ok" && data.users) setUsers(data.users)
      } catch { /* */ }
    } else {
      setUsers(getAllUsers())
    }
    await new Promise(r => setTimeout(r, 600))
    setRefreshing(false)
  }

  if (!user || user.role !== "admin") return null

  const scamCount = MOCK_INVESTIGATIONS.filter(i => i.verdict === "SCAM").length
  const suspCount = MOCK_INVESTIGATIONS.filter(i => i.verdict === "SUSPICIOUS").length
  const legitCount = MOCK_INVESTIGATIONS.filter(i => i.verdict === "LIKELY-LEGIT").length

  const stats: StatCard[] = [
    {
      label: "Total Investigations",
      value: MOCK_INVESTIGATIONS.length,
      icon: <Activity size={18} style={{ color: "var(--tg-accent)" }} />,
      color: "var(--tg-accent)",
      sub: "Last 24 hours",
    },
    {
      label: "SCAM Verdicts",
      value: scamCount,
      icon: <ShieldAlert size={18} style={{ color: "var(--tg-risk-high)" }} />,
      color: "var(--tg-risk-high)",
      sub: `${Math.round((scamCount / MOCK_INVESTIGATIONS.length) * 100)}% of total`,
    },
    {
      label: "Suspicious",
      value: suspCount,
      icon: <AlertTriangle size={18} style={{ color: "var(--tg-risk-med)" }} />,
      color: "var(--tg-risk-med)",
      sub: `${Math.round((suspCount / MOCK_INVESTIGATIONS.length) * 100)}% of total`,
    },
    {
      label: "Likely-Legit",
      value: legitCount,
      icon: <ShieldCheck size={18} style={{ color: "var(--tg-risk-low)" }} />,
      color: "var(--tg-risk-low)",
      sub: `${Math.round((legitCount / MOCK_INVESTIGATIONS.length) * 100)}% of total`,
    },
    {
      label: "Registered Users",
      value: users.length,
      icon: <Users size={18} style={{ color: "#a78bfa" }} />,
      color: "#a78bfa",
      sub: `${users.filter(u => u.role === "admin").length} admins`,
    },
    {
      label: "Avg. Risk Score",
      value: Math.round(MOCK_INVESTIGATIONS.reduce((s, i) => s + i.score, 0) / MOCK_INVESTIGATIONS.length),
      icon: <TrendingUp size={18} style={{ color: "#f59e0b" }} />,
      color: "#f59e0b",
      sub: "Weighted average",
    },
  ]

  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100vh" }}>
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={22} style={{ color: "var(--tg-accent)" }} />
              <h1 className="text-2xl font-bold font-display" style={{ color: "var(--tg-text)" }}>Admin Dashboard</h1>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase"
                style={{ background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)", border: "1px solid var(--tg-accent-border)" }}>
                Admin
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--tg-text-3)" }}>
              Welcome back, {user.name} · TicketGuard Operations Center
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all"
              style={{ background: "var(--tg-surface)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}>
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
            <button onClick={() => { logout(); router.push("/") }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all"
              style={{ background: "var(--tg-risk-high-soft)", color: "var(--tg-risk-high)", border: "1px solid var(--tg-risk-high-border)" }}>
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          variants={staggerContainer(0.06, 0.05)}
          initial="hidden" animate="show"
          className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {stats.map(card => <StatBox key={card.label} card={card} />)}
        </motion.div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Recent Investigations */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--tg-border)" }}>
              <div className="flex items-center gap-2">
                <BarChart3 size={16} style={{ color: "var(--tg-accent)" }} />
                <h2 className="font-semibold" style={{ color: "var(--tg-text)" }}>Recent Investigations</h2>
              </div>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-3)" }}>
                Live
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--tg-border)" }}>
              {MOCK_INVESTIGATIONS.map(inv => {
                const color = VERDICT_COLORS[inv.verdict]
                return (
                  <div key={inv.id} className="px-6 py-4 flex items-start justify-between gap-4"
                    style={{ transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex-shrink-0 p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                        {VERDICT_ICONS[inv.verdict]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium mb-0.5 truncate" style={{ color: "var(--tg-text)" }}>
                          {inv.text.length > 70 ? inv.text.slice(0, 70) + "…" : inv.text}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold uppercase"
                            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                            {inv.verdict}
                          </span>
                          <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>Score: {inv.score}</span>
                          <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>Conf: {Math.round(inv.confidence * 100)}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1 text-xs" style={{ color: "var(--tg-text-3)" }}>
                      <Clock size={11} />
                      {inv.time}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>

          {/* Side panels */}
          <div className="space-y-4">
            {/* System Health */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.2 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "var(--tg-border)" }}>
                <Cpu size={16} style={{ color: "var(--tg-accent)" }} />
                <h2 className="font-semibold text-sm" style={{ color: "var(--tg-text)" }}>System Health</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                {healthLoading ? (
                  <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>Loading…</p>
                ) : health ? (
                  <>
                    {[
                      { key: "gemini", label: "Gemini AI" },
                      { key: "atlas", label: "MongoDB Atlas" },
                      { key: "mcp", label: "MCP Server" },
                    ].map(({ key, label }) => {
                      const ok = health[key] === true
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: ok ? "var(--tg-risk-low)" : "var(--tg-risk-high)" }} />
                            <span className="text-sm" style={{ color: "var(--tg-text-2)" }}>{label}</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: ok ? "var(--tg-risk-low)" : "var(--tg-risk-high)" }}>
                            {ok ? "Online" : "Offline"}
                          </span>
                        </div>
                      )
                    })}
                    {health.cluster_version && (
                      <div className="flex items-center gap-2 pt-1">
                        <Database size={12} style={{ color: "var(--tg-text-3)" }} />
                        <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>
                          MongoDB v{health.cluster_version as string}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>Health unavailable</p>
                )}
              </div>
            </motion.div>

            {/* Users */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.25 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "var(--tg-border)" }}>
                <Users size={16} style={{ color: "#a78bfa" }} />
                <h2 className="font-semibold text-sm" style={{ color: "var(--tg-text)" }}>Registered Users</h2>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--tg-border)" }}>
                {users.map(u => (
                  <div key={u.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: u.role === "admin" ? "var(--tg-accent-tint-2)" : "var(--tg-surface-2)", color: u.role === "admin" ? "var(--tg-accent)" : "var(--tg-text-2)" }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--tg-text)" }}>{u.name}</p>
                        <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>{u.email}</p>
                      </div>
                    </div>
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold uppercase"
                      style={{
                        background: u.role === "admin" ? "var(--tg-accent-tint-2)" : "var(--tg-surface-2)",
                        color: u.role === "admin" ? "var(--tg-accent)" : "var(--tg-text-3)",
                      }}>
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.3 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "var(--tg-border)" }}>
                <CheckCircle2 size={16} style={{ color: "var(--tg-risk-low)" }} />
                <h2 className="font-semibold text-sm" style={{ color: "var(--tg-text)" }}>Quick Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                <a href="/investigate"
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all flex items-center gap-2"
                  style={{ background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)", border: "1px solid var(--tg-accent-border)" }}>
                  <Eye size={14} />
                  Check a listing
                </a>
                <a href="/"
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all flex items-center gap-2"
                  style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}>
                  <Shield size={14} />
                  View homepage
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
