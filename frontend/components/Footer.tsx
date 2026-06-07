"use client"
import Link from "next/link"
import { motion } from "framer-motion"
import { Shield, GitBranch, XIcon, ExternalLink } from "lucide-react"
import {
  usePrefersReducedMotion,
  staggerContainer,
  cardRise,
  fadeUpItem,
  SPRING_SOFT,
} from "@/lib/motion"

const VIEWPORT = { once: true, amount: 0.2 } as const

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
  const reduced = usePrefersReducedMotion()

  return (
    <footer style={{ background: "var(--tg-surface)", borderTop: "1px solid var(--tg-border-strong)" }}>
      {/* Stats strip */}
      <div className="border-b" style={{ borderColor: "var(--tg-border)" }}>
        <motion.div
          className="max-w-6xl mx-auto px-6 py-7 grid grid-cols-2 md:grid-cols-4 gap-6"
          variants={staggerContainer(0.08)}
          initial={reduced ? false : "hidden"}
          whileInView="show"
          viewport={VIEWPORT}
        >
          {STATS.map(s => (
            <motion.div
              key={s.label}
              variants={cardRise}
              whileHover={reduced ? undefined : { y: -2, transition: SPRING_SOFT }}
              className="text-center"
            >
              <p className="text-2xl font-bold font-display tabular-nums mb-0.5" style={{ color: "var(--tg-accent)" }}>{s.value}</p>
              <p className="text-xs" style={{ color: "var(--tg-text-3)", lineHeight: 1.4 }}>{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Main footer content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <motion.div
          className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-10"
          variants={staggerContainer(0.1)}
          initial={reduced ? false : "hidden"}
          whileInView="show"
          viewport={VIEWPORT}
        >
          {/* Brand col */}
          <motion.div variants={fadeUpItem}>
            <Link href="/" className="group flex items-center gap-2 mb-4 w-fit">
              <motion.span
                className="inline-flex"
                whileHover={reduced ? undefined : { rotate: -6, scale: 1.08, transition: SPRING_SOFT }}
              >
                <Shield size={20} style={{ color: "var(--tg-accent)" }} />
              </motion.span>
              <span className="font-bold font-display text-lg" style={{ color: "var(--tg-text)", letterSpacing: "-0.01em" }}>
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
              <motion.a href="https://github.com/SyedArmanAli2003/Ticket-guard" target="_blank" rel="noopener noreferrer"
                aria-label="GitHub repository"
                className="p-2 rounded-lg cursor-pointer transition-colors duration-200 text-[color:var(--tg-text-3)] hover:text-[color:var(--tg-text)] hover:bg-[color:var(--tg-hover)]"
                style={{ border: "1px solid var(--tg-border-strong)" }}
                whileHover={reduced ? undefined : { y: -2, transition: SPRING_SOFT }}
                whileTap={reduced ? undefined : { scale: 0.92 }}>
                <GitBranch size={16} />
              </motion.a>
              <motion.a href="https://x.com" target="_blank" rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="p-2 rounded-lg cursor-pointer transition-colors duration-200 text-[color:var(--tg-text-3)] hover:text-[color:var(--tg-text)] hover:bg-[color:var(--tg-hover)]"
                style={{ border: "1px solid var(--tg-border-strong)" }}
                whileHover={reduced ? undefined : { y: -2, transition: SPRING_SOFT }}
                whileTap={reduced ? undefined : { scale: 0.92 }}>
                <XIcon size={16} />
              </motion.a>
            </div>
          </motion.div>

          {/* Link columns */}
          {([
            { title: "Product", links: LINKS.product },
            { title: "Safe Resale", links: LINKS.resources },
            { title: "Built With", links: LINKS.tech },
          ]).map(col => (
            <motion.div key={col.title} variants={fadeUpItem}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: "var(--tg-text-3)" }}>
                {col.title}
              </p>
              <ul className="space-y-3">
                {col.links.map(l => (
                  <li key={l.label}>
                    {"external" in l && l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer"
                        className="group inline-flex items-center gap-1.5 text-sm cursor-pointer transition-colors duration-200 text-[color:var(--tg-text-2)] hover:text-[color:var(--tg-text)]">
                        <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">{l.label}</span>
                        <ExternalLink size={11} className="opacity-60 transition-opacity duration-200 group-hover:opacity-100" style={{ color: "var(--tg-text-3)" }} />
                      </a>
                    ) : (
                      <Link href={l.href}
                        className="group inline-flex items-center text-sm cursor-pointer transition-colors duration-200 text-[color:var(--tg-text-2)] hover:text-[color:var(--tg-text)]">
                        <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">{l.label}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div className="border-t" style={{ borderColor: "var(--tg-border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-4">
          <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>
            © {year} TicketGuard. Decision-support only — not a guarantee. Always verify independently.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>Powered by</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--tg-green)" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--tg-green)" }} />
              MongoDB Atlas
            </span>
            <span className="text-xs" style={{ color: "var(--tg-text-faint)" }}>·</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--tg-info)" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--tg-info)" }} />
              Google Gemini 2.5 Flash
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
