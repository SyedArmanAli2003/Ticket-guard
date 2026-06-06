"use client"
// Animated integer count-up via requestAnimationFrame. Snaps instantly to the
// target when the user prefers reduced motion. Visual-only helper.
import { useEffect, useRef, useState } from "react"
import { usePrefersReducedMotion } from "./motion"

export function useCountUp(target: number, duration = 900): number {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)
  const frame = useRef<number>()

  useEffect(() => {
    if (reduced) {
      setValue(target)
      return
    }
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [target, duration, reduced])

  return value
}
