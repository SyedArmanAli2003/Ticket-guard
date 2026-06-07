"use client"
// ─────────────────────────────────────────────────────────────────────────────
// TicketGuard — "Deep Field" backdrop.
//
// A hand-crafted, calm, expensive composition that intentionally avoids the
// overused mesh-blob cliché. Five restrained layers, theme-aware via tokens:
//
//   1. base wash ...... a soft "lit-from-within" depth gradient (not flat grey)
//   2. brand bloom .... ONE large, very soft emerald/teal radial glow, anchored
//                       off-centre and drifting almost imperceptibly
//   3. contour field .. a faint topographic line set (the distinctive signature),
//                       slow parallax drift — organic, map-like, hand-designed
//   4. dot field ...... a whisper-faint dotted constellation, radially masked
//                       (premium "engineered" texture, not graph-paper grid)
//   5. grain+vignette . fine film grain + a soft focus vignette for depth
//
// All motion is transform/opacity only (GPU-composited, 60fps) and fully gated by
// prefers-reduced-motion in globals.css. Every layer is aria-hidden + non-
// interactive. `glow` strengthens the central bloom (used behind the hero shield).
//
// RENDERED VIA PORTAL into <body>: this guarantees the `position: fixed` layers
// are never trapped by a transformed ancestor (e.g. the route-transition wrapper
// or any framer-motion container), so the backdrop always pins to the viewport.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

export default function PremiumBackground({
  glow = false,
}: {
  /** kept for API compatibility with existing call sites */
  teal?: boolean
  /** strengthen the central bloom (hero) */
  glow?: boolean
}) {
  // Portal target is only available on the client; render nothing during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div className="tg-field" aria-hidden>
      {/* 1 — base depth wash */}
      <div className="tg-field__wash" />

      {/* 2 — single restrained brand bloom (drifts) */}
      <div className={`tg-field__bloom${glow ? " is-hero" : ""}`} />
      {/* a second, cooler counter-bloom anchored low-right for layered depth */}
      <div className="tg-field__bloom-2" />

      {/* 3 — topographic contour signature (slow parallax) */}
      <svg
        className="tg-field__contours"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g className="tg-field__contours-inner" stroke="var(--tg-contour-line)" strokeWidth="1">
          {/* nested, organic, non-concentric contour rings hinting at a "scan field" */}
          <path d="M-120 340C140 250 360 470 560 430 760 390 900 210 1140 250 1320 280 1460 200 1620 240" />
          <path d="M-120 420C160 330 380 540 600 500 820 460 950 300 1180 330 1360 355 1480 290 1620 320" />
          <path d="M-120 500C180 420 400 610 640 570 880 530 1000 390 1220 410 1400 427 1500 380 1620 400" />
          <path d="M-120 590C200 520 430 690 680 650 930 610 1050 490 1260 505 1440 518 1520 480 1620 495" />
          <path d="M-120 690C220 630 460 770 720 735 980 700 1100 600 1300 612 1480 623 1540 595 1620 605" />
          <path d="M-120 250C120 180 320 380 520 350 720 320 880 160 1100 195 1290 224 1450 150 1620 185" />
        </g>
      </svg>

      {/* 4 — dotted constellation field (radially masked) */}
      <div className="tg-field__dots" />

      {/* 5 — film grain + focus vignette */}
      <div className="tg-field__grain" />
      <div className="tg-field__vignette" />
    </div>,
    document.body
  )
}
