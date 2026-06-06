"use client"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react"
import PremiumBackground from "@/components/PremiumBackground"
import ShieldMark from "@/components/ShieldMark"
import MagneticButton from "@/components/MagneticButton"
import { EVAL } from "@/lib/mock"
import {
  usePrefersReducedMotion,
  staggerContainer,
  fadeUpItem,
  wordReveal,
  EASE_OUT,
} from "@/lib/motion"

const TRUST_CHIPS = [
  "MongoDB Atlas Vector Search",
  "Gemini 2.5",
  "MongoDB MCP",
  "Change Streams",
]

// Split into two clauses so the gradient phrase reveals as its own group.
const LEAD_WORDS = ["Spot", "ticket-resale"]
const ACCENT_WORDS = ["scams", "before", "you", "pay."]

export default function HeroSection() {
  const router = useRouter()
  const reduced = usePrefersReducedMotion()
  const recallPct = Math.round(EVAL.recall * 100)

  // When reduced, jump straight to the resting state (no transforms run).
  const animateState = reduced ? "show" : "show"
  const initialState = reduced ? "show" : "hidden"

  return (
    <section
      className="relative flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ minHeight: "100dvh", paddingTop: "7rem", paddingBottom: "3rem", backgroundColor: "var(--tg-bg)" }}
    >
      <PremiumBackground teal glow />

      <motion.div
        className="relative z-10 w-full max-w-3xl text-center"
        variants={staggerContainer(0.09, 0.05)}
        initial={initialState}
        animate={animateState}
      >
        {/* Mark */}
        <motion.div variants={fadeUpItem} className="mb-6">
          <ShieldMark />
        </motion.div>

        {/* Badge */}
        <motion.div
          variants={fadeUpItem}
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-xs font-medium select-none"
          style={{
            background: "var(--tg-accent-tint)",
            border: "1px solid var(--tg-accent-border)",
            color: "var(--tg-accent-soft-text)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span className="live-dot inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--tg-accent-bright)" }} />
          AI scam-investigation agent · grounded in MongoDB Atlas
        </motion.div>

        {/* Headline — per-word stagger reveal */}
        <h1
          className="font-display font-bold tracking-[-0.035em] mb-5"
          style={{ fontSize: "clamp(2.1rem,5vw,3.6rem)", lineHeight: 1.06 }}
        >
          <motion.span variants={staggerContainer(0.07, 0.18)} style={{ display: "inline" }}>
            {LEAD_WORDS.map((w, i) => (
              <span key={`l-${i}`} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top" }}>
                <motion.span
                  variants={wordReveal}
                  style={{ display: "inline-block", color: "var(--tg-text-2)", fontWeight: 300 }}
                >
                  {w}
                </motion.span>
                <span>&nbsp;</span>
              </span>
            ))}
            {ACCENT_WORDS.map((w, i) => (
              <span key={`a-${i}`} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top" }}>
                <motion.span
                  variants={wordReveal}
                  style={{
                    display: "inline-block",
                    background: "var(--tg-hero-gradient)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    textShadow: "0 0 60px var(--tg-accent-glow)",
                  }}
                >
                  {w}
                </motion.span>
                {i < ACCENT_WORDS.length - 1 && <span>&nbsp;</span>}
              </span>
            ))}
          </motion.span>
        </h1>

        {/* Subline */}
        <motion.p
          variants={fadeUpItem}
          className="mx-auto mb-8 font-light"
          style={{
            maxWidth: "640px",
            fontSize: "clamp(0.9rem,1.4vw,1.1rem)",
            color: "var(--tg-text-2)",
            lineHeight: 1.6,
          }}
        >
          Paste a suspicious resale listing or seller DM. An AI agent runs a
          multi-step investigation — grounded in MongoDB Atlas Vector Search and
          the MongoDB MCP server — and returns an evidence-backed risk verdict
          for major-event tickets like the 2026 World Cup.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={fadeUpItem} className="flex flex-wrap items-center justify-center gap-3">
          <MagneticButton
            onClick={() => router.push("/investigate")}
            className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm cursor-pointer"
            style={{
              background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))",
              color: "var(--tg-on-accent)",
              boxShadow: "0 8px 30px var(--tg-accent-glow)",
            }}
            ariaLabel="Check a listing"
          >
            <ShieldCheck size={16} strokeWidth={2.4} />
            Check a listing
            <ArrowRight size={15} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </MagneticButton>
          <a
            href="#how"
            className="inline-flex items-center gap-1.5 px-7 py-3.5 rounded-xl font-medium text-sm cursor-pointer transition-all duration-200"
            style={{
              background: "var(--tg-surface-2)",
              color: "var(--tg-text)",
              border: "1px solid var(--tg-border-strong)",
              backdropFilter: "blur(8px)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-surface-3)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-surface-2)")}
          >
            How it works
          </a>
        </motion.div>

        {/* Metric badge */}
        <motion.div variants={fadeUpItem} className="mt-7 flex justify-center">
          <div
            className="inline-flex items-center gap-2.5 rounded-full px-4 py-2"
            style={{ background: "var(--tg-accent-tint)", border: "1px solid var(--tg-accent-border)" }}
          >
            <span className="text-lg font-bold font-display" style={{ color: "var(--tg-accent)" }}>{recallPct}%</span>
            <span className="text-xs" style={{ color: "var(--tg-text-2)" }}>
              of seeded scams caught in evaluation
            </span>
          </div>
        </motion.div>

        {/* Trust row */}
        <motion.div variants={fadeUpItem} className="mt-9 flex flex-col items-center gap-3">
          <div className="flex items-center flex-wrap justify-center gap-2">
            {TRUST_CHIPS.map((chip, i) => (
              <motion.span
                key={chip}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.9 + i * 0.08, duration: 0.45, ease: EASE_OUT }}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: "var(--tg-surface-2)",
                  border: "1px solid var(--tg-border)",
                  color: "var(--tg-text-3)",
                  letterSpacing: "0.02em",
                }}
              >
                {chip}
              </motion.span>
            ))}
          </div>
          <p className="flex items-center gap-1.5" style={{ color: "var(--tg-text-faint)", fontSize: "0.7rem" }}>
            <Sparkles size={11} strokeWidth={2} style={{ opacity: 0.6 }} />
            Decision-support only, not a guarantee — verify independently. · Synthetic demo data.
          </p>
        </motion.div>
      </motion.div>
    </section>
  )
}
