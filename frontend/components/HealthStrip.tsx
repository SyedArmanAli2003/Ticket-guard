"use client"
// Small live status strip for REAL mode: gemini / atlas / mcp dots + a compact
// cluster line. Honest by construction — each dot reflects a real boolean from
// GET /api/health. No motion-heavy chrome; respects reduced-motion via CSS.
import type { HealthResponse } from "@/lib/types"

function Dot({ on, label, title }: { on: boolean; label: string; title?: string }) {
  const color = on ? "var(--tg-green)" : "var(--tg-text-3)"
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: on ? `0 0 6px ${color}` : "none" }}
      />
      <span className="text-xs uppercase tracking-wider" style={{ color: on ? "var(--tg-text-2)" : "var(--tg-text-3)" }}>
        {label}
      </span>
    </span>
  )
}

export default function HealthStrip({
  health,
  loading,
}: {
  health: HealthResponse | null
  loading: boolean
}) {
  return (
    <div
      className="flex items-center gap-4 flex-wrap rounded-xl px-3.5 py-2.5 mb-5"
      style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border)" }}
    >
      <span className="text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--tg-text-3)" }}>
        <span
          className={loading ? "inline-block w-1.5 h-1.5 rounded-full" : "live-dot inline-block w-1.5 h-1.5 rounded-full"}
          style={{ background: loading ? "var(--tg-text-3)" : health ? "var(--tg-accent-bright)" : "var(--tg-risk-high)" }}
        />
        backend
      </span>
      {loading ? (
        <span className="text-xs" style={{ color: "var(--tg-text-3)" }}>checking…</span>
      ) : health ? (
        <>
          <Dot on={health.gemini} label="gemini" title="Gemini configured" />
          <Dot on={health.atlas} label="atlas" title="MongoDB Atlas reachable" />
          <Dot on={health.mcp} label="mcp" title="MongoDB MCP server" />
          {health.cluster_version && (
            <span className="text-xs ml-auto" style={{ color: "var(--tg-text-3)" }}>
              Atlas {health.cluster_version}
              {health.rankfusion_capable ? " · $rankFusion" : ""}
            </span>
          )}
        </>
      ) : (
        <span className="text-xs" style={{ color: "var(--tg-risk-high)" }}>backend unreachable</span>
      )}
    </div>
  )
}
