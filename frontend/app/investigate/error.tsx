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
    <div style={{ background: "hsl(240,25%,4%)", minHeight: "100vh" }}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 pt-40 pb-20 text-center">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT }}
          className="rounded-2xl p-8"
          style={{ background: "hsl(240,15%,8%)", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 0 36px rgba(239,68,68,0.15)" }}
        >
          <div
            className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
            style={{ width: 60, height: 60, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)" }}
          >
            <AlertTriangle size={26} style={{ color: "rgb(248,113,113)" }} strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2 font-display">Something interrupted the investigation</h1>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            The investigation view hit an unexpected error. No verdict was produced —
            you can retry, or head back and check another listing.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer transition-transform duration-200 active:scale-[0.97]"
              style={{ background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))", boxShadow: "0 8px 24px rgba(16,185,129,0.25)" }}
            >
              <RotateCcw size={15} strokeWidth={2.4} />
              Try again
            </button>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors duration-200"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <ArrowLeft size={15} strokeWidth={2.4} />
              Back home
            </button>
          </div>
          <p className="text-xs mt-6" style={{ color: "rgba(255,255,255,0.3)" }}>
            Decision-support only, not a guarantee — verify independently. Synthetic demo data.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
