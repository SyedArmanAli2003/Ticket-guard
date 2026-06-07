"use client"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Shield, Eye, EyeOff, X, Loader2 } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { EASE_OUT, SPRING_SOFT, usePrefersReducedMotion } from "@/lib/motion"

interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: "login" | "register"
}

export default function AuthModal({ open, onClose, defaultTab = "login" }: AuthModalProps) {
  const { login, register } = useAuth()
  const reduced = usePrefersReducedMotion()
  const [tab, setTab] = useState<"login" | "register">(defaultTab)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Portal to <body> so the fixed overlay is ALWAYS viewport-centered, never
  // trapped by a transformed ancestor (which made it appear far down the page).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(2, 4, 10, 0.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={reduced ? { opacity: 1 } : { opacity: 1, scale: 0.97, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
            transition={reduced ? { duration: 0.18 } : { duration: 0.32, ease: EASE_OUT }}
            className="w-full max-w-md rounded-2xl p-8 relative"
            style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)", boxShadow: "var(--tg-shadow-lg), 0 0 80px rgba(0,0,0,0.45)" }}
          >
            {/* Close */}
            <motion.button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 rounded-lg cursor-pointer transition-colors"
              style={{ color: "var(--tg-text-3)" }}
              whileHover={reduced ? undefined : { rotate: 90, color: "var(--tg-text)" }}
              whileTap={reduced ? undefined : { scale: 0.88 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <X size={18} />
            </motion.button>

            {/* Logo */}
            <div className="flex items-center gap-2 mb-6">
              <Shield size={22} style={{ color: "var(--tg-accent)" }} />
              <span className="font-bold font-display text-lg" style={{ color: "var(--tg-text)" }}>TicketGuard</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "var(--tg-surface-2)" }}>
              {(["login", "register"] as const).map(t => {
                const active = tab === t
                return (
                  <button key={t} onClick={() => switchTab(t)}
                    className="relative flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ color: active ? "var(--tg-text)" : "var(--tg-text-3)", transition: "color 0.25s ease" }}>
                    {active && (
                      <motion.span
                        layoutId={reduced ? undefined : "auth-tab-pill"}
                        className="absolute inset-0 rounded-lg"
                        style={{ background: "var(--tg-surface)", boxShadow: "var(--tg-shadow)", border: "1px solid var(--tg-border)" }}
                        transition={reduced ? { duration: 0 } : SPRING_SOFT}
                      />
                    )}
                    <span className="relative z-10">{t === "login" ? "Sign in" : "Create account"}</span>
                  </button>
                )
              })}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <AnimatePresence initial={false} mode="popLayout">
                {tab === "register" && (
                  <motion.div
                    key="name-field"
                    layout={!reduced}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT }}
                    style={{ overflow: "hidden" }}
                  >
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--tg-text-2)" }}>Full name</label>
                    <input
                      value={name} onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                      style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)", transition: "border-color 0.2s ease, box-shadow 0.2s ease" }}
                      onFocus={e => { e.target.style.borderColor = "var(--tg-accent)"; e.target.style.boxShadow = "0 0 0 3px var(--tg-accent-tint-2)" }}
                      onBlur={e => { e.target.style.borderColor = "var(--tg-border-strong)"; e.target.style.boxShadow = "none" }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--tg-text-2)" }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)", transition: "border-color 0.2s ease, box-shadow 0.2s ease" }}
                  onFocus={e => { e.target.style.borderColor = "var(--tg-accent)"; e.target.style.boxShadow = "0 0 0 3px var(--tg-accent-tint-2)" }}
                  onBlur={e => { e.target.style.borderColor = "var(--tg-border-strong)"; e.target.style.boxShadow = "none" }}
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
                    style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)", transition: "border-color 0.2s ease, box-shadow 0.2s ease" }}
                    onFocus={e => { e.target.style.borderColor = "var(--tg-accent)"; e.target.style.boxShadow = "0 0 0 3px var(--tg-accent-tint-2)" }}
                    onBlur={e => { e.target.style.borderColor = "var(--tg-border-strong)"; e.target.style.boxShadow = "none" }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer p-0.5 rounded-md transition-colors"
                    style={{ color: "var(--tg-text-3)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-text-2)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--tg-text-3)")}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {tab === "login" && (
                <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>
                  Demo accounts: <code style={{ color: "var(--tg-accent)" }}>admin@ticketguard.ai / admin123</code> (admin) or <code style={{ color: "var(--tg-accent)" }}>demo@ticketguard.ai / demo123</code>
                </p>
              )}

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, height: 0 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                    className="text-xs px-3 py-2 rounded-lg overflow-hidden"
                    style={{ background: "var(--tg-risk-high-soft)", color: "var(--tg-risk-high)", border: "1px solid var(--tg-risk-high-border)" }}>
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button type="submit" disabled={loading}
                whileHover={reduced || loading ? undefined : { y: -1, boxShadow: "0 10px 28px var(--tg-accent-glow)" }}
                whileTap={reduced || loading ? undefined : { scale: 0.98 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="w-full py-3 rounded-xl font-semibold text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)", boxShadow: "0 6px 20px var(--tg-accent-glow)" }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? "Please wait…" : tab === "login" ? "Sign in" : "Create account"}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
