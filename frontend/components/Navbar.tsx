"use client"
import { useRouter, usePathname } from "next/navigation"
import { memo, useEffect, useState } from "react"
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion"
import { Menu, X, ArrowRight, User, LogOut, LayoutDashboard, History } from "lucide-react"
import { usePrefersReducedMotion, EASE_OUT } from "@/lib/motion"
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
      style={{ display: "inline-block", verticalAlign: "-3px", marginRight: "2px" }}>
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
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })

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
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        style={{
          background: solid ? "var(--tg-glass-bg)" : "transparent",
          borderBottom: `1px solid ${solid ? "var(--tg-glass-border)" : "transparent"}`,
        }}
      >
        <div className="flex justify-between items-center px-6 lg:px-16 py-5">
          {/* Logo */}
          <span className="flex items-center gap-2">
            <span
              className="text-xl font-semibold tracking-tight select-none cursor-pointer flex items-center font-display"
              onClick={() => go("/")}
            >
              <ShieldGlyph />
              <span style={{ color: "var(--tg-text)" }}>Ticket</span>
              <span style={{ color: "var(--tg-accent)" }}>Guard</span>
            </span>
            {demoMode && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium select-none"
                style={{ background: "var(--tg-warn-tint)", color: "var(--tg-warn)", border: "1px solid var(--tg-warn-border)" }}
                title="No live backend — synthetic demo data"
              >
                DEMO
              </span>
            )}
          </span>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-8">
            {NAV_LINKS.map(link => {
              const active = isActive(link.href)
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className="group relative text-sm uppercase tracking-widest cursor-pointer transition-colors duration-200"
                  style={{ color: active ? "var(--tg-text)" : "var(--tg-text-3)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = active ? "var(--tg-text)" : "var(--tg-text-3)")}
                >
                  {link.label}
                  {/* animated underline — full when active, grows on hover */}
                  <span
                    className="absolute -bottom-1.5 left-0 h-px transition-all duration-300 group-hover:w-full"
                    style={{ width: active ? "100%" : 0, background: "var(--tg-accent)" }}
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
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                  style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border-strong)", color: "var(--tg-text)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-surface-2)")}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)" }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{user.name.split(" ")[0]}</span>
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: EASE_OUT }}
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50"
                      style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)", boxShadow: "var(--tg-shadow)" }}>
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
                className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-surface-2)")}>
                <User size={14} /> Sign in
              </button>
            )}

            <button
              onClick={() => go("/investigate")}
              className="inline-flex items-center gap-1.5 uppercase text-xs tracking-widest font-medium px-6 py-3 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.97]"
              style={{
                background: "var(--tg-surface-3)",
                color: "var(--tg-text)",
                border: "1px solid var(--tg-border-strong)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-surface-3)")}>
              Check a listing
              <ArrowRight size={13} strokeWidth={2.4} />
            </button>
          </div>


          {/* Mobile cluster: theme toggle + menu toggle */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setOpen(o => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer"
              style={{ background: "var(--tg-hover)", border: "1px solid var(--tg-border-strong)", color: "var(--tg-text)" }}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Scroll progress bar */}
        <motion.div
          aria-hidden
          className="origin-left h-px"
          style={{
            scaleX: reduced ? 0 : progress,
            background: "linear-gradient(90deg, var(--tg-accent), var(--tg-info))",
            opacity: scrolled ? 1 : 0,
          }}
        />
      </nav>

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden fixed top-[68px] left-0 right-0 z-40 px-6"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
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
                {NAV_LINKS.map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="text-sm uppercase tracking-widest py-3 px-2 rounded-lg transition-colors"
                    style={{ color: isActive(link.href) ? "var(--tg-accent)" : "var(--tg-text-2)" }}
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  onClick={() => go("/investigate")}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 uppercase text-xs tracking-widest font-semibold px-6 py-3.5 rounded-xl cursor-pointer active:scale-[0.98] transition-transform"
                  style={{
                    background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))",
                    color: "var(--tg-on-accent)",
                    boxShadow: "0 8px 24px var(--tg-accent-glow)",
                  }}
                >
                  Check a listing
                  <ArrowRight size={14} strokeWidth={2.4} />
                </button>
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
