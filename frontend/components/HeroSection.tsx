"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import PremiumBackground from "@/components/PremiumBackground"
import { API } from "@/lib/config"

export default function HeroSection() {
  const router = useRouter()
  const [planCount, setPlanCount] = useState<number | null>(null)

  useEffect(() => {
    fetch(API.stats).then(r => r.json()).then(d => setPlanCount(d.total_plans)).catch(() => {})
  }, [])

  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ height: "100dvh", paddingTop: "6rem", paddingBottom: "2rem", background: "hsl(240,28%,3.5%)" }}>
      <PremiumBackground />

      <div className="relative z-10 w-full max-w-3xl text-center">
        {/* Badge */}
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-xs font-medium select-none"
          style={{ animationDelay: "0.05s", background: "rgba(124,58,237,0.10)",
            border: "1px solid rgba(139,92,246,0.25)", color: "hsl(258,80%,80%)",
            backdropFilter: "blur(8px)" }}>
          <span className="animate-spin-slow inline-block leading-none">✦</span>
          8-agent team · Gemini · Google ADK · MongoDB MCP
        </div>

        {/* Headline */}
        <h1 className="animate-fade-up font-bold tracking-[-0.035em] mb-5"
          style={{ animationDelay: "0.15s", fontSize: "clamp(2.1rem,5vw,3.6rem)", lineHeight: 1.06 }}>
          <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 300 }}>Turn one sentence into an </span>
          <span style={{
            background: "linear-gradient(110deg, #c4b5fd 0%, #8b5cf6 45%, #6366f1 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            textShadow: "0 0 60px rgba(139,92,246,0.35)",
          }}>investor-grade business plan.</span>
        </h1>

        {/* Subline */}
        <p className="animate-fade-up mx-auto mb-8 font-light"
          style={{ animationDelay: "0.3s", maxWidth: "600px",
            fontSize: "clamp(0.9rem,1.4vw,1.1rem)", color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
          A team of eight Gemini agents researches your market live — grounded in
          MongoDB Atlas Vector Search via the MCP server — then validates, models
          the financials, stress-tests the risks, and hands you a 30/60/90-day plan.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.45s" }}>
          <button onClick={() => router.push("/generate")}
            className="group relative px-7 py-3.5 rounded-xl font-semibold text-sm text-white cursor-pointer transition-all duration-200"
            style={{ background: "linear-gradient(180deg, hsl(258,85%,64%), hsl(252,80%,55%))",
              boxShadow: "0 8px 30px rgba(124,58,237,0.35)" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(124,58,237,0.5)" }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(124,58,237,0.35)" }}>
            Generate my plan — free →
          </button>
          <button onClick={() => router.push("/generate?demo=true")}
            className="px-7 py-3.5 rounded-xl font-medium text-sm cursor-pointer transition-all duration-200"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
            Watch a live demo
          </button>
        </div>

        {/* Trust row */}
        <div className="animate-fade-up mt-10 flex flex-col items-center gap-3" style={{ animationDelay: "0.6s" }}>
          <div className="flex items-center flex-wrap justify-center gap-x-5 gap-y-2"
            style={{ color: "rgba(255,255,255,0.32)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
            <span>🍃 MongoDB Atlas</span>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
            <span>✦ Gemini 2.5</span>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
            <span>⚙ Agent Builder (ADK)</span>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
            <span>◈ Google Cloud Run</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.22)", fontSize: "0.7rem" }}>
            {planCount !== null ? `${planCount.toLocaleString()} plans generated · ` : ""}
            Rapid Agent Hackathon 2026 · MongoDB Track
          </p>
        </div>
      </div>
    </section>
  )
}
