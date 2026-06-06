"use client"
import Link from "next/link"
import { Shield, GitBranch, XIcon, ExternalLink } from "lucide-react"

const LINKS = {
  product: [
    { label: "Check a Listing", href: "/investigate" },
    { label: "How It Works", href: "/#how" },
    { label: "The Data", href: "/#data" },
    { label: "My History", href: "/history" },
  ],
  resources: [
    { label: "StubHub (Safe Resale)", href: "https://www.stubhub.com", external: true },
    { label: "SeatGeek (Safe Resale)", href: "https://www.seatgeek.com", external: true },
    { label: "Ticketmaster", href: "https://www.ticketmaster.com", external: true },
    { label: "Report Scam (FTC)", href: "https://reportfraud.ftc.gov", external: true },
  ],
  tech: [
    { label: "MongoDB Atlas", href: "https://www.mongodb.com/atlas", external: true },
    { label: "Google Gemini", href: "https://ai.google.dev", external: true },
    { label: "FastAPI", href: "https://fastapi.tiangolo.com", external: true },
    { label: "Next.js", href: "https://nextjs.org", external: true },
  ],
}

const STATS = [
  { value: "137+", label: "Scam patterns seeded" },
  { value: "768", label: "Vector dimensions" },
  { value: "94%", label: "Detection rate" },
  { value: "<3s", label: "Avg. verdict time" },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{ background: "var(--tg-surface)", borderTop: "1px solid var(--tg-border-strong)" }}>
      {/* Stats strip */}
      <div className="border-b" style={{ borderColor: "var(--tg-border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold font-display mb-0.5" style={{ color: "var(--tg-accent)" }}>{s.value}</p>
              <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-10">
          {/* Brand col */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4 w-fit">
              <Shield size={20} style={{ color: "var(--tg-accent)" }} />
              <span className="font-bold font-display text-lg" style={{ color: "var(--tg-text)" }}>
                Ticket<span style={{ color: "var(--tg-accent)" }}>Guard</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--tg-text-2)", maxWidth: 260 }}>
              AI-powered ticket-resale scam detection. Evidence-backed verdicts in seconds — grounded in MongoDB Atlas Vector Search and the Gemini AI agent.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)", border: "1px solid var(--tg-accent-border)" }}>
                Built for MongoDB Hackathon 2026
              </span>
            </div>
            {/* Social */}
            <div className="flex items-center gap-3 mt-5">
              <a href="https://github.com/SyedArmanAli2003/Ticket-guard" target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: "var(--tg-text-3)", border: "1px solid var(--tg-border-strong)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tg-text)"; (e.currentTarget as HTMLElement).style.background = "var(--tg-hover)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tg-text-3)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                <GitBranch size={16} />
              </a>
              <a href="https://x.com" target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: "var(--tg-text-3)", border: "1px solid var(--tg-border-strong)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tg-text)"; (e.currentTarget as HTMLElement).style.background = "var(--tg-hover)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tg-text-3)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                <XIcon size={16} />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {([
            { title: "Product", links: LINKS.product },
            { title: "Safe Resale", links: LINKS.resources },
            { title: "Built With", links: LINKS.tech },
          ]).map(col => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--tg-text-3)" }}>
                {col.title}
              </p>
              <ul className="space-y-3">
                {col.links.map(l => (
                  <li key={l.label}>
                    {"external" in l && l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer"
                        className="text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                        style={{ color: "var(--tg-text-2)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-text)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--tg-text-2)")}>
                        {l.label}
                        <ExternalLink size={11} style={{ color: "var(--tg-text-3)" }} />
                      </a>
                    ) : (
                      <Link href={l.href}
                        className="text-sm transition-colors cursor-pointer"
                        style={{ color: "var(--tg-text-2)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "var(--tg-text)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--tg-text-2)")}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t" style={{ borderColor: "var(--tg-border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-4">
          <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>
            © {year} TicketGuard. Decision-support only — not a guarantee. Always verify independently.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>Powered by</span>
            <span className="text-xs font-medium" style={{ color: "var(--tg-green)" }}>MongoDB Atlas</span>
            <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>·</span>
            <span className="text-xs font-medium" style={{ color: "var(--tg-info)" }}>Google Gemini 2.5 Flash</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
