"use client"
// A "magnetic" button: it eases toward the cursor on hover and presses down on
// tap. Springy and GPU-friendly. Under prefers-reduced-motion it becomes a plain
// button with no transforms. Visual-only — it just renders its children + onClick.
import { useRef } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"
import { usePrefersReducedMotion, SPRING_SNAPPY } from "@/lib/motion"

type Props = {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
  /** how far (px) the button drifts toward the cursor */
  strength?: number
  ariaLabel?: string
}

export default function MagneticButton({
  children,
  onClick,
  className,
  style,
  strength = 14,
  ariaLabel,
}: Props) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, SPRING_SNAPPY)
  const sy = useSpring(y, SPRING_SNAPPY)

  const onMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const relX = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    const relY = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    x.set(relX * strength)
    y.set(relY * strength)
  }
  const reset = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={reset}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      style={{ ...style, x: reduced ? 0 : sx, y: reduced ? 0 : sy }}
      className={className}
    >
      {children}
    </motion.button>
  )
}
