"use client"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  FileText,
  Bot,
  Database,
  ShieldCheck,
  ArrowRight,
  Code2,
  Plug,
} from "lucide-react"
import { EVAL } from "@/lib/mock"
import {
  usePrefersReducedMotion,
  staggerContainer,
  cardRise,
  fadeUpItem,
  EASE_OUT,
} from "@/lib/motion"

const STEPS = [
  {
    n: "01",
    badge: "GEMINI",
    badgeColor: "hsl(258,80%,78%)",
    badgeBg: "rgba(124,58,237,0.12)",
    badgeBorder: "rgba(124,58,237,0.25)",
    title: "Extract the signals",
    body: "Gemini pulls the price, seller handle, any domain, the payment method and urgency cues out of the raw listing or DM.",
  },
  {
    n: "02",
    badge: "VECTOR",
    badgeColor: "rgb(125,211,252)",
    badgeBg: "rgba(14,165,233,0.1)",
    badgeBorder: "rgba(14,165,233,0.25)",
    title: "Hybrid search the corpus",
    body: "A vector pipeline and a full-text pipeline run over a corpus of known scam patterns, blending semantic and keyword relevance.",
  },
  {
    n: "03",
    badge: "MONGODB",
    badgeColor: "rgb(74,222,128)",
    badgeBg: "rgba(34,197,94,0.12)",
    badgeBorder: "rgba(34,197,94,0.25)",
    title: "Score & verify the verdict",
    body: "An aggregation scores the risk, a rule checks for official digital transfer, and Gemini writes an evidence-backed verdict.",
  },
]

// Pipeline nodes for the animated "How it works" diagram.
const PIPELINE = [
  { label: "Ingest", sub: "listing / DM", Icon: FileText, color: "hsl(258,80%,76%)" },
  { label: "Agents", sub: "Gemini 2.5", Icon: Bot, color: "rgb(125,211,252)" },
  { label: "MongoDB", sub: "Atlas + MCP", Icon: Database, color: "rgb(74,222,128)" },
  { label: "Verdict", sub: "evidence-backed", Icon: ShieldCheck, color: "hsl(160,84%,62%)" },
]

const VIEWPORT = { once: true, amount: 0.3 } as const

