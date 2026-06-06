// ─────────────────────────────────────────────────────────────────────────────
// REAL backend client for TicketGuard.
//
// Three transports:
//   • investigateStream() — POST /api/investigate returns an SSE body. Browsers'
//     EventSource is GET-only, so we read the fetch ReadableStream ourselves and
//     parse `data: <json>\n\n` frames.
//   • getHealth() / postReport() — plain JSON fetch.
//   • openFeed() — GET /api/feed is a real EventSource (change-stream SSE).
//
// Nothing here fabricates data; on transport failure we surface an explicit
// error frame / rejected promise and the UI renders an honest state.
// ─────────────────────────────────────────────────────────────────────────────

import { API } from "./config"
import type {
  HealthResponse,
  InvestigateFrame,
  InvestigateRequestBody,
  RealReport,
} from "./types"

// ── GET /api/health ──────────────────────────────────────────────────────────
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(API.health(), { signal, cache: "no-store" })
  if (!res.ok) throw new Error(`health ${res.status}`)
  return (await res.json()) as HealthResponse
}

// ── POST /api/report ─────────────────────────────────────────────────────────
export interface ReportBody {
  text: string
  domain?: string
  handle?: string
  pattern_type?: string
  payment_method?: string
  barcode_or_ref?: string
}
export interface ReportResult {
  status: "ok" | "not_configured" | "error"
  report_id?: string
  reason?: string
}

export async function postReport(body: ReportBody): Promise<ReportResult> {
  try {
    const res = await fetch(API.report(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { status: "error", reason: json?.reason || `report ${res.status}` }
    }
    return json as ReportResult
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : "report failed" }
  }
}

// ── POST /api/investigate — SSE over a fetch ReadableStream ───────────────────
/**
 * Stream the investigation. Calls `onFrame` for each parsed SSE JSON frame.
 * Pass an AbortSignal to cancel (e.g. when a newer run supersedes this one or
 * the component unmounts). Resolves when the stream ends; rejects on a hard
 * transport error (not on backend `status:"error"` frames — those arrive via
 * onFrame so the UI can show them in-context).
 */
export async function investigateStream(
  body: InvestigateRequestBody,
  onFrame: (frame: InvestigateFrame) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(API.investigate(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let reason = `investigate ${res.status}`
    try {
      const j = await res.json()
      if (j?.reason) reason = j.reason
      else if (j?.detail) reason = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* non-JSON error body; keep status reason */
    }
    throw new Error(reason)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let sep: number
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const frame = parseSseEvent(rawEvent)
        if (frame) onFrame(frame)
      }
    }
    // Flush any trailing event without a final blank line.
    const tail = parseSseEvent(buffer)
    if (tail) onFrame(tail)
  } finally {
    reader.releaseLock()
  }
}

/** Parse one raw SSE event block ("data: {...}" possibly multi-line). */
function parseSseEvent(block: string): InvestigateFrame | null {
  const dataLines = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart())
  if (dataLines.length === 0) return null
  const payload = dataLines.join("\n").trim()
  if (!payload) return null
  try {
    return JSON.parse(payload) as InvestigateFrame
  } catch {
    return null
  }
}

// ── GET /api/feed — real change-stream EventSource ────────────────────────────
export type FeedEvent =
  | { type: "hello"; status: "ok" | "not_configured"; recent: RealReport[] }
  | { type: "report"; status: "ok"; report: RealReport }
  | { type: "feed"; status: "not_configured"; reason?: string }
  | { type: "ping" }

/**
 * Subscribe to the live feed. Returns a cleanup function that closes the
 * EventSource. `onError` fires on a transport drop so the UI can show an
 * "offline" state.
 */
export function openFeed(
  onEvent: (e: FeedEvent) => void,
  onError?: () => void
): () => void {
  let es: EventSource | null = null
  try {
    es = new EventSource(API.feed())
  } catch {
    onError?.()
    return () => {}
  }
  es.onmessage = (evt) => {
    try {
      onEvent(JSON.parse(evt.data) as FeedEvent)
    } catch {
      /* ignore unparseable keep-alive lines */
    }
  }
  es.onerror = () => {
    onError?.()
  }
  return () => es?.close()
}

// ── File → base64 (data-URI) for PDF/image ingestion ──────────────────────────
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error || new Error("file read failed"))
    fr.readAsDataURL(file)
  })
}
