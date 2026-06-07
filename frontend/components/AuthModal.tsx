"use client"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Shield, Eye, EyeOff, X, Loader2 } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { EASE_OUT } from "@/lib/motion"

interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: "login" | "register"
}

export default function AuthModal({ open, onClose, defaultTab = "login" }: AuthModalProps) {
  const { login, register } = useAuth()
  const [tab, setTab] = useState<"login" | "register">(defaultTab)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reset = () => { setName(""); setEmail(""); setPassword(""); setError(null); setShowPw(false) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    await new Promise(r => setTimeout(r, 300)) // micro-delay for UX
    if (tab === "login") {
      const result = await login(email, password)
      if (result.ok) { reset(); onClose() }
      else setError(result.error || "Login failed.")
    } else {
      const result = await register(name, email, password)
      if (result.ok) { reset(); onClose() }
      else setError(result.error || "Registration failed.")
    }
    setLoading(false)
  }

  const switchTab = (t: "login" | "register") => { setTab(t); setError(null) }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="w-full max-w-md rounded-2xl p-8 relative"
            style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)", boxShadow: "var(--tg-shadow), 0 0 60px rgba(0,0,0,0.5)" }}
          >
            {/* Close */}
            <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg cursor-pointer transition-colors"
              style={{ color: "var(--tg-text-3)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <X size={18} />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2 mb-6">
              <Shield size={22} style={{ color: "var(--tg-accent)" }} />
              <span className="font-bold font-display text-lg" style={{ color: "var(--tg-text)" }}>TicketGuard</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "var(--tg-surface-2)" }}>
              {(["login", "register"] as const).map(t => (
                <button key={t} onClick={() => switchTab(t)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all"
                  style={{
                    background: tab === t ? "var(--tg-surface)" : "transparent",
                    color: tab === t ? "var(--tg-text)" : "var(--tg-text-3)",
                    boxShadow: tab === t ? "var(--tg-shadow)" : "none",
                  }}>
                  {t === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {tab === "register" && (
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--tg-text-2)" }}>Full name</label>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)" }}
                    onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
                    onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--tg-text-2)" }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)" }}
                  onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--tg-text-2)" }}>Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={tab === "register" ? "At least 6 characters" : "Your password"}
                    required
                    className="w-full px-4 py-3 pr-10 rounded-xl text-sm outline-none"
                    style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)" }}
                    onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
                    onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: "var(--tg-text-3)" }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {tab === "login" && (
                <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>
                  Demo accounts: <code style={{ color: "var(--tg-accent)" }}>admin@ticketguard.ai / admin123</code> (admin) or <code style={{ color: "var(--tg-accent)" }}>demo@ticketguard.ai / demo123</code>
                </p>
              )}

              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: "var(--tg-risk-high-soft)", color: "var(--tg-risk-high)", border: "1px solid var(--tg-risk-high-border)" }}>
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)", boxShadow: "0 6px 20px var(--tg-accent-glow)" }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? "Please wait…" : tab === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