// Animated arrow connector between two pipeline nodes.
function FlowArrow({ reduced, vertical = false }: { reduced: boolean; vertical?: boolean }) {
  return (
    <div
      className={`relative flex items-center justify-center ${vertical ? "w-full h-6 md:hidden" : "hidden md:flex flex-1 h-6"}`}
      aria-hidden
    >
      <svg width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none" style={vertical ? { transform: "rotate(90deg)", width: 24, height: 24 } : undefined}>
        <line x1="2" y1="12" x2="92" y2="12" stroke="rgba(16,185,129,0.25)" strokeWidth="1.5" />
        {!reduced && (
          <line
            x1="2" y1="12" x2="92" y2="12"
            stroke="hsl(160,84%,58%)" strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray="10 90"
          >
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.6s" repeatCount="indefinite" />
          </line>
        )}
        <path d="M88 7 L96 12 L88 17" fill="none" stroke="hsl(160,84%,58%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export default function HomeSections() {
  const router = useRouter()
  const reduced = usePrefersReducedMotion()

  return (
    <div style={{ background: "hsl(240,28%,3.5%)" }}>
      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="relative max-w-5xl mx-auto px-6 py-20 scroll-mt-24">
        <motion.p
          className="text-xs uppercase tracking-[0.2em] mb-3"
          style={{ color: "hsl(160,70%,58%)" }}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          How it works
        </motion.p>
        <motion.h2
          className="font-bold text-white mb-8"
          style={{ fontSize: "clamp(1.6rem,3.5vw,2.4rem)", letterSpacing: "-0.02em" }}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.55, ease: EASE_OUT }}
        >
          A five-step agent investigation
        </motion.h2>

        {/* Animated pipeline diagram: Ingest → Agents → MongoDB → Verdict */}
        <motion.div
          className="rounded-2xl p-5 md:p-6 mb-8"
          style={{ background: "hsl(240,15%,7%)", border: "1px solid rgba(255,255,255,0.07)" }}
          variants={staggerContainer(0.12, 0.05)}
          initial={reduced ? false : "hidden"}
          whileInView="show"
          viewport={VIEWPORT}
        >
          <div className="flex flex-col md:flex-row md:items-center">
            {PIPELINE.map((node, i) => {
              const Icon = node.Icon
              return (
                <div key={node.label} className="contents">
                  <motion.div variants={cardRise} className="flex md:flex-col items-center gap-3 md:gap-2 md:flex-shrink-0">
                    <div
                      className="flex items-center justify-center rounded-xl"
                      style={{
                        width: 52,
                        height: 52,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${node.color}55`,
                        boxShadow: `0 0 18px ${node.color}22`,
                      }}
                    >
                      <Icon size={22} style={{ color: node.color }} strokeWidth={2} />
                    </div>
                    <div className="md:text-center">
                      <p className="text-sm font-semibold text-white">{node.label}</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.42)" }}>{node.sub}</p>
                    </div>
                  </motion.div>
                  {i < PIPELINE.length - 1 && (
                    <>
                      <FlowArrow reduced={reduced} />
                      <FlowArrow reduced={reduced} vertical />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-4"
          variants={staggerContainer(0.1)}
          initial={reduced ? false : "hidden"}
          whileInView="show"
          viewport={VIEWPORT}
        >
          {STEPS.map(s => (
            <motion.div
              key={s.n}
              variants={cardRise}
              className="rounded-2xl p-6"
              style={{ background: "hsl(240,15%,8%)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-2xl font-bold font-display" style={{ color: "rgba(255,255,255,0.18)" }}>{s.n}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: s.badgeBg, color: s.badgeColor, border: `1px solid ${s.badgeBorder}` }}
                >
                  {s.badge}
                </span>
              </div>
              <p className="text-white font-semibold mb-2">{s.title}</p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{s.body}</p>
            </motion.div>
          ))}
        </motion.div>
        <div className="mt-8">
          <button
            onClick={() => router.push("/investigate")}
            className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xl font-semibold text-sm text-white cursor-pointer transition-transform duration-200 active:scale-[0.97]"
            style={{ background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))", boxShadow: "0 8px 24px rgba(16,185,129,0.28)" }}
          >
            Try it on a listing
            <ArrowRight size={15} strokeWidth={2.4} />
          </button>
        </div>
      </section>

      {/* ── For portals (embed + MCP) ──────────────────────────────────── */}
      <section id="portals" className="relative max-w-5xl mx-auto px-6 pb-8 scroll-mt-24">
        <motion.div
          className="rounded-2xl p-8"
          style={{ background: "hsl(240,15%,7%)", border: "1px solid rgba(255,255,255,0.07)" }}
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.55, ease: EASE_OUT }}
        >
          <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: "hsl(160,70%,58%)" }}>
            For portals
          </p>
          <h2 className="font-bold text-white mb-3" style={{ fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-0.02em" }}>
            Drop-in protection for any resale marketplace
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)", maxWidth: "640px", lineHeight: 1.6 }}>
            Embed the TicketGuard risk check on a listing page with a single tag,
            or call it programmatically — the same investigation is exposed as an
            MCP tool so agents can verify a listing inline.
          </p>

          <motion.div
            className="grid md:grid-cols-2 gap-4"
            variants={staggerContainer(0.1)}
            initial={reduced ? false : "hidden"}
            whileInView="show"
            viewport={VIEWPORT}
          >
            {/* One-line embed snippet */}
            <motion.div
              variants={fadeUpItem}
              className="rounded-xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-xs font-semibold text-white mb-3 flex items-center gap-1.5">
                <Code2 size={14} style={{ color: "hsl(160,84%,62%)" }} strokeWidth={2.2} />
                One-line embed
              </p>
              <pre
                className="text-xs rounded-lg p-3 overflow-x-auto"
                style={{
                  background: "hsl(240,18%,5%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgb(125,211,252)",
                  fontFamily: "var(--font-display), ui-monospace, monospace",
                }}
              >
                <code>{`<script src="https://cdn.ticketguard.dev/widget.js"></script>`}</code>
              </pre>
              <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
                Renders a risk badge next to any listing and opens the full
                investigation on click.
              </p>
            </motion.div>

            {/* MCP tool */}
            <motion.div
              variants={fadeUpItem}
              className="rounded-xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-xs font-semibold text-white mb-3 flex items-center gap-1.5">
                <Plug size={14} style={{ color: "rgb(74,222,128)" }} strokeWidth={2.2} />
                Exposed as an MCP tool
              </p>
              <pre
                className="text-xs rounded-lg p-3 overflow-x-auto"
                style={{
                  background: "hsl(240,18%,5%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgb(134,239,172)",
                  fontFamily: "var(--font-display), ui-monospace, monospace",
                }}
              >
                <code>{`tool: check_listing(text) → verdict`}</code>
              </pre>
              <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
                Any MCP-capable agent can call <code style={{ color: "rgb(134,239,172)" }}>check_listing</code> to
                score a listing and get the same evidence-backed verdict inline.
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── About the data ─────────────────────────────────────────────── */}
      <section id="data" className="relative max-w-5xl mx-auto px-6 pb-24 pt-12 scroll-mt-24">
        <motion.div
          className="rounded-2xl p-8"
          style={{ background: "hsl(240,15%,7%)", border: "1px solid rgba(255,255,255,0.07)" }}
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.55, ease: EASE_OUT }}
        >
          <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: "hsl(160,70%,58%)" }}>
            About the data
          </p>
          <h2 className="font-bold text-white mb-3" style={{ fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-0.02em" }}>
            Synthetic demo data only
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)", maxWidth: "640px", lineHeight: 1.6 }}>
            Every example, seller handle, domain and risk verdict in this demo is
            synthetic and generated for illustration. TicketGuard surfaces
            risk signals consistent with documented patterns — it is decision-support,
            not a guarantee. Always verify a seller and pay only through official,
            protected channels.
          </p>
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
            variants={staggerContainer(0.08)}
            initial={reduced ? false : "hidden"}
            whileInView="show"
            viewport={VIEWPORT}
          >
            {[
              { v: `${Math.round(EVAL.recall * 100)}%`, l: "seeded-scam recall" },
              { v: EVAL.corpusSize.toLocaleString(), l: "corpus listings" },
              { v: EVAL.patternsTracked, l: "scam patterns tracked" },
              { v: `${(EVAL.medianLatencyMs / 1000).toFixed(1)}s`, l: "median investigation" },
            ].map(m => (
              <motion.div
                key={m.l}
                variants={cardRise}
                className="rounded-xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="font-bold text-white text-xl font-display">{m.v}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{m.l}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
        <p className="text-center text-xs mt-8" style={{ color: "rgba(255,255,255,0.25)" }}>
          TicketGuard · MongoDB Atlas Vector Search · Gemini 2.5 · MongoDB MCP · Change Streams
        </p>
      </section>
    </div>
  )
}
