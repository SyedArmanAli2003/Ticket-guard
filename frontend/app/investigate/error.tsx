"use client"
// Route-level error boundary for /investigate. Purely presentational — it does
// not alter the investigation flow; it only renders a graceful fallback and a
// retry that calls Next's `reset`. Gated by prefers-reduced-motion.
import { useEffect } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import { usePrefersReducedMotion, EASE_OUT } from "@/lib/motion"

export default function InvestigateError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    // surface for debugging; no data side-effects
    console.error(error)
  }, [error])

  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100vh" }}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 pt-40 pb-20 text-center">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT }}
          className="rounded-2xl p-8"
          style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-risk-high-border)", boxShadow: "var(--tg-shadow), 0 0 36px var(--tg-risk-high-glow)" }}
        >
          <div
            className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
            style={{ width: 60, height: 60, background: "var(--tg-risk-high-soft)", border: "1px solid var(--tg-risk-high-border)" }}
          >
            <AlertTriangle size={26} style={{ color: "var(--tg-risk-high)" }} strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold mb-2 font-display" style={{ color: "var(--tg-text)" }}>Something interrupted the investigation</h1>
          <p className="text-sm mb-6" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
            The investigation view hit an unexpected error. No verdict was produced —
            you can retry, or head back and check another listing.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-transform duration-200 active:scale-[0.97]"
              style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)", boxShadow: "0 8px 24px var(--tg-accent-glow)" }}
            >
              <RotateCcw size={15} strokeWidth={2.4} />
              Try again
            </button>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors duration-200"
              style={{ background: "var(--tg-surface-2)", color: "var(--tg-text-2)", border: "1px solid var(--tg-border-strong)" }}
            >
              <ArrowLeft size={15} strokeWidth={2.4} />
              Back home
            </button>
          </div>
          <p className="text-xs mt-6" style={{ color: "var(--tg-text-3)" }}>
            Decision-support only, not a guarantee — verify independently. Synthetic demo data.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
