"use client"
// Route-level loading UI for /investigate (shown while the segment streams in).
// Purely presentational skeleton that mirrors the page layout. The shimmer is
// gated by prefers-reduced-motion in globals.css.
import Navbar from "@/components/Navbar"

function SkeletonLine({ w = "100%", h = 14 }: { w?: string; h?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-md skeleton-shimmer"
      style={{ width: w, height: h, background: "var(--tg-hover)" }}
    />
  )
}

export default function InvestigateLoading() {
  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100vh" }}>
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div>
            <div className="mb-3" style={{ maxWidth: 360 }}><SkeletonLine w="70%" h={34} /></div>
            <div className="mb-6 space-y-2" style={{ maxWidth: 560 }}>
              <SkeletonLine />
              <SkeletonLine w="85%" />
            </div>
            <div
              className="rounded-xl skeleton-shimmer relative overflow-hidden"
              style={{ height: 150, background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}
            />
            <div className="mt-6 rounded-xl skeleton-shimmer relative overflow-hidden" style={{ height: 56, background: "var(--tg-surface)" }} />
          </div>
          <aside>
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", boxShadow: "var(--tg-shadow)" }}
            >
              <SkeletonLine w="55%" h={16} />
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: "var(--tg-surface-2)" }}>
                  <SkeletonLine w="40%" h={10} />
                  <SkeletonLine w="90%" h={10} />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
