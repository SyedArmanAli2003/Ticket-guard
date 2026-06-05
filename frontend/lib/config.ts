// Backend base URL. Dev → local FastAPI on :8000. Prod → set NEXT_PUBLIC_API_URL
// to the Cloud Run URL.
const BASE = process.env.NODE_ENV === "production"
  ? (process.env.NEXT_PUBLIC_API_URL || "")
  : "http://localhost:8000"

export const API = {
  generate: `${BASE}/api/generate`,
  plan:     (id: string)    => `${BASE}/api/plan/${id}`,
  share:    (token: string) => `${BASE}/api/share/${token}`,
  stats:    `${BASE}/api/stats`,
  health:   `${BASE}/health`,
  mcpInfo:  `${BASE}/api/mcp/info`,
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK MODE — TicketGuard demo runs fully client-side with no backend.
//
// Enabled when NEXT_PUBLIC_DEMO === "mock" OR when no NEXT_PUBLIC_API_URL is
// configured. The deployed (Vercel) build sets neither a real API URL, so it
// defaults to mock. In mock mode the app NEVER calls the real API.
// ─────────────────────────────────────────────────────────────────────────────
export function isMockMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === "mock") return true
  if (!process.env.NEXT_PUBLIC_API_URL) return true
  return false
}
