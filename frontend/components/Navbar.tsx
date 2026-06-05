"use client"
import { useRouter } from "next/navigation"
import { memo } from "react"

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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 lg:px-16 py-5">
      {/* Logo */}
      <span
        className="text-xl font-semibold tracking-tight select-none cursor-pointer flex items-center"
        onClick={() => router.push("/")}
      >
        <ShieldGlyph />
        <span style={{ color: "rgba(255,255,255,0.92)" }}>Ticket</span>
        <span style={{ color: "hsl(160,84%,52%)" }}>Guard</span>
      </span>

      {/* Nav links */}
      <div className="hidden md:flex gap-8">
        {NAV_LINKS.map(link => (
          <a
            key={link.label}
            href={link.href}
            className="text-sm uppercase tracking-widest cursor-pointer transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.45)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/investigate")}
        className="hidden md:inline-flex uppercase text-xs tracking-widest font-medium px-6 py-3 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.97]"
        style={{
          background: "hsl(240,12%,14%)",
          color: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "hsl(240,12%,18%)")}
        onMouseLeave={e => (e.currentTarget.style.background = "hsl(240,12%,14%)")}
      >
        Check a listing
      </button>
    </nav>
  )
}

export default memo(Navbar)
