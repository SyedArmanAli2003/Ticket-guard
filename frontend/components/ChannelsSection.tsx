"use client"
// "Bring us the offer — from anywhere" — the honest ecosystem story.
// We deliberately do NOT auto-read anyone's inbox or DMs (Instagram/LinkedIn ToS
// forbid it; Gmail needs a CASA audit). Instead the user hands us the single
// message and we investigate it. Every channel below feeds the SAME Gemini + Atlas
// pipeline. Trust-by-design is the selling point — stated plainly for judges.
import Link from "next/link"
import { motion } from "framer-motion"
import { ImageUp, ClipboardType, FileText, Link2, ShieldCheck, ArrowRight, Lock } from "lucide-react"
import { usePrefersReducedMotion, staggerContainer, cardRise, fadeUpItem, EASE_OUT } from "@/lib/motion"

const VIEWPORT = { once: true, amount: 0.2 } as const

const CHANNELS = [
  {
    Icon: ImageUp,
    title: "Screenshot a DM",
    body: "Got an offer in an Instagram, WhatsApp or LinkedIn DM? Screenshot it and drop it in — Gemini reads the seller handle, price, payment ask and urgency straight off the image.",
    tag: "Live",
  },
  {
    Icon: ClipboardType,
    title: "Paste the message",
    body: "Paste the raw seller message or listing text. The agent extracts every entity and runs the full multi-step investigation.",
    tag: "Live",
  },
  {
    Icon: FileText,
    title: "Upload the ticket",
    body: "Drop in a ticket PDF or photo. We read the barcode/QR, inspect the file's metadata for tampering, and check it against tickets we've seen before.",
    tag: "Live",
  },
  {
    Icon: Link2,
    title: "Paste a link",
    body: "Drop a resale URL. We fetch the real page, keep the host that actually served it, and score the listing — typosquatted domains get flagged.",
    tag: "Live",
  },
]

export default function ChannelsSection() {
  const reduced = usePrefersReducedMotion()
  return (
    <section id="channels" className="relative px-6 py-24" style={{ borderTop: "1px solid var(--tg-border)" }}>
      <div className="mx-auto max-w-5xl">
        <motion.div
          variants={staggerContainer(0.08)}
          initial={reduced ? false : "hidden"}
          whileInView="show"
          viewport={VIEWPORT}
          className="text-center mb-14"
        >
          <motion.p variants={fadeUpItem} className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: "var(--tg-accent)" }}>
            One engine · every channel
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="font-display font-bold tracking-[-0.03em] mb-4" style={{ fontSize: "clamp(1.9rem,4vw,2.9rem)", color: "var(--tg-text)", lineHeight: 1.08 }}>
            Bring us the offer — from anywhere
          </motion.h2>
          <motion.p variants={fadeUpItem} className="mx-auto text-pretty" style={{ maxWidth: "640px", color: "var(--tg-text-2)", fontSize: "clamp(0.95rem,1.4vw,1.08rem)", lineHeight: 1.62 }}>
            However a suspicious ticket reaches you, hand it over and the same Gemini + MongoDB Atlas
            agent investigates it — and returns an evidence-backed risk verdict in seconds.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer(0.07)}
          initial={reduced ? false : "hidden"}
          whileInView="show"
          viewport={VIEWPORT}
          className="grid gap-4 sm:grid-cols-2"
        >
          {CHANNELS.map(c => (
            <motion.div
              key={c.title}
              variants={cardRise}
              whileHover={reduced ? undefined : { y: -3, borderColor: "var(--tg-accent-border)" }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="group rounded-2xl p-6 flex gap-4"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", boxShadow: "var(--tg-shadow)" }}
            >
              <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "var(--tg-accent-tint)", border: "1px solid var(--tg-accent-border)" }}>
                <c.Icon size={20} style={{ color: "var(--tg-accent)" }} strokeWidth={2.1} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-display font-semibold" style={{ color: "var(--tg-text)", fontSize: "1.02rem" }}>{c.title}</h3>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--tg-risk-low-soft)", color: "var(--tg-risk-low)", border: "1px solid var(--tg-risk-low-border)" }}>{c.tag}</span>
                </div>
                <p className="text-sm" style={{ color: "var(--tg-text-2)", lineHeight: 1.55 }}>{c.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust-by-design callout — the limitation IS the feature */}
        <motion.div
          initial={reduced ? false : { opacity: 1, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="mt-6 rounded-2xl p-6 flex items-start gap-4"
          style={{ background: "var(--tg-accent-tint)", border: "1px solid var(--tg-accent-border)" }}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-accent-border)" }}>
            <Lock size={18} style={{ color: "var(--tg-accent)" }} strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="font-display font-semibold mb-1" style={{ color: "var(--tg-text)" }}>We never read your inbox or DMs</h3>
            <p className="text-sm" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
              By design. Auto-scanning a private Instagram/LinkedIn inbox is against their terms, and silent
              email access needs a heavy security audit. So you stay in control — you hand us the one message
              you&apos;re unsure about, and nothing else. <span style={{ color: "var(--tg-text-3)" }}>Forward-to-email and native phone Share are on the roadmap.</span>
            </p>
          </div>
        </motion.div>

        <div className="mt-10 text-center">
          <Link href="/investigate" className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-transform duration-200 ease-out active:scale-[0.97]" style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)", boxShadow: "0 8px 30px var(--tg-accent-glow)" }}>
            <ShieldCheck size={16} strokeWidth={2.4} />
            Check a listing now
            <ArrowRight size={15} strokeWidth={2.4} className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
