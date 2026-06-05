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
