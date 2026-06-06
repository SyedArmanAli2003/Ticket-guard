"use client"
// Conversational follow-up over a finished investigation. In REAL mode it calls
// POST /api/chat (Gemini, grounded in this investigation; persists to MongoDB
// when Atlas is up). In MOCK mode it returns a clearly-labelled canned reply.
// Never fabricates a real verdict — it only explains the one already produced.
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, Send, Sparkles } from "lucide-react"
import type { Investigation } from "@/lib/types"
import { postChat } from "@/lib/api"
import { usePrefersReducedMotion } from "@/lib/motion"

type Msg = { role: "user" | "assistant"; content: string }

const VERDICT: Record<string, string> = { HIGH: "SCAM", MEDIUM: "SUSPICIOUS", LOW: "LIKELY-LEGIT" }
const SUGGESTED = ["Why this risk level?", "What should I do instead?", "What if they used a credit card?"]

function mockReply(inv: Investigation): string {
  const lvl = inv.riskLevel
  const top = inv.evidence.slice(0, 2).map(e => e.label).join("; ") || inv.rationale
  const verdict = lvl === "HIGH" ? "shows high-risk indicators consistent with known scam patterns"
    : lvl === "MEDIUM" ? "looks suspicious — the signals are mixed" : "shows no strong high-risk signals"
  const action = lvl === "LOW"
    ? "Still verify the seller independently and pay only through official, protected channels."
    : "Avoid irreversible payment (Zelle, gift cards, crypto), insist on the official-app transfer, and report it if you're pressured."
  return `(demo reply) This listing ${verdict}. Key signals: ${top}. ${action} Decision-support only — not a guarantee.`
}

export default function ChatPanel({
  investigation, mode, investigationId,
}: {
  investigation: Investigation
  mode: "real" | "mock" | "unconfigured"
  investigationId?: string
}) {
  const reduced = usePrefersReducedMotion()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const convId = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" })
  }, [messages, reduced])

  const ctx = {
    verdict: VERDICT[investigation.riskLevel] ?? investigation.riskLevel,
    risk_score: investigation.riskScore,
    reasoning: investigation.rationale,
    evidence: investigation.evidence.map(e => `${e.label}: ${e.why}`),
    listing: Object.fromEntries(investigation.entities.map(e => [e.kind, e.value])),
  }

  async function send(q: string) {
    const question = q.trim()
    if (!question || busy) return
    const next: Msg[] = [...messages, { role: "user", content: question }]
    setMessages(next)
    setInput("")
    setBusy(true)
    try {
      let reply: string
      if (mode === "real") {
        const r = await postChat({
          messages: next, context: ctx,
          investigation_id: investigationId, conversation_id: convId.current,
        })
        reply = r.status === "ok" && r.reply ? r.reply : `⚠️ ${r.reason || "chat unavailable"}`
        if (r.conversation_id) convId.current = r.conversation_id
      } else {
        await new Promise(res => setTimeout(res, 500))
        reply = mockReply(investigation)
      }
      setMessages(m => [...m, { role: "assistant", content: reply }])
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "chat failed"}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl p-5 mt-4" style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", boxShadow: "var(--tg-shadow)" }}>
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={16} style={{ color: "var(--tg-accent)" }} strokeWidth={2.2} />
        <h3 className="text-sm font-semibold font-display" style={{ color: "var(--tg-text)" }}>Ask a follow-up</h3>
        {mode === "mock" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--tg-warn-tint)", color: "var(--tg-warn)", border: "1px solid var(--tg-warn-border)" }}>DEMO</span>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--tg-text-3)" }}>
        Grounded in this investigation. Risk signals only — never a guarantee.
      </p>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTED.map(s => (
            <button key={s} onClick={() => send(s)} disabled={busy}
              className="text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors disabled:opacity-50"
              style={{ background: "var(--tg-accent-tint)", color: "var(--tg-accent-soft-text)", border: "1px solid var(--tg-accent-border)" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div key={i} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="text-xs leading-relaxed rounded-2xl px-3 py-2 max-w-[85%]" style={{
                background: m.role === "user" ? "var(--tg-accent)" : "var(--tg-surface-2)",
                color: m.role === "user" ? "var(--tg-accent-contrast)" : "var(--tg-text)",
                border: m.role === "user" ? "none" : "1px solid var(--tg-border)",
              }}>
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--tg-text-3)" }}>
            <Sparkles size={12} className={reduced ? "" : "animate-pulse"} /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} disabled={busy}
          placeholder="Ask about this verdict…"
          className="flex-1 text-sm rounded-xl px-3 py-2 outline-none disabled:opacity-60"
          style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)" }} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
          className="rounded-xl px-3 py-2 cursor-pointer disabled:opacity-40 transition-opacity inline-flex items-center justify-center"
          style={{ background: "var(--tg-accent)", color: "var(--tg-accent-contrast)" }}>
          <Send size={15} strokeWidth={2.2} />
        </button>
      </form>
    </div>
  )
}
