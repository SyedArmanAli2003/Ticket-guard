"use client"
// ─────────────────────────────────────────────────────────────────────────────
// TicketGuard — shared motion primitives.
// Performance: NO filter:blur() on animated elements — blur compositing is
// the #1 cause of frame drops on mid-range devices. All variants use only
// opacity + transform (GPU-composited via will-change:transform).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import type { Transition, Variants } from "framer-motion"

/** Premium "decelerate" curve used across the app. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1]

export const SPRING_SOFT: Transition = { type: "spring", stiffness: 280, damping: 28, mass: 0.7 }
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 500, damping: 32 }

/**
 * Reactive `prefers-reduced-motion` hook.
 * Defaults to `false` on the server / first paint, then syncs on mount so SSR
 * markup stays stable (avoids hydration mismatch) and motion is gated client-side.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])
  return reduced
}

// ── Reusable variants ────────────────────────────────────────────────────────

/** Container that staggers its children in. */
export const staggerContainer = (stagger = 0.05, delayChildren = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
})

/**
 * A single item rising + fading into place.
 * NO filter:blur — that forces per-frame GPU compositing and kills perf.
 * Pure opacity + translateY runs at 60fps on the compositor thread.
 */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE_OUT },
  },
}

/** Per-word headline reveal — no blur. */
export const wordReveal: Variants = {
  hidden: { opacity: 0, y: "0.4em" },
  show: {
    opacity: 1,
    y: "0em",
    transition: { duration: 0.5, ease: EASE_OUT },
  },
}

/** Tool-call chip sliding in from the left. */
export const chipSlideIn: Variants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_OUT } },
}

/** Card lifting into view (used for steps + sections). */
export const cardRise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
}

/** Live-feed item flying in from the top with a soft settle. */
export const feedFlyIn: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.25, ease: EASE_OUT } },
}
