// Lightweight, premium animated backdrop — layered gradient-mesh aurora +
// drifting technical grid + film grain + vignette, all pure CSS (no WebGL):
// fast, original, 60fps (transform/opacity only), and fully gated by
// prefers-reduced-motion in globals.css.
//
// `teal` swaps the violet mesh for an emerald "trust" palette (TicketGuard).
// `glow` paints a soft central halo (used behind the hero shield).
export default function PremiumBackground({
  teal = false,
  glow = false,
}: {
  teal?: boolean
  glow?: boolean
}) {
  return (
    <>
      <div className={`bg-aurora${teal ? " teal" : ""}`} aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="blob b4" />
      </div>
      <div className="bg-grid" aria-hidden />
      {glow && (
        <div
          aria-hidden
          className="glow-breathe"
          style={{
            position: "fixed",
            zIndex: 0,
            top: "14vh",
            left: "50%",
            width: "min(620px, 84vw)",
            height: "min(620px, 84vw)",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 50% 45%, var(--tg-accent-tint-2), var(--tg-accent-tint) 25%, transparent 60%)",
            opacity: 0.8,
          }}
        />
      )}
      <div className="bg-grain" aria-hidden />
      <div className="bg-vignette" aria-hidden />
    </>
  )
}
