// ─────────────────────────────────────────────────────────────────────────────
// TicketGuard — self-contained MOCK engine.
//
// Everything in this file runs with NO network and NO backend. Given a pasted
// listing / seller DM, `investigate()` returns a deterministic, evidence-backed
// investigation whose verdict varies (HIGH / MEDIUM / LOW) based on simple
// keyword heuristics over the input — so different examples feel responsive.
//
// All example content is SYNTHETIC and is themed around generic "major-event"
// / "2026 World Cup" resale (no trademarked logos or real sellers).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Entity,
  EvalMetrics,
  EvidenceChip,
  FeedItem,
  HybridMatch,
  Investigation,
  RiskLevel,
  RuleCheck,
} from "./types"

// ── Headline eval numbers (shown on hero + about strip) ──────────────────────
export const EVAL: EvalMetrics = {
  recall: 0.94, // "caught 94% of seeded scams"
  corpusSize: 2480,
  patternsTracked: 14,
  medianLatencyMs: 3900,
}

// ── Try-an-example listings (synthetic; drawn from the scam corpus) ──────────
export interface SampleListing {
  id: string
  label: string
  expected: RiskLevel
  text: string
}

export const SAMPLE_LISTINGS: SampleListing[] = [
  {
    id: "zelle-belowface",
    label: "Below-face Zelle DM",
    expected: "HIGH",
    text: "Selling 2 lower-bowl seats for the 2026 World Cup opening match, face value was $350 each but I'll let them go for $120 each. Send payment via Zelle to secure them fast, I can't do any meetups.",
  },
  {
    id: "crypto-urgency",
    label: "Crypto + urgency",
    expected: "HIGH",
    text: "DM me for 2026 match tickets! I send you the QR code first as proof, then you pay $150 in BTC. Great deal, only 3 left — must buy in the next 2 hours or the price goes up.",
  },
  {
    id: "lookalike-domain",
    label: "Look-alike site",
    expected: "HIGH",
    text: "Official resale via tikcetmaster-resale.test — grab your 2026 match tickets before they sell out! Same as the real site but better prices. Enter your card to secure instantly.",
  },
  {
    id: "giftcard-account",
    label: "Gift-card 'verify'",
    expected: "HIGH",
    text: "Your account was flagged for unusual activity. Send $75 in Google Play cards to verify and unlock your two 2026 tickets before they expire. Reply within 1 hour.",
  },
  {
    id: "cash-meetup",
    label: "Local cash meetup",
    expected: "MEDIUM",
    text: "Selling 4 group seats for the match. Cash payment only at a meetup in a public place. Face value $150 each. Can also use a credit card on a verified marketplace.",
  },
  {
    id: "official-transfer",
    label: "Official-app transfer",
    expected: "LOW",
    text: "Selling 2 tickets at face value $310 each. Will use the official transfer app, payment via PayPal Goods & Services for buyer protection. Happy to transfer before you pay.",
  },
]

// ── Keyword dictionaries used by the heuristic ───────────────────────────────
const IRREVERSIBLE_PAY = [
  "zelle", "cashapp", "cash app", "gift card", "giftcard", "google play",
  "itunes", "amazon gift", "crypto", "bitcoin", "btc", "eth", "usdt",
  "wire", "venmo friends", "venmo f&f", "f&f", "friends and family",
  "bank transfer",
]
const SAFE_PAY = [
  "official app", "official transfer", "paypal goods", "paypal g&s",
  "goods & services", "goods and services", "verified marketplace",
  "resale platform", "buyer protection", "buyer guarantee", "credit card",
  "official resale", "verified seller", "platform checkout",
]
const URGENCY = [
  "urgent", "hurry", "fast", "asap", "act fast", "last chance", "only",
  "within", "expire", "expires", "today", "right now", "limited time",
  "before they", "sell out", "selling out", "first come", "miss out",
  "time sensitive", "next 2 hours", "30 min",
]
const BELOW_FACE = [
  "below face", "below cost", "below market", "% off", "percent off",
  "half price", "50% off", "mega deal", "huge discount", "lowest fees",
  "great deal", "discount",
]
const NO_OFFICIAL = [
  "can't do meetup", "cant do meetup", "no meetup", "no meetups",
  "email the pdf", "email you the pdf", "send the pdf", "mail the ticket",
  "won't use", "wont use", "can't use the app", "cant use the app",
  "no app", "screenshot", "qr code first", "barcode first",
]
const ADVANCE_FEE = [
  "reservation fee", "holding fee", "processing fee", "service fee",
  "deposit", "pay half now", "advance", "upfront", "to unlock", "to release",
  "to verify", "priority access", "waitlist",
]

