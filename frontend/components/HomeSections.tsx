"use client"
import { useRouter } from "next/navigation"
import { EVAL } from "@/lib/mock"

const STEPS = [
  {
    n: "01",
    badge: "GEMINI",
    badgeColor: "hsl(258,80%,78%)",
    badgeBg: "rgba(124,58,237,0.12)",
    badgeBorder: "rgba(124,58,237,0.25)",
    title: "Extract the signals",
    body: "Gemini pulls the price, seller handle, any domain, the payment method and urgency cues out of the raw listing or DM.",
  },
  {
    n: "02",
    badge: "VECTOR",
    badgeColor: "rgb(125,211,252)",
    badgeBg: "rgba(14,165,233,0.1)",
    badgeBorder: "rgba(14,165,233,0.25)",
    title: "Hybrid search the corpus",
    body: "A vector pipeline and a full-text pipeline run over a corpus of known scam patterns, blending semantic and keyword relevance.",
  },
  {
    n: "03",
    badge: "MONGODB",
    badgeColor: "rgb(74,222,128)",
    badgeBg: "rgba(34,197,94,0.12)",
    badgeBorder: "rgba(34,197,94,0.25)",
    title: "Score & verify the verdict",
    body: "An aggregation scores the risk, a rule checks for official digital transfer, and Gemini writes an evidence-backed verdict.",
  },
]

export default function HomeSections() {
  const router = useRouter()

  return (
    <div style={{ background: "hsl(240,28%,3.5%)" }}>
      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="relative max-w-5xl mx-auto px-6 py-20 scroll-mt-24">
        <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: "hsl(160,70%,58%)" }}>
          How it works
        </p>
        <h2 className="font-bold text-white mb-10" style={{ fontSize: "clamp(1.6rem,3.5vw,2.4rem)", letterSpacing: "-0.02em" }}>
          A five-step agent investigation
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <div
              key={s.n}
              className="rounded-2xl p-6"
              style={{ background: "hsl(240,15%,8%)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.18)" }}>{s.n}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: s.badgeBg, color: s.badgeColor, border: `1px solid ${s.badgeBorder}` }}
                >
                  {s.badge}
                </span>
              </div>
              <p className="text-white font-semibold mb-2">{s.title}</p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <button
            onClick={() => router.push("/investigate")}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white cursor-pointer"
            style={{ background: "linear-gradient(180deg, hsl(160,84%,42%), hsl(168,80%,34%))", boxShadow: "0 8px 24px rgba(16,185,129,0.28)" }}
          >
            Try it on a listing →
          </button>
        </div>
      </section>

      {/* ── About the data ─────────────────────────────────────────────── */}
      <section id="data" className="relative max-w-5xl mx-auto px-6 pb-24 scroll-mt-24">
        <div
          className="rounded-2xl p-8"
          style={{ background: "hsl(240,15%,7%)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: "hsl(160,70%,58%)" }}>
            About the data
          </p>
          <h2 className="font-bold text-white mb-3" style={{ fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-0.02em" }}>
            Synthetic demo data only
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)", maxWidth: "640px", lineHeight: 1.6 }}>
            Every example, seller handle, domain and risk verdict in this demo is
            synthetic and generated for illustration. TicketGuard surfaces
            risk signals consistent with documented patterns — it is decision-support,
            not a guarantee. Always verify a seller and pay only through official,
            protected channels.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { v: `${Math.round(EVAL.recall * 100)}%`, l: "seeded-scam recall" },
              { v: EVAL.corpusSize.toLocaleString(), l: "corpus listings" },
              { v: EVAL.patternsTracked, l: "scam patterns tracked" },
              { v: `${(EVAL.medianLatencyMs / 1000).toFixed(1)}s`, l: "median investigation" },
            ].map(m => (
              <div
                key={m.l}
                className="rounded-xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="font-bold text-white text-xl">{m.v}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{m.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-xs mt-8" style={{ color: "rgba(255,255,255,0.25)" }}>
          TicketGuard · MongoDB Atlas Vector Search · Gemini 2.5 · MongoDB MCP · Change Streams
        </p>
      </section>
    </div>
  )
}
