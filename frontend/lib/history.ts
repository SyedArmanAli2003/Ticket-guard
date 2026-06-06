// ─────────────────────────────────────────────────────────────────────────────
// Investigation history — persisted per user in localStorage.
// Stores a compact summary of each investigation so users can review past queries.
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  userId: string | null         // null = anonymous
  query: string                 // the text/url/filename submitted
  queryType: "text" | "url" | "file"
  verdict: "HIGH" | "MEDIUM" | "LOW"
  score: number
  rationale: string
  timestamp: string             // ISO string
  investigationId?: string      // backend investigation_id if real mode
}

const HISTORY_KEY = "tg_history"
const MAX_HISTORY = 50

function getAllHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryEntry[]
  } catch {
    return []
  }
}

function saveAllHistory(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
}

/** Add a new entry (prepended, newest first). */
export function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): HistoryEntry {
  const full: HistoryEntry = {
    ...entry,
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  }
  const all = getAllHistory()
  saveAllHistory([full, ...all])
  return full
}

/** Get history for a specific user (or all anonymous entries if userId is null). */
export function getUserHistory(userId: string | null): HistoryEntry[] {
  const all = getAllHistory()
  return all.filter(e => e.userId === userId)
}

/** Get ALL history (admin use). */
export function getFullHistory(): HistoryEntry[] {
  return getAllHistory()
}

/** Delete a single entry by ID. */
export function deleteHistoryEntry(id: string) {
  const filtered = getAllHistory().filter(e => e.id !== id)
  saveAllHistory(filtered)
}

/** Clear all history for a user. */
export function clearUserHistory(userId: string | null) {
  const filtered = getAllHistory().filter(e => e.userId !== userId)
  saveAllHistory(filtered)
}
