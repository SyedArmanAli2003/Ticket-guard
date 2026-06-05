// Lightweight, premium animated backdrop — layered aurora + technical grid +
// film grain + vignette. Pure CSS (no WebGL): fast, original, no scroll jank.
// `teal` swaps the violet aurora for an emerald "trust" palette (TicketGuard).
export default function PremiumBackground({ teal = false }: { teal?: boolean }) {
  return (
    <>
      <div className={`bg-aurora${teal ? " teal" : ""}`} aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="bg-grid" aria-hidden />
      <div className="bg-grain" aria-hidden />
      <div className="bg-vignette" aria-hidden />
    </>
  )
}
