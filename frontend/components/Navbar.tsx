"use client"
import { useRouter, usePathname } from "next/navigation"
import { memo, useEffect, useState } from "react"
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion"
import { Menu, X, ArrowRight } from "lucide-react"
import { usePrefersReducedMotion, EASE_OUT } from "@/lib/motion"
import { getMode } from "@/lib/config"

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
        fill="url(#tgNav)" stroke="hsl(160,84%,55%)" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="m8.6 12.1 2.3 2.3 4.4-4.6" stroke="#04110d" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="tgNav" x1="4" y1="2.5" x2="20" y2="21.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(160,84%,52%)" />
          <stop offset="1" stopColor="hsl(170,80%,38%)" />
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
  const demoMode = getMode() === "mock"

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

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        style={{
          background: scrolled || open ? "hsla(240,28%,4%,0.72)" : "transparent",
          backdropFilter: scrolled || open ? "blur(12px)" : "none",
          borderBottom: `1px solid ${scrolled || open ? "rgba(255,255,255,0.07)" : "transparent"}`,
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
              <span style={{ color: "rgba(255,255,255,0.92)" }}>Ticket</span>
              <span style={{ color: "hsl(160,84%,52%)" }}>Guard</span>
            </span>
            {demoMode && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium select-none"
                style={{ background: "rgba(234,179,8,0.12)", color: "rgb(250,204,21)", border: "1px solid rgba(234,179,8,0.3)" }}
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
                  style={{ color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
                  onMouseLeave={e => (e.currentTarget.style.color = active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)")}
                >
                  {link.label}
                  {/* animated underline — full when active, grows on hover */}
                  <span
                    className="absolute -bottom-1.5 left-0 h-px transition-all duration-300 group-hover:w-full"
                    style={{ width: active ? "100%" : 0, background: "hsl(160,84%,52%)" }}
                  />
                </a>
              )
            })}
          </div>

          {/* Desktop CTA */}
          <button
            onClick={() => go("/investigate")}
            className="hidden md:inline-flex items-center gap-1.5 uppercase text-xs tracking-widest font-medium px-6 py-3 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.97]"
            style={{
              background: "hsl(240,12%,14%)",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "hsl(240,12%,18%)")}
            onMouseLeave={e => (e.currentTarget.style.background = "hsl(240,12%,14%)")}
          >
            Check a listing
            <ArrowRight size={13} strokeWidth={2.4} />
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)" }}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Scroll progress bar */}
        <motion.div
          aria-hidden
          className="origin-left h-px"
          style={{
            scaleX: reduced ? 0 : progress,
            background: "linear-gradient(90deg, hsl(160,84%,52%), hsl(190,80%,52%))",
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
                background: "hsla(240,20%,6%,0.96)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              }}
            >
              <div className="flex flex-col">
                {NAV_LINKS.map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="text-sm uppercase tracking-widest py-3 px-2 rounded-lg transition-colors"
                    style={{ color: isActive(link.href) ? "hsl(160,84%,62%)" : "rgba(255,255,255,0.65)" }}
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  onClick={() => go("/investigate")}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 uppercase text-xs tracking-widest font-semibold px-6 py-3.5 rounded-xl cursor-pointer active:scale-[0.98] transition-transform"
                  style={{
                    background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))",
                    color: "white",
                    boxShadow: "0 8px 24px rgba(16,185,129,0.28)",
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
    </>
  )
}

export default memo(Navbar)
