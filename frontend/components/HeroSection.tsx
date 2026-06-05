"use client"
import { useRouter } from "next/navigation"
import PremiumBackground from "@/components/PremiumBackground"
import ShieldMark from "@/components/ShieldMark"
import { EVAL } from "@/lib/mock"

const TRUST_CHIPS = [
  "MongoDB Atlas Vector Search",
  "Gemini 2.5",
  "MongoDB MCP",
  "Change Streams",
]

export default function HeroSection() {
  const router = useRouter()
  const recallPct = Math.round(EVAL.recall * 100)

  return (
    <section
      className="relative flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ minHeight: "100dvh", paddingTop: "7rem", paddingBottom: "3rem", background: "hsl(240,28%,3.5%)" }}
    >
      <PremiumBackground teal />

      <div className="relative z-10 w-full max-w-3xl text-center">
        {/* Mark */}
        <div className="animate-fade-up mb-6" style={{ animationDelay: "0.02s" }}>
          <ShieldMark />
        </div>

        {/* Badge */}
        <div
          className="animate-fade-up inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-xs font-medium select-none"
          style={{
            animationDelay: "0.08s",
            background: "rgba(16,185,129,0.10)",
            border: "1px solid rgba(16,185,129,0.28)",
            color: "hsl(160,70%,72%)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span className="live-dot inline-block w-1.5 h-1.5 rounded-full" style={{ background: "hsl(150,90%,60%)" }} />
          AI scam-investigation agent · grounded in MongoDB Atlas
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-up font-bold tracking-[-0.035em] mb-5"
          style={{ animationDelay: "0.15s", fontSize: "clamp(2.1rem,5vw,3.6rem)", lineHeight: 1.06 }}
        >
          <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 300 }}>Spot ticket-resale </span>
          <span
            style={{
              background: "linear-gradient(110deg, #6ee7b7 0%, #10b981 45%, #2dd4bf 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 0 60px rgba(16,185,129,0.35)",
            }}
          >
            scams before you pay.
          </span>
        </h1>

        {/* Subline */}
        <p
          className="animate-fade-up mx-auto mb-8 font-light"
          style={{
            animationDelay: "0.3s",
            maxWidth: "640px",
            fontSize: "clamp(0.9rem,1.4vw,1.1rem)",
            color: "rgba(255,255,255,0.62)",
            lineHeight: 1.6,
          }}
        >
          Paste a suspicious resale listing or seller DM. An AI agent runs a
          multi-step investigation — grounded in MongoDB Atlas Vector Search and
          the MongoDB MCP server — and returns an evidence-backed risk verdict
          for major-event tickets like the 2026 World Cup.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.45s" }}>
          <button
            onClick={() => router.push("/investigate")}
            className="group relative px-7 py-3.5 rounded-xl font-semibold text-sm text-white cursor-pointer transition-all duration-200"
            style={{
              background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))",
              boxShadow: "0 8px 30px rgba(16,185,129,0.32)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.boxShadow = "0 12px 40px rgba(16,185,129,0.5)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "0 8px 30px rgba(16,185,129,0.32)"
            }}
          >
            Check a listing →
          </button>
          <a
            href="#how"
            className="px-7 py-3.5 rounded-xl font-medium text-sm cursor-pointer transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          >
            How it works
          </a>
        </div>

        {/* Metric badge */}
        <div className="animate-fade-up mt-7 flex justify-center" style={{ animationDelay: "0.52s" }}>
          <div
            className="inline-flex items-center gap-2.5 rounded-full px-4 py-2"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)" }}
          >
            <span className="text-lg font-bold" style={{ color: "hsl(150,85%,62%)" }}>{recallPct}%</span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              of seeded scams caught in evaluation
            </span>
          </div>
        </div>

        {/* Trust row */}
        <div className="animate-fade-up mt-9 flex flex-col items-center gap-3" style={{ animationDelay: "0.6s" }}>
          <div className="flex items-center flex-wrap justify-center gap-2">
            {TRUST_CHIPS.map(chip => (
              <span
                key={chip}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: "0.02em",
                }}
              >
                {chip}
              </span>
            ))}
          </div>
          <p style={{ color: "rgba(255,255,255,0.26)", fontSize: "0.7rem" }}>
            Decision-support only, not a guarantee — verify independently. · Synthetic demo data.
          </p>
        </div>
      </div>
    </section>
  )
}
