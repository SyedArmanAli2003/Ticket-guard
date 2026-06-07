// ─────────────────────────────────────────────────────────────────────────────
// REAL → UI mapping layer.
//
// The premium components (InvestigationStep, RiskCard, ContributionBars,
// LiveFeed) were built around the mock-engine shapes. This module translates the
// REAL backend's 8-step SSE frames + verdict + reports into those same shapes,
// so the live stream drives the identical motion/visuals — no fabrication, just
// a faithful re-projection. `not_configured` steps stay honestly labelled.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AgentStep,
  EvidenceChip,
  FeedItem,
  HybridMatch,
  Investigation,
  RealListing,
  RealReport,
  RealRetrievalHit,
  RealVerdict,
  RiskLevel,
  ToolActivity,
  ToolSource,
  Verdict,
} from "./types"

// ── Step skeleton: the 8 real pipeline steps, in order. ───────────────────────
// Mirrors backend/pipeline.py step names exactly. Each carries the tool badge,
// the worker label, and the activity chips shown while/after it runs.
interface RealStepDef {
  name: string
  tool: ToolSource
  worker: string
  activity: ToolActivity[]
}

export const REAL_STEPS: RealStepDef[] = [
  {
    name: "Normalize Listing",
    tool: "gemini",
    worker: "Listing Normalizer",
    activity: [{ tool: "extract_listing", source: "gemini", preview: "structured fields" }],
  },
  {
    name: "Hybrid Retrieval",
    tool: "vector",
    worker: "Hybrid Search",
    activity: [
      { tool: "$vectorSearch", source: "vector", preview: "Atlas embedding" },
      { tool: "$search", source: "mongodb", preview: "full-text" },
    ],
  },
  {
    name: "Reputation Check",
    tool: "mongodb",
    worker: "Reputation Analyzer",
    activity: [{ tool: "reports_aggregate", source: "mongodb", preview: "$group" }],
  },
  {
    name: "Forgery & Duplicate",
    tool: "mongodb",
    worker: "Forgery Check",
    activity: [{ tool: "tickets_seen_lookup", source: "mongodb", preview: "sha256(ref)" }],
  },
  {
    name: "Risk Scorer",
    tool: "mongodb",
    worker: "Risk Scorer",
    activity: [{ tool: "risk_score_aggregation", source: "mongodb", preview: "$facet" }],
  },
  {
    name: "Official-Transfer Rules",
    tool: "system",
    worker: "Transfer-Rule Check",
    activity: [{ tool: "rule.official_transfer", source: "system", preview: "" }],
  },
  {
    name: "Verdict",
    tool: "gemini",
    worker: "Verdict Writer",
    activity: [{ tool: "compose_verdict", source: "gemini", preview: "" }],
  },
  {
    name: "Persist",
    tool: "mongodb",
    worker: "Persist",
    activity: [{ tool: "investigations.insert", source: "mongodb", preview: "" }],
  },
]
export const REAL_TOTAL = REAL_STEPS.length

/** Build the initial set of 8 waiting steps. */
export function freshRealSteps(): AgentStep[] {
  return REAL_STEPS.map((d, i) => ({
    stepNumber: i + 1,
    name: d.name,
    status: "waiting",
    tool: d.tool,
    worker: d.worker,
    kind: "real",
  }))
}

// ── Verdict ↔ risk-level / score ──────────────────────────────────────────────
export function verdictToLevel(v: Verdict | undefined): RiskLevel {
  if (v === "SCAM") return "HIGH"
  if (v === "LIKELY-LEGIT") return "LOW"
  return "MEDIUM" // SUSPICIOUS or unknown → cautious middle
}

/** Map an SSE tool `source` string onto our ToolSource palette. */
export function toolSource(source: string | undefined): ToolSource {
  const s = (source || "").toLowerCase()
  if (s.includes("vector")) return "vector"
  if (s.includes("gemini")) return "gemini"
  if (s.includes("rule") || s.includes("system")) return "system"
  return "mongodb"
}

