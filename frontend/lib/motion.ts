"use client"
// ─────────────────────────────────────────────────────────────────────────────
// TicketGuard — shared motion primitives.
//
// One source of truth for easing, durations, and framer-motion variants, plus a
// `usePrefersReducedMotion` hook used to GATE every non-trivial animation. When a
// user prefers reduced motion we render the final/resting state with no movement.
//
// VISUAL/MOTION ONLY — nothing here touches data, the mock engine, or fetches.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import type { Transition, Variants } from "framer-motion"

/** Premium "decelerate" curve used across the app. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1]

export const SPRING_SOFT: Transition = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 }
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 420, damping: 30 }

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
export const staggerContainer = (stagger = 0.06, delayChildren = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
})

/** A single item rising + fading + de-blurring into place. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: EASE_OUT },
  },
}

/** Per-word headline reveal. */
export const wordReveal: Variants = {
  hidden: { opacity: 0, y: "0.5em", filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: "0em",
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_OUT },
  },
}

/** Tool-call chip sliding in from the left. */
export const chipSlideIn: Variants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE_OUT } },
}

/** Card lifting into view (used for steps + sections). */
export const cardRise: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
}

/** Live-feed item flying in from the top with a soft settle. */
export const feedFlyIn: Variants = {
  hidden: { opacity: 0, y: -14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.35, ease: EASE_OUT } },
}