// quick crude price extraction: "$120", "$1,200"
const PRICE_RE = /\$\s?\d[\d,]*/g
const HANDLE_RE = /@[a-z0-9_]+/i
const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*\.(?:test|xyz|shop|online|site|info|top|live)\b/i

function countHits(haystack: string, needles: string[]): { n: number; hits: string[] } {
  const hits: string[] = []
  for (const w of needles) if (haystack.includes(w)) hits.push(w)
  return { n: hits.length, hits }
}

/** True when two+ prices appear and the lowest is ≥25% below the highest. */
function detectPriceGap(prices: string[]): boolean {
  if (prices.length < 2) return false
  const nums = prices
    .map(p => Number(p.replace(/[^0-9.]/g, "")))
    .filter(n => Number.isFinite(n) && n > 0)
  if (nums.length < 2) return false
  const hi = Math.max(...nums)
  const lo = Math.min(...nums)
  return hi > 0 && (hi - lo) / hi >= 0.25
}

function titleCasePay(raw: string): string {
  const map: Record<string, string> = {
    zelle: "Zelle", cashapp: "Cash App", "cash app": "Cash App",
    "gift card": "gift cards", giftcard: "gift cards", "google play": "Google Play cards",
    itunes: "iTunes cards", crypto: "crypto", bitcoin: "Bitcoin", btc: "Bitcoin (BTC)",
    eth: "Ethereum", usdt: "USDT", wire: "wire transfer",
    "venmo friends": "Venmo F&F", "venmo f&f": "Venmo F&F", "f&f": "Venmo F&F",
    "friends and family": "Venmo F&F", "bank transfer": "bank transfer",
  }
  return map[raw] || raw
}

// ── Pattern library: each candidate match the "hybrid search" can surface ────
interface PatternDef {
  key: string
  label: string
  patternType: string
  excerpt: string
  why: string
  // base contributions; the engine perturbs these slightly per-input
  vector: number
  text: number
}

const PATTERNS: Record<string, PatternDef> = {
  irreversible: {
    key: "irreversible",
    label: "Irreversible payment method",
    patternType: "off_platform_payment",
    excerpt: "“Send payment via Zelle to secure them fast, I can't do any meetups.”",
    why: "Payment rail offers no chargeback or buyer protection.",
    vector: 0.71, text: 0.29,
  },
  belowFace: {
    key: "belowFace",
    label: "Price far below face value",
    patternType: "too_good_price",
    excerpt: "“Face value was $350 each but I'll let them go for $120 each.”",
    why: "Dramatic underpricing is a documented bait for ticket fraud.",
    vector: 0.66, text: 0.34,
  },
  urgency: {
    key: "urgency",
    label: "High-pressure urgency cues",
    patternType: "urgency_pressure",
    excerpt: "“Only 3 left — must buy in the next 2 hours or the price goes up.”",
    why: "Artificial time pressure is used to stop buyers from verifying.",
    vector: 0.58, text: 0.42,
  },
  lookalike: {
    key: "lookalike",
    label: "Look-alike ticketing domain",
    patternType: "lookalike_domain",
    excerpt: "“Official resale via tikcetmaster-resale.test — same as the real site.”",
    why: "Misspelled domains mimic official sellers to harvest payments.",
    vector: 0.74, text: 0.26,
  },
  noTransfer: {
    key: "noTransfer",
    label: "Refuses official digital transfer",
    patternType: "no_official_transfer",
    excerpt: "“I won't use the official app — I'll just email you the ticket PDF.”",
    why: "Major-event tickets are digital-only via the official app.",
    vector: 0.63, text: 0.37,
  },
  advanceFee: {
    key: "advanceFee",
    label: "Advance / 'unlock' fee",
    patternType: "advance_fee",
    excerpt: "“Pay a $75 fee to verify and unlock your tickets before they expire.”",
    why: "Upfront fees before delivery are a textbook advance-fee scam.",
    vector: 0.6, text: 0.4,
  },
  duplicate: {
    key: "duplicate",
    label: "Screenshot / barcode 'proof'",
    patternType: "duplicate_barcode",
    excerpt: "“I'll send the QR code first as proof, then you pay.”",
    why: "A barcode image is not ownership and can be sold many times.",
    vector: 0.69, text: 0.31,
  },
  // the reassuring counter-pattern, surfaced for LOW-risk inputs
  official: {
    key: "official",
    label: "Official transfer + protected payment",
    patternType: "no_official_transfer",
    excerpt: "“Will use the official transfer app, payment via PayPal Goods & Services.”",
    why: "Matches the safest known resale pathway in the corpus.",
    vector: 0.7, text: 0.3,
  },
}

