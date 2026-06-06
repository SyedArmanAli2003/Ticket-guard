"use client"
// Sun/Moon theme toggle. Cycles light ⇄ dark (resolving "system" to whatever is
// currently shown). Mount-guarded so SSR markup matches the client and there is
// no hydration mismatch. Motion gated by prefers-reduced-motion.
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import { Sun, Moon } from "lucide-react"
import { usePrefersReducedMotion, EASE_OUT } from "@/lib/motion"

export default function ThemeToggle() {
  const reduced = usePrefersReducedMotion()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"
  const toggle = () => setTheme(isDark ? "light" : "dark")

  return (
    <button
      onClick={toggle}
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : "Toggle theme"}
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer transition-colors duration-200 overflow-hidden"
      style={{ background: "var(--tg-hover)", border: "1px solid var(--tg-border-strong)", color: "var(--tg-text-2)" }}
      onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-accent)")}
      onMouseLeave={e => (e.currentTarget.style.color = "var(--tg-text-2)")}
    >
      {/* Before mount we don't know the theme — render a neutral placeholder so
          the server and first client paint agree (no flash, no mismatch). */}
      {!mounted ? (
        <span className="inline-block w-[18px] h-[18px]" aria-hidden />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={reduced ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="inline-flex"
          >
            {isDark ? <Moon size={18} strokeWidth={2.2} /> : <Sun size={18} strokeWidth={2.2} />}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  )
}
