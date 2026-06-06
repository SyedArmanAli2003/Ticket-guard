"use client"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, Send, Loader2, X } from "lucide-react"
import { getMode } from "@/lib/config"
import { API } from "@/lib/config"
import { EASE_OUT } from "@/lib/motion"
import type { Investigation } from "@/lib/types"

interface Message {
  role: "user" | "assistant"
  content: string
}

const QUICK_QUESTIONS = [
  "Why this risk level?",
  "What should I do instead?",
  "What if they used a credit card?",
  "How do I verify legitimacy?",
]

// Mock follow-up responses for demo mode
function mockAnswer(question: string, inv: Investigation): string {
  const level = inv.riskLevel
  if (question.toLowerCase().includes("risk level") || question.toLowerCase().includes("why")) {
    return level === "HIGH"
      ? "This listing scored HIGH risk because it combines multiple strong scam signals: an irreversible payment method (Zelle), unofficial PDF-only ticket transfer (bypassing official app), and price significantly below face value — all classic patterns from our scam corpus."
      : level === "MEDIUM"
      ? "This listing scored SUSPICIOUS because it uses at least one elevated-risk signal, such as Zelle-only payment or urgency pressure. These are common in scams but not conclusive on their own."
      : "The signals from this listing are consistent with legitimate resale patterns. However, always verify through official channels before paying."
  }
  if (question.toLowerCase().includes("instead") || question.toLowerCase().includes("do")) {
    return "Buy through official resale platforms like StubHub, SeatGeek, or the team's official partner. They offer buyer guarantees and verified sellers. Never pay via Zelle, Venmo, or crypto for ticket purchases."
  }
  if (question.toLowerCase().includes("credit card")) {
    return "Credit card payments offer chargeback protection if the tickets are fraudulent. However, even with a credit card, buying from an unverified seller carries risk. Always prefer official platforms with buyer protection policies."
  }
  if (question.toLowerCase().includes("verify") || question.toLowerCase().includes("legitimate")) {
    return "To verify: (1) Ask for the official ticket app transfer, not a PDF. (2) Check if the seller's account history is consistent. (3) Verify the ticket barcode via the official event app before paying. (4) Use a payment method with chargeback protection."
  }
  return "Great question. Based on the investigation evidence, I recommend proceeding with caution. Always use official ticketing platforms and never send money via irreversible payment methods for event tickets."
}

interface AskFollowUpProps {
  investigation: Investigation
}

export default function AskFollowUp({ investigation }: AskFollowUpProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const mode = getMode()
  const isReal = mode === "real"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async (q: string) => {
    if (!q.trim() || loading) return
    const userMsg: Message = { role: "user", content: q.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      if (isReal) {
        // Call backend /api/check for a quick verdict on the follow-up
        const res = await fetch(API.check(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "text",
            text: `Follow-up question about this investigation verdict (${investigation.riskLevel} risk, score ${investigation.riskScore}): "${q}" — Context: ${investigation.rationale}`,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          // Use the evidence field or rationale as the answer
          const answer = data.evidence?.[0] || data.rationale || mockAnswer(q, investigation)
          setMessages(prev => [...prev, { role: "assistant", content: answer }])
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: mockAnswer(q, investigation) }])
        }
      } else {
        await new Promise(r => setTimeout(r, 800))
        setMessages(prev => [...prev, { role: "assistant", content: mockAnswer(q, investigation) }])
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: mockAnswer(q, investigation) }])
    }
    setLoading(false)
  }

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.2 }}
      className="rounded-2xl mt-4 overflow-hidden"
      style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border-strong)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--tg-border)" }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: "var(--tg-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--tg-text)" }}>Ask a follow-up</span>
          {!isReal && (
            <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-semibold uppercase"
              style={{ background: "var(--tg-warn-tint)", color: "var(--tg-warn)", border: "1px solid var(--tg-warn-border)" }}>
              DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs" style={{ color: "var(--tg-text-3)" }}>Grounded in this investigation. Risk signals only — never a guarantee.</p>
          <button onClick={() => setOpen(false)} className="p-1 rounded cursor-pointer" style={{ color: "var(--tg-text-3)" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Quick question pills */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {QUICK_QUESTIONS.map(q => (
            <button key={q} onClick={() => send(q)}
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              style={{ background: "var(--tg-accent-tint-2)", color: "var(--tg-accent)", border: "1px solid var(--tg-accent-border)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--tg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--tg-accent-tint-2)")}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="px-5 pt-4 space-y-3 max-h-64 overflow-y-auto">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] px-4 py-2.5 rounded-xl text-sm"
                  style={{
                    background: m.role === "user" ? "var(--tg-accent)" : "var(--tg-surface-2)",
                    color: m.role === "user" ? "var(--tg-on-accent)" : "var(--tg-text)",
                    border: m.role === "assistant" ? "1px solid var(--tg-border)" : "none",
                    lineHeight: 1.6,
                  }}>
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-xl" style={{ background: "var(--tg-surface-2)", border: "1px solid var(--tg-border)" }}>
                <Loader2 size={14} className="animate-spin" style={{ color: "var(--tg-text-3)" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2 p-4">
        <input
          value={input} onChange={e => setInput(e.target.value)}
          placeholder="Ask about this verdict…"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: "var(--tg-surface-2)", color: "var(--tg-text)", border: "1px solid var(--tg-border-strong)" }}
          onFocus={e => (e.target.style.borderColor = "var(--tg-accent)")}
          onBlur={e => (e.target.style.borderColor = "var(--tg-border-strong)")}
          disabled={loading}
        />
        <button type="submit" disabled={!input.trim() || loading}
          className="p-2.5 rounded-xl cursor-pointer transition-all disabled:opacity-40"
          style={{ background: "var(--tg-accent)", color: "var(--tg-on-accent)" }}>
          <Send size={15} />
        </button>
      </form>
    </motion.div>
  )
}
