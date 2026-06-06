"use client"
// Route transition wrapper. Next.js re-mounts a `template` on every navigation,
// so this gives each page a soft fade-up entrance. Purely presentational — it
// renders its children unchanged. Gated by prefers-reduced-motion.
import { motion } from "framer-motion"
import { usePrefersReducedMotion, EASE_OUT } from "@/lib/motion"

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.4, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}