// ── Retrieval hits → contribution bars (step 2 + evidence) ───────────────────
// Atlas scores aren't 0–1 (vectorSearchScore ~0–1, searchScore unbounded). We
// normalize per result-set to a 0–1 share purely for the bar widths, keeping the
// raw contribution label honest.
export function retrievalToMatches(results: RealRetrievalHit[]): HybridMatch[] {
  if (!results || results.length === 0) return []
  const vMax = Math.max(...results.map((r) => Number(r.vector_score) || 0), 0.0001)
  const tMax = Math.max(...results.map((r) => Number(r.text_score) || 0), 0.0001)
  const fMax = Math.max(...results.map((r) => Number(r.fused_score) || 0), 0.0001)
  return results.slice(0, 3).map((r) => {
    const vRaw = Number(r.vector_score) || 0
    const tRaw = Number(r.text_score) || 0
    const vector = clamp01(vRaw / vMax)
    const text = clamp01(tRaw / tMax)
    const score = clamp01((Number(r.fused_score) || 0) / fMax)
    const label = prettyPattern(r.pattern_type) || prettyLabel(r.label) || "Matched pattern"
    return {
      label,
      patternType: r.pattern_type || "unknown",
      excerpt: truncate(r.text || r.source_pattern || "", 96),
      vectorScore: round2(vector),
      textScore: round2(text),
      score: round2(score),
    }
  })
}

// ── Final verdict bundle → Investigation (drives RiskCard) ───────────────────
export interface RealResult {
  listing: RealListing | null
  retrieval: RealRetrievalHit[]
  verdict: RealVerdict | null
  riskScore: number | null // from scorer / finalize; null when DB offline
  confidence: number
  investigationId?: string
  engine?: string
  modelUsed?: string
  isFallback?: boolean
}

export function buildInvestigation(r: RealResult, inputText: string): Investigation {
  const level = verdictToLevel(r.verdict?.verdict)
  // Gauge value: prefer the real server-computed risk score; if the scorer was
  // not_configured (DB offline) fall back to the model's confidence (a REAL
  // number) so the gauge still reflects something true rather than a fake score.
  const score =
    r.riskScore != null
      ? clampScore(r.riskScore)
      : Math.round(clamp01(r.confidence) * 100)

  const matches = retrievalToMatches(r.retrieval)
  const evidence: EvidenceChip[] = (r.verdict?.evidence || []).slice(0, 6).map((e, i) => {
    // Attach the i-th retrieval contribution bars when we have them; otherwise
    // the chip renders without bars (handled by ContributionBars hideEmpty).
    const m = matches[i]
    return {
      label: shortLead(e),
      why: e,
      vectorScore: m ? m.vectorScore : -1,
      textScore: m ? m.textScore : -1,
    }
  })

  const rationale =
    r.verdict?.reasoning ||
    "Verdict produced from the available evidence; some signals may be limited."

  return {
    inputText,
    entities: [], // entities are rendered from the real listing in step 1, not here
    matches,
    riskScore: score,
    riskLevel: level,
    rule: { passed: level === "LOW", note: "" }, // rule detail lives in step 6
    rationale,
    evidence,
    modelUsed: r.modelUsed,
    isFallback: r.isFallback,
  }
}

// ── Feed: real report doc → FeedItem ──────────────────────────────────────────
export function reportToFeedItem(rep: RealReport, isLive = false): FeedItem {
  const ts = rep.created_at ? Date.parse(rep.created_at) : Date.now()
  const level = patternToLevel(rep.pattern_type, rep.payment_method)
  const handle = rep.handle || rep.domain || "—"
  const trimmed = (rep.text || "").trim().replace(/\s+/g, " ")
  return {
    id: `rpt-${rep.created_at || ""}-${hashStr(rep.text + handle)}`,
    excerpt: `“${truncate(trimmed, 96)}”`,
    riskLevel: level,
    handle,
    reportedAt: Number.isFinite(ts) ? ts : Date.now(),
    isLive,
  }
}

// User reports are scam reports → treat as HIGH unless the pattern clearly reads
// lower. We never invent a "legit" report; this only colors the feed dot.
function patternToLevel(pattern?: string, payment?: string): RiskLevel {
  const p = (pattern || "").toLowerCase()
  const pay = (payment || "").toLowerCase()
  if (p.includes("official") || pay.includes("paypal_goods") || pay.includes("credit")) return "LOW"
  if (p.includes("meetup") || p.includes("in_person") || p.includes("cash")) return "MEDIUM"
  return "HIGH"
}

// ── small helpers ─────────────────────────────────────────────────────────────
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function truncate(s: string, n: number): string {
  const t = (s || "").trim()
  return t.length > n ? t.slice(0, n) + "…" : t
}
function shortLead(s: string): string {
  const t = (s || "").trim()
  // First clause/sentence as the chip headline.
  const cut = t.split(/[.;:]/)[0]
  return truncate(cut || t, 48)
}
function prettyPattern(p?: string): string {
  if (!p) return ""
  return p
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
function prettyLabel(l?: string): string {
  if (!l) return ""
  return l.charAt(0).toUpperCase() + l.slice(1)
}
function hashStr(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}
