import type { Metadata } from "next"
import Link from "next/link"

// TicketGuard runs in self-contained mock mode with no backend, so saved
// "plan" records are not available here. This route stays valid for the build
// and gently routes visitors to the live investigation flow. No network calls.
export const metadata: Metadata = {
  title: "TicketGuard — demo mode",
  description: "TicketGuard runs on synthetic demo data with no backend.",
}

export default function PlanPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--tg-bg)" }}>
      <div className="text-center max-w-md">
        <p className="text-xl font-semibold mb-2" style={{ color: "var(--tg-text)" }}>Running in demo mode</p>
        <p className="text-sm mb-6" style={{ color: "var(--tg-text-2)", lineHeight: 1.6 }}>
          TicketGuard is running on self-contained synthetic data with no backend,
          so saved records aren&rsquo;t available. Try a live investigation instead.
        </p>
        <Link
          href="/investigate"
          className="inline-block px-6 py-3 rounded-xl font-semibold text-sm"
          style={{ background: "linear-gradient(180deg, var(--tg-accent), var(--tg-accent-2))", color: "var(--tg-on-accent)" }}
        >
          Check a listing →
        </Link>
      </div>
    </div>
  )
}
