export type StepStatus = "waiting" | "running" | "complete" | "error" | "not_configured"

export type ToolSource = "gemini" | "mongodb" | "vector" | "system"

// ─────────────────────────────────────────────────────────────────────────────
// TicketGuard — ticket-resale scam investigation (mock-mode types)
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW"

/** A single extracted signal from the pasted listing/DM. */
export interface Entity {
  /** e.g. "Price", "Seller", "Domain", "Payment", "Urgency" */
  kind: string
  value: string
  /** true when this signal pushes risk up (shown amber/red), false = reassuring */
  flagged: boolean
}

/** One matched scam-pattern row from the hybrid (vector + full-text) search. */
export interface HybridMatch {
  /** Human label for the pattern, e.g. "Irreversible payment (Zelle)" */
  label: string
  patternType: string
  /** Short synthetic example excerpt from the corpus this matched against. */
  excerpt: string
  /** Vector-search contribution to the blended score, 0–1. */
  vectorScore: number
  /** Full-text-search contribution to the blended score, 0–1. */
  textScore: number
  /** Blended relevance score, 0–1. */
  score: number
}

/** A piece of evidence surfaced on the verdict card. */
export interface EvidenceChip {
  label: string
  why: string
  vectorScore: number
  textScore: number
}

/** Result of the deterministic official-transfer rule check. */
export interface RuleCheck {
  passed: boolean
  note: string
}

/** The full canned investigation returned by the mock engine. */
export interface Investigation {
  inputText: string
  entities: Entity[]
  matches: HybridMatch[]
  riskScore: number
  riskLevel: RiskLevel
  rule: RuleCheck
  rationale: string
  evidence: EvidenceChip[]
}

/** An item in the "Recently reported" live feed (mock change stream). */
export interface FeedItem {
  id: string
  excerpt: string
  riskLevel: RiskLevel
  handle: string
  /** epoch ms when reported */
  reportedAt: number
  /** marks a freshly-streamed-in item so the UI can pulse it */
  isLive?: boolean
}

/** Headline evaluation numbers shown on the hero + about strip. */
export interface EvalMetrics {
  recall: number
  corpusSize: number
  patternsTracked: number
  medianLatencyMs: number
}

export interface ToolActivity {
  tool: string
  source: ToolSource
  preview: string
}

export interface AgentStep {
  stepNumber: number
  name: string
  status: StepStatus
  data?: Record<string, unknown>
  startedAt?: number
  completedAt?: number
  tool: ToolSource
  activity?: ToolActivity[]
  /** "mock" → render the canned 5-step bodies; "real" → render backend step
   *  bodies (8 steps, honest not_configured handling). Defaults to "mock". */
  kind?: "mock" | "real"
  /** Short worker/specialist label shown under the step title (real mode). */
  worker?: string
  /** Reason text for a not_configured / error step (honest, not faked). */
  reason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL backend contract (TicketGuard FastAPI). These mirror the exact shapes
// emitted by backend/main.py + pipeline.py + db.py. The mapping layer
// (lib/realmap.ts) translates these into the mock-shaped UI types above so the
// premium components render unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export type Verdict = "SCAM" | "SUSPICIOUS" | "LIKELY-LEGIT"

/** GET /api/health */
export interface HealthResponse {
  status: string
  service?: string
  model?: string
  gemini_backend?: string
  gemini: boolean
  atlas: boolean
  mcp: boolean
  gmail: boolean
  cluster_version: string | null
  rankfusion_capable: boolean
  vector_index: boolean
  text_index: boolean
  atlas_error: string | null
}

/** A single per-step SSE frame from POST /api/investigate. */
export interface StepFrame {
  step: number
  name: string
  status: "running" | "complete" | "not_configured" | "error"
  data?: Record<string, unknown>
  error?: string
}

/** A tool-activity SSE frame. */
export interface ToolFrame {
  type: "tool"
  step: number
  tool: string
  source: string
}

/** The terminal (step 99) finalize frame. */
export interface FinalizeFrame {
  step: 99
  name: string
  status: "complete" | "error"
  data?: {
    verdict?: Verdict
    confidence?: number
    investigation_id?: string
    risk_score?: number | null
    engine?: string
  }
  error?: string
}

export type InvestigateFrame = StepFrame | ToolFrame | FinalizeFrame

/** Normalized listing object (step 1 data.listing). */
export interface RealListing {
  price: number | null
  face_value: number | null
  currency: string | null
  quantity: number | null
  payment_method: string | null
  transfer_method: string | null
  seller_handle: string | null
  domain: string
  event: string | null
  urgency_cues: string[]
  barcode_or_ref: string | null
}

/** One fused hybrid-retrieval hit (step 2 data.results[]). */
export interface RealRetrievalHit {
  text?: string
  label?: string
  risk?: string
  pattern_type?: string
  source_pattern?: string
  vector_score?: number | null
  text_score?: number | null
  fused_score?: number
  contribution?: string
}

/** The Gemini verdict bundle (step 7 data). */
export interface RealVerdict {
  verdict: Verdict
  confidence: number
  evidence: string[]
  reasoning: string
}

/** A scam report document echoed by GET /api/feed. */
export interface RealReport {
  text: string
  domain?: string
  handle?: string
  pattern_type?: string
  payment_method?: string
  barcode_or_ref?: string
  reporter?: string
  created_at?: string
}

/** The request body for POST /api/investigate. */
export type InvestigateRequestBody =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | {
      type: "pdf" | "image"
      file_b64: string
      filename: string
      content_type: string
    }

export interface BusinessPlan {
  _id: string
  idea: string
  created_at: string
  status: "generating" | "complete" | "failed"
  share_token?: string
  validation?: {
    viable: boolean
    viability_score: number
    one_line_summary: string
    target_market: string
    main_concerns: string[]
    core_problem_solved: string
  }
  market_research?: {
    market_size: string
    growth_rate: string
    top_competitors: Array<{ name: string; weakness: string }>
    market_gap: string
    opportunity_score: number
  }
  personas?: Array<{
    name: string
    age: string
    job: string
    pain_point: string
    willingness_to_pay: string
    how_they_find_us: string
  }>
  engine?: string
  business_plan?: {
    problem: string
    solution: string
    unique_value_proposition: string
    revenue_model: string
    revenue_streams: string[]
    go_to_market: string
    key_milestones?: Array<{ month: number; milestone: string }>
  }
  action_items?: {
    next_30_days: string[]
    next_60_days: string[]
    next_90_days: string[]
    investor_one_liner: string
    recommended_kpis: string[]
  }
  qa_review?: {
    overall_score: number
    investment_ready: boolean
    strengths: string[]
    weaknesses: string[]
    verdict: string
  }
  financials?: {
    year1_revenue: string
    year2_revenue: string
    year3_revenue: string
    startup_cost: string
    monthly_burn: string
    break_even_month: number
    funding_needed: string
  }
  risks?: {
    risks: Array<{ risk: string; severity: "High"|"Medium"|"Low"; mitigation: string }>
    swot: {
      strengths: string[]
      weaknesses: string[]
      opportunities: string[]
      threats: string[]
    }
  }
}
