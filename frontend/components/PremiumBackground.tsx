// Lightweight, premium animated backdrop — layered aurora + technical grid +
// film grain + vignette. Pure CSS (no WebGL): fast, original, no scroll jank.
export default function PremiumBackground() {
  return (
    <>
      <div className="bg-aurora" aria-hidden>
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
