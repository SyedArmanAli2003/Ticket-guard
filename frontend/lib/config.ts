// ─────────────────────────────────────────────────────────────────────────────
// Runtime mode + backend base URL resolution.
//
// Prime Directive: NEVER fabricate. The app runs in exactly one of three modes,
// decided purely by build-time public env vars (so it is deterministic per
// deploy and safe to branch on during SSR):
//
//   • REAL          — NEXT_PUBLIC_API_URL is set. The app calls the real
//                     TicketGuard backend (SSE investigate, health, report,
//                     change-stream feed). No mock data is ever rendered.
//   • MOCK          — no API URL, but NEXT_PUBLIC_DEMO === "mock". The app runs
//                     the self-contained client-side engine in lib/mock.ts and
//                     renders a visible "DEMO — no live backend" watermark.
//   • UNCONFIGURED  — neither is set. The app shows an explicit
//                     "⚠️ Not configured — set NEXT_PUBLIC_API_URL" state and
//                     does NOT silently fall back to mock.
//
// Local `next dev` proxies /api/* → http://localhost:8001 (see next.config.mjs),
// so in development a relative base ("") reaches the backend without CORS.
// ─────────────────────────────────────────────────────────────────────────────

export type AppMode = "real" | "mock" | "unconfigured"

const RAW_API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim()
const IS_DEV = process.env.NODE_ENV !== "production"

/** Resolve the runtime mode from public env vars. Stable across server/client. */
export function getMode(): AppMode {
  if (RAW_API_URL) return "real"
  // In dev we proxy /api to a local backend, so REAL mode is reachable with a
  // relative base. Opt in explicitly so the default dev experience can still be
  // mock if desired.
  if (IS_DEV && process.env.NEXT_PUBLIC_DEMO !== "mock") return "real"
  if (process.env.NEXT_PUBLIC_DEMO === "mock") return "mock"
  return "unconfigured"
}

export function isRealMode(): boolean {
  return getMode() === "real"
}

export function isMockMode(): boolean {
  return getMode() === "mock"
}

/** Base URL the API client prefixes to every endpoint.
 *  - Production REAL → the configured Cloud Run origin.
 *  - Dev REAL        → "" (relative) so the next.config rewrite proxies it.
 */
export function apiBase(): string {
  if (RAW_API_URL) return RAW_API_URL.replace(/\/+$/, "")
  return "" // dev proxy or mock (mock never calls these)
}

// Concrete endpoint builders (single source of truth).
export const API = {
  investigate: () => `${apiBase()}/api/investigate`,
  check: () => `${apiBase()}/api/check`,
  report: () => `${apiBase()}/api/report`,
  feed: () => `${apiBase()}/api/feed`,
  health: () => `${apiBase()}/api/health`,
  mcpInfo: () => `${apiBase()}/api/mcp/info`,
}
