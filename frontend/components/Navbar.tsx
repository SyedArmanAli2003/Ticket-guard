"use client"
import { useRouter, usePathname } from "next/navigation"
import { memo, useEffect, useState } from "react"
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion"
import { Menu, X, ArrowRight, User, LogOut, LayoutDashboard, History } from "lucide-react"
import { usePrefersReducedMotion, EASE_OUT, SPRING_SOFT } from "@/lib/motion"
import { getMode } from "@/lib/config"
import ThemeToggle from "@/components/ThemeToggle"
import { useAuth } from "@/components/AuthProvider"
import AuthModal from "@/components/AuthModal"

const NAV_LINKS = [
  { label: "How It Works", href: "/#how" },
  { label: "Live Feed", href: "/investigate#feed" },
  { label: "The Data", href: "/#data" },
]

function ShieldGlyph() {
  // Original mini shield mark (no trademarked art).
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
      style={{ display: "block", marginRight: "1px" }}>
      <path d="M12 2.5 4 5.2v6.1c0 4.6 3.2 8.2 8 10.2 4.8-2 8-5.6 8-10.2V5.2L12 2.5Z"
        fill="url(#tgNav)" stroke="var(--tg-accent)" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="m8.6 12.1 2.3 2.3 4.4-4.6" stroke="var(--tg-accent-contrast)" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="tgNav" x1="4" y1="2.5" x2="20" y2="21.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--tg-accent)" />
          <stop offset="1" stopColor="var(--tg-accent-2)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const reduced = usePrefersReducedMotion()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const demoMode = getMode() === "mock"
  const { user, logout } = useAuth()

  // Top scroll-progress bar (premium chrome; static under reduced motion).
  // Slightly softer spring so the fill trails the scroll with a liquid feel.
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.35 })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setOpen(false) }, [pathname])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  // A link is "active" when its target route matches the current pathname.
  const isActive = (href: string) => {
    const path = href.split("#")[0] || "/"
    return path === pathname
  }

  // Solid chrome appears as soon as the page is scrolled OR the mobile menu is
  // open, so page content never bleeds through the bar.
  const solid = scrolled || open

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        initial={reduced ? false : { y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        style={{
          background: solid ? "var(--tg-glass-bg)" : "transparent",
          borderBottom: `1px solid ${solid ? "var(--tg-glass-border)" : "transparent"}`,
          backdropFilter: solid ? "blur(14px) saturate(140%)" : "none",
          WebkitBackdropFilter: solid ? "blur(14px) saturate(140%)" : "none",
        }}
      >
        <div className="flex justify-between items-center px-6 lg:px-16 py-5">
          {/* Logo */}
          <span className="flex items-center gap-2.5">
            <motion.button
              type="button"
              aria-label="TicketGuard home"
              onClick={() => go("/")}
              className="text-xl font-semibold tracking-tight select-none cursor-pointer flex items-center gap-1.5 font-display"
              whileHover={reduced ? undefined : { y: -1 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              transition={SPRING_SOFT}
            >
              <ShieldGlyph />
              <span className="flex items-baseline">
                <span style={{ color: "var(--tg-text)" }}>Ticket</span>
                <span style={{ color: "var(--tg-accent)" }}>Guard</span>
              </span>
            </motion.button>
            {demoMode && (
              <span
                className="text-[0.65rem] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full font-semibold select-none"
                style={{ background: "var(--tg-warn-tint)", color: "var(--tg-warn)", border: "1px solid var(--tg-warn-border)" }}
                title="No live backend — synthetic demo data"
              >
                Demo
              </span>
            )}
          </span>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-9">
            {NAV_LINKS.map(link => {
              const active = isActive(link.href)
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className="group relative text-[0.8rem] uppercase tracking-[0.16em] cursor-pointer py-0.5"
                  style={{ color: active ? "var(--tg-text)" : "var(--tg-text-3)", transition: "color 0.25s cubic-bezier(0.16,1,0.3,1)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = active ? "var(--tg-text)" : "var(--tg-text-3)")}
                >
                  {link.label}
                  {/* animated underline — full when active, wipes in from the left on hover */}
                  <span
                    className="absolute -bottom-1 left-0 h-[1.5px] rounded-full group-hover:w-full"
                    style={{
                      width: active ? "100%" : 0,
                      background: "var(--tg-accent)",
                      boxShadow: active ? "0 0 6px var(--tg-accent-glow)" : "none",
                      transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </a>
              )
            })}
          </div>

          {/* Desktop right cluster: theme toggle + auth + CTA */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-[background,border-color] duration-200 active:scale-[0.97]"
                  style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border-strong)", color: "var(--tg-text)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--tg-hover)"; e.currentTarget.style.borderColor = "var(--tg-accent-border)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--tg-surface-2)"; e.currentTarget.style.borderColor = "var(--tg-border-strong)" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)" }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{user.name.split(" ")[0]}</span>
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50"
                      style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)", boxShadow: "var(--tg-shadow-lg)" }}>
                      {user.role === "admin" && (
                        <button onClick={() => { setUserMenuOpen(false); go("/admin") }}
                          className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ color: "var(--tg-accent)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <LayoutDashboard size={14} /> Admin Dashboard
                        </button>
                      )}
                      <button onClick={() => { setUserMenuOpen(false); go("/history") }}
                        className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors cursor-pointer"
                        style={{ color: "var(--tg-text-2)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <History size={14} /> My History
                      </button>
                      <div style={{ borderTop: "1px solid var(--tg-border)" }} />
                      <button onClick={() => { setUserMenuOpen(false); logout() }}
                        className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors cursor-pointer"
                        style={{ color: "var(--tg-risk-high)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-risk-high-soft)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <LogOut size={14} /> Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={() => setAuthOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-[background,color] duration-200 active:scale-[0.97]"
                style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--tg-hover)"; e.currentTarget.style.color = "var(--tg-text)" }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--tg-surface-2)"; e.currentTarget.style.color = "var(--tg-text-2)" }}>
                <User size={14} /> Sign in
              </button>
            )}

            <button
              onClick={() => go("/investigate")}
              className="group inline-flex items-center gap-1.5 uppercase text-xs tracking-[0.14em] font-medium px-6 py-3 rounded-lg cursor-pointer transition-[background,border-color,transform] duration-200 ease-out active:scale-[0.97]"
              style={{
                background: "var(--tg-surface-3)",
                color: "var(--tg-text)",
                border: "1px solid var(--tg-border-strong)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--tg-hover)"; e.currentTarget.style.borderColor = "var(--tg-accent-border)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--tg-surface-3)"; e.currentTarget.style.borderColor = "var(--tg-border-strong)" }}>
              Check a listing
              <ArrowRight size={13} strokeWidth={2.4} className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </button>
          </div>


          {/* Mobile cluster: theme toggle + menu toggle */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <motion.button
              onClick={() => setOpen(o => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              whileTap={reduced ? undefined : { scale: 0.92 }}
              className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer overflow-hidden"
              style={{ background: "var(--tg-hover)", border: "1px solid var(--tg-border-strong)", color: "var(--tg-text)" }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={open ? "close" : "open"}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="inline-flex"
                >
                  {open ? <X size={18} /> : <Menu size={18} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* Scroll progress bar */}
        <motion.div
          aria-hidden
          className="origin-left h-px transition-opacity duration-300"
          style={{
            scaleX: reduced ? 0 : progress,
            background: "linear-gradient(90deg, var(--tg-accent), var(--tg-info))",
            boxShadow: scrolled ? "0 0 8px var(--tg-accent-glow)" : "none",
            opacity: scrolled ? 1 : 0,
          }}
        />
      </motion.nav>

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden fixed top-[68px] left-0 right-0 z-40 px-6"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            style={{ transformOrigin: "top center" }}
          >
            <div
              className="rounded-2xl p-4"
              style={{
                background: "var(--tg-glass-bg-solid)",
                border: "1px solid var(--tg-glass-border)",
                boxShadow: "var(--tg-shadow-lg)",
              }}
            >
              <div className="flex flex-col">
                {NAV_LINKS.map((link, i) => {
                  const active = isActive(link.href)
                  return (
                    <motion.a
                      key={link.label}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      initial={reduced ? false : { opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduced ? 0 : 0.06 + i * 0.05, duration: 0.3, ease: EASE_OUT }}
                      className="group relative text-sm uppercase tracking-[0.14em] py-3 pl-3 pr-2 rounded-lg transition-colors"
                      style={{ color: active ? "var(--tg-accent)" : "var(--tg-text-2)" }}
                    >
                      {/* active rail */}
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full"
                        style={{ height: active ? "60%" : 0, background: "var(--tg-accent)", transition: "height 0.3s cubic-bezier(0.16,1,0.3,1)" }}
                      />
                      {link.label}
                    </motion.a>
                  )
                })}
                <motion.button
                  onClick={() => go("/investigate")}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduced ? 0 : 0.06 + NAV_LINKS.length * 0.05, duration: 0.3, ease: EASE_OUT }}
                  whileTap={reduced ? undefined : { scale: 0.98 }}
                  className="group mt-3 inline-flex items-center justify-center gap-1.5 uppercase text-xs tracking-[0.14em] font-semibold px-6 py-3.5 rounded-xl cursor-pointer"
                  style={{
                    background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))",
                    color: "var(--tg-on-accent)",
                    boxShadow: "0 8px 24px var(--tg-accent-glow)",
                  }}
                >
                  Check a listing
                  <ArrowRight size={14} strokeWidth={2.4} className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth modal */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  )
}

export default memo(Navbar)
