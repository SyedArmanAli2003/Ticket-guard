"use client"
import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

// TicketGuard re-skin: the old PitchCraft generator route now redirects to the
// investigation flow. Any ?demo=true param is preserved.
function RedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const demo = searchParams.get("demo")
    router.replace(demo === "true" ? "/investigate?demo=true" : "/investigate")
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--tg-bg)" }}>
      <p className="text-sm" style={{ color: "var(--tg-text-3)" }}>Redirecting to TicketGuard…</p>
    </div>
  )
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div style={{ background: "var(--tg-bg)", minHeight: "100vh" }} />}>
      <RedirectInner />
    </Suspense>
  )
}
