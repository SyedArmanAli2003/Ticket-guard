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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(240,25%,4%)" }}>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Redirecting to TicketGuard…</p>
    </div>
  )
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div style={{ background: "hsl(240,25%,4%)", minHeight: "100vh" }} />}>
      <RedirectInner />
    </Suspense>
  )
}