// deterministic 0–1 jitter from a string so re-runs are stable
function seededJitter(seed: string, spread = 0.06): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = (h >>> 0) / 4294967295 // 0..1
  return (u - 0.5) * 2 * spread // -spread..spread
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function makeMatch(p: PatternDef, seed: string): HybridMatch {
  const jv = seededJitter(p.key + seed, 0.05)
  const vector = clamp01(p.vector + jv)
  const text = clamp01(p.text - jv)
  // blended relevance: weighted toward vector, lightly compressed
  const score = clamp01(0.55 * vector + 0.45 * text + 0.18)
  return {
    label: p.label,
    patternType: p.patternType,
    excerpt: p.excerpt,
    vectorScore: round2(vector),
    textScore: round2(text),
    score: round2(score),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── The core engine ──────────────────────────────────────────────────────────
export function investigate(rawInput: string): Investigation {
  const text = (rawInput || "").toLowerCase()
  const seed = String(rawInput.length) + (rawInput.slice(0, 12) || "")

  const irr = countHits(text, IRREVERSIBLE_PAY)
  const safe = countHits(text, SAFE_PAY)
  const urg = countHits(text, URGENCY)
  const cheap = countHits(text, BELOW_FACE)
  const noOff = countHits(text, NO_OFFICIAL)
  const adv = countHits(text, ADVANCE_FEE)
  const domainMatch = rawInput.match(DOMAIN_RE)
  const handleMatch = rawInput.match(HANDLE_RE)
  const prices = rawInput.match(PRICE_RE) || []

  // Infer "below face value" from a price gap even when not stated literally,
  // e.g. "face value was $350 ... I'll let them go for $120".
  const priceGap = detectPriceGap(prices)
  const belowFaceSignal = cheap.n > 0 || priceGap

  // Does the seller actually offer official in-app digital transfer?
  const usesOfficial =
    text.includes("official app") || text.includes("official transfer") ||
    text.includes("digital transfer") || text.includes("through the app") ||
    text.includes("transfer app") || text.includes("member transfer") ||
    text.includes("transfer portal")

  // In-person / cash handoff without an official digital transfer — the corpus
  // treats these as moderate risk (no buyer protection, but not an obvious scam).
  const cashInPerson =
    (text.includes("cash") || text.includes("meetup") || text.includes("meet up") ||
     text.includes("in person") || text.includes("in-person") || text.includes("handoff")) &&
    !usesOfficial

  // ── Weighted risk score (0–100) ──
  let score = 20 // baseline uncertainty
  score += irr.n > 0 ? 24 + (irr.n - 1) * 9 : 0          // irreversible payment is the strongest single signal
  score += belowFaceSignal ? (priceGap ? 17 : 12) : 0    // far-below-face pricing
  score += urg.n >= 1 ? 9 + (urg.n - 1) * 4 : 0          // urgency / pressure
  score += noOff.n * 12                                  // explicit refusal of official transfer
  score += adv.n * 16                                    // advance / "unlock" fee
  if (domainMatch) score += 40                           // look-alike / unverified domain (top fraud vector)
  if (cashInPerson) score += 22                          // no official transfer, cash/in-person only
  // classic multi-signal scam fingerprints stack a little extra
  if (irr.n > 0 && (urg.n > 0 || belowFaceSignal)) score += 8

  // reassuring signals — only meaningfully reduce risk when paired with an
  // official transfer path and no irreversible-payment / domain red flags
  if (irr.n === 0 && !domainMatch && !cashInPerson) {
    score -= safe.n * 9
    if (usesOfficial && safe.n >= 1) score -= 14 // official transfer + protected payment reads safe
  } else if (irr.n === 0 && !domainMatch && cashInPerson) {
    // cash/in-person: a verified-marketplace mention is aspirational, not the
    // actual method — give only a small benefit so it lands in MEDIUM
    score -= Math.min(safe.n, 1) * 5
  } else {
    // a stray "credit card" mention next to red flags shouldn't excuse them
    score -= Math.min(safe.n, 1) * 4
  }
  score = Math.round(Math.max(2, Math.min(98, score)))

  const level: RiskLevel = score >= 65 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW"

  // ── Entities ──
  const entities: Entity[] = []
  if (prices.length) {
    entities.push({
      kind: "Price",
      value: prices.slice(0, 2).join(" → "),
      flagged: belowFaceSignal,
    })
  }
  if (handleMatch) {
    entities.push({ kind: "Seller", value: handleMatch[0], flagged: level === "HIGH" })
  }
  if (domainMatch) {
    entities.push({ kind: "Domain", value: domainMatch[0], flagged: true })
  }
  if (irr.n > 0) {
    entities.push({
      kind: "Payment",
      value: titleCasePay(irr.hits[0]),
      flagged: true,
    })
  } else if (safe.n > 0) {
    const safeLabel = text.includes("paypal goods") || text.includes("goods & services")
      ? "PayPal Goods & Services"
      : text.includes("official app") || text.includes("official transfer")
      ? "Official app transfer"
      : "Credit card (verified)"
    entities.push({ kind: "Payment", value: safeLabel, flagged: false })
  }
  if (urg.n > 0) {
    entities.push({ kind: "Urgency", value: `${urg.n} pressure cue${urg.n > 1 ? "s" : ""}`, flagged: true })
  }
  if (entities.length === 0) {
    entities.push({ kind: "Signal", value: "No strong indicators parsed", flagged: false })
  }

  // ── Choose 3 hybrid matches based on which signals fired ──
  const chosen: PatternDef[] = []
  const push = (p: PatternDef) => { if (!chosen.find(c => c.key === p.key)) chosen.push(p) }

  if (level === "LOW") {
    push(PATTERNS.official)
    if (noOff.n > 0) push(PATTERNS.noTransfer)
    push(PATTERNS.belowFace)
    push(PATTERNS.urgency)
  } else {
    if (irr.n > 0) push(PATTERNS.irreversible)
    if (domainMatch) push(PATTERNS.lookalike)
    if (belowFaceSignal) push(PATTERNS.belowFace)
    if (adv.n > 0) push(PATTERNS.advanceFee)
    if (noOff.n > 0) push(PATTERNS.noTransfer)
    if (text.includes("qr") || text.includes("barcode") || text.includes("screenshot")) push(PATTERNS.duplicate)
    if (urg.n > 0) push(PATTERNS.urgency)
    // backfill so we always surface 3
    push(PATTERNS.irreversible); push(PATTERNS.urgency); push(PATTERNS.noTransfer)
  }
  const top3 = chosen.slice(0, 3)
  const matches = top3
    .map(p => makeMatch(p, seed))
    .sort((a, b) => b.score - a.score)

  // ── Official-transfer rule ──
  const refusesOfficial = noOff.n > 0 || (irr.n > 0 && !usesOfficial)
  const rule: RuleCheck = usesOfficial && !refusesOfficial
    ? {
        passed: true,
        note: "Seller offers official digital transfer — the only sanctioned method for major-event tickets.",
      }
    : {
        passed: false,
        note: domainMatch
          ? "No official in-app transfer; routes payment to an unverified external site."
          : irr.n > 0
          ? `No official in-app transfer; relies on ${titleCasePay(irr.hits[0])} instead of the official app.`
          : "Official in-app digital transfer was not offered. Legitimate major-event tickets transfer only via the official app.",
      }

  // ── Rationale (risk-signal language, never accusatory) ──
  const rationale = buildRationale(level, { irr, cheap, urg, noOff, adv, domainMatch: !!domainMatch, safe })

  // ── Evidence chips (top matches → why) ──
  const evidence: EvidenceChip[] = matches.map(m => ({
    label: m.label,
    why: PATTERNS[keyForLabel(m.label)]?.why ?? "Consistent with a known resale-fraud pattern.",
    vectorScore: m.vectorScore,
    textScore: m.textScore,
  }))

  return {
    inputText: rawInput,
    entities,
    matches,
    riskScore: score,
    riskLevel: level,
    rule,
    rationale,
    evidence,
  }
}

function keyForLabel(label: string): string {
  const entry = Object.values(PATTERNS).find(p => p.label === label)
  return entry?.key ?? "irreversible"
}

interface Counts {
  irr: { n: number; hits: string[] }
  cheap: { n: number; hits: string[] }
  urg: { n: number; hits: string[] }
  noOff: { n: number; hits: string[] }
  adv: { n: number; hits: string[] }
  domainMatch: boolean
  safe: { n: number; hits: string[] }
}

function buildRationale(level: RiskLevel, c: Counts): string {
  if (level === "LOW") {
    return "Consistent with known safe-resale patterns: official digital transfer and a protected payment method, with no high-risk indicators detected."
  }
  const signals: string[] = []
  if (c.domainMatch) signals.push("an unverified look-alike domain")
  if (c.irr.n > 0) signals.push(`payment via ${titleCasePay(c.irr.hits[0])}`)
  if (c.cheap.n > 0) signals.push("pricing well below face value")
  if (c.adv.n > 0) signals.push("an upfront fee before delivery")
  if (c.noOff.n > 0) signals.push("no official digital transfer")
  if (c.urg.n > 0) signals.push("high-pressure urgency")
  const lead = level === "HIGH"
    ? "Multiple high-risk indicators detected, consistent with known scam patterns"
    : "Some elevated-risk indicators detected"
  const tail = signals.length
    ? `: ${signals.slice(0, 3).join(", ")}.`
    : "."
  return `${lead}${tail}`
}

// ── Seed "Recently reported" feed (mock change stream) ───────────────────────
export function seedFeed(now = Date.now()): FeedItem[] {
  const min = 60_000
  return [
    {
      id: "seed-1",
      excerpt: "“…$99 each for seats worth $500. Pay CashApp now or miss out forever.”",
      riskLevel: "HIGH",
      handle: "@mega_deal_last",
      reportedAt: now - 2 * min,
    },
    {
      id: "seed-2",
      excerpt: "“Resale via seatgeek-deals.test — lowest fees in the market.”",
      riskLevel: "HIGH",
      handle: "—",
      reportedAt: now - 9 * min,
    },
    {
      id: "seed-3",
      excerpt: "“Cash only at a public meetup, $150 face. Can also use a verified marketplace.”",
      riskLevel: "MEDIUM",
      handle: "@local_tix_guy",
      reportedAt: now - 23 * min,
    },
    {
      id: "seed-4",
      excerpt: "“Pay a $50 reservation fee first to hold your seats. Wire only.”",
      riskLevel: "HIGH",
      handle: "@reserve_seats_official",
      reportedAt: now - 41 * min,
    },
    {
      id: "seed-5",
      excerpt: "“Official transfer app, payment via PayPal G&S. Face value.”",
      riskLevel: "LOW",
      handle: "@honest_resale_22",
      reportedAt: now - 68 * min,
    },
  ]
}

// Build a feed item from a completed investigation (used by [Report listing]).
export function feedItemFromInvestigation(inv: Investigation, now = Date.now()): FeedItem {
  const handleMatch = inv.entities.find(e => e.kind === "Seller")?.value
  const domain = inv.entities.find(e => e.kind === "Domain")?.value
  const trimmed = inv.inputText.trim().replace(/\s+/g, " ")
  const excerpt = `“${trimmed.length > 96 ? trimmed.slice(0, 96) + "…" : trimmed}”`
  return {
    id: `rpt-${now}`,
    excerpt,
    riskLevel: inv.riskLevel,
    handle: handleMatch || domain || "—",
    reportedAt: now,
    isLive: true,
  }
}

// Relative-time formatter for feed timestamps.
export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}
