"use client"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { FeedItem, RiskLevel } from "@/lib/types"
import { relativeTime } from "@/lib/mock"
import { usePrefersReducedMotion, feedFlyIn } from "@/lib/motion"

const DOT: Record<RiskLevel, string> = {
  HIGH: "rgb(248,113,113)",
  MEDIUM: "rgb(250,204,21)",
  LOW: "rgb(74,222,128)",
}

export default function LiveFeed({
  items,
  offline = false,
  mock = false,
}: {
  items: FeedItem[]
  /** real mode: the change stream is not_configured / dropped */
  offline?: boolean
  /** mock mode: simulated stream — show a DEMO badge instead of "live" */
  mock?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  // tick once a minute so relative timestamps stay fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const badge = offline
    ? { text: "feed offline", bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.12)" }
    : mock
    ? { text: "demo · simulated", bg: "rgba(234,179,8,0.1)", color: "rgb(250,204,21)", border: "rgba(234,179,8,0.28)" }
    : { text: "live · change stream", bg: "rgba(34,197,94,0.1)", color: "rgb(74,222,128)", border: "rgba(34,197,94,0.22)" }

  return (
    <div
      id="feed"
      className="rounded-2xl p-5 scroll-mt-24"
      style={{ background: "hsl(240,15%,7.5%)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className={offline ? "inline-block w-2 h-2 rounded-full" : "live-dot inline-block w-2 h-2 rounded-full"}
            style={{ background: offline ? "rgba(255,255,255,0.3)" : "hsl(150,90%,60%)" }}
          />
          <p className="text-sm font-semibold text-white">Recently reported</p>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
        >
          {badge.text}
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
        {offline
          ? "Live feed offline — the reports change-stream isn't configured (needs MongoDB Atlas as a replica set)."
          : "Every report makes the global corpus smarter — the next fan is protected."}
      </p>

      {offline && items.length === 0 && (
        <p className="text-xs rounded-xl p-3" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          No live reports to show right now.
        </p>
      )}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map(item => (
            <motion.div
              key={item.id}
              layout={!reduced}
              variants={feedFlyIn}
              initial={reduced ? false : "hidden"}
              animate="show"
              exit={reduced ? undefined : "exit"}
              className={`rounded-xl p-3 ${item.isLive ? "fresh-ring" : ""}`}
              style={
                item.isLive
                  ? { overflow: "hidden" }
                  : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: DOT[item.riskLevel] }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: DOT[item.riskLevel] }} />
                  {item.riskLevel}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {item.isLive ? "just now" : relativeTime(item.reportedAt)}
                </span>
              </div>
              <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{item.excerpt}</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{item.handle}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
