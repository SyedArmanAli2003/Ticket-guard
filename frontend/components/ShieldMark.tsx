// Original TicketGuard hero mark — a shield fused with a ticket stub + an
// agent "scan" sweep. Pure SVG/CSS, no trademarked art. Decorative only.
export default function ShieldMark() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "clamp(120px, 22vw, 168px)",
        height: "clamp(120px, 22vw, 168px)",
        margin: "0 auto",
      }}
    >
      {/* soft emerald glow behind the mark */}
      <div
        style={{
          position: "absolute",
          inset: "-30%",
          background:
            "radial-gradient(circle at 50% 45%, rgba(16,185,129,0.34), transparent 62%)",
          filter: "blur(10px)",
        }}
      />
      <svg
        viewBox="0 0 120 120"
        width="100%"
        height="100%"
        fill="none"
        style={{ position: "relative", display: "block" }}
      >
        <defs>
          <linearGradient id="tgShield" x1="22" y1="10" x2="98" y2="112" gradientUnits="userSpaceOnUse">
            <stop stopColor="hsl(162,84%,46%)" />
            <stop offset="0.55" stopColor="hsl(170,78%,40%)" />
            <stop offset="1" stopColor="hsl(190,80%,42%)" />
          </linearGradient>
          <linearGradient id="tgShieldFill" x1="60" y1="14" x2="60" y2="108" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(16,185,129,0.16)" />
            <stop offset="1" stopColor="rgba(13,148,136,0.04)" />
          </linearGradient>
          <linearGradient id="tgSweep" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="rgba(110,231,183,0)" />
            <stop offset="0.5" stopColor="rgba(110,231,183,0.55)" />
            <stop offset="1" stopColor="rgba(110,231,183,0)" />
          </linearGradient>
          <clipPath id="tgClip">
            <path d="M60 12 22 24v30c0 23 16 41 38 50 22-9 38-27 38-50V24L60 12Z" />
          </clipPath>
        </defs>

        {/* shield body */}
        <path
          d="M60 12 22 24v30c0 23 16 41 38 50 22-9 38-27 38-50V24L60 12Z"
          fill="url(#tgShieldFill)"
          stroke="url(#tgShield)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />

        {/* ticket-stub motif inside the shield (dashed perforation + notches) */}
        <g clipPath="url(#tgClip)" opacity="0.92">
          <rect x="36" y="50" width="48" height="26" rx="5"
            fill="rgba(8,20,18,0.55)" stroke="rgba(110,231,183,0.45)" strokeWidth="1.4" />
          <line x1="60" y1="51" x2="60" y2="75" stroke="rgba(110,231,183,0.5)"
            strokeWidth="1.4" strokeDasharray="2 3" />
          <circle cx="60" cy="50" r="3" fill="hsl(240,28%,3.5%)" stroke="rgba(110,231,183,0.45)" strokeWidth="1.2" />
          <circle cx="60" cy="76" r="3" fill="hsl(240,28%,3.5%)" stroke="rgba(110,231,183,0.45)" strokeWidth="1.2" />
          {/* tiny barcode on the left stub */}
          <g stroke="rgba(110,231,183,0.6)" strokeWidth="1.2">
            <line x1="41" y1="57" x2="41" y2="69" />
            <line x1="44" y1="57" x2="44" y2="69" />
            <line x1="48" y1="57" x2="48" y2="69" />
            <line x1="51" y1="57" x2="51" y2="69" />
            <line x1="55" y1="57" x2="55" y2="69" />
          </g>

          {/* animated agent scan sweep */}
          <rect className="tg-sweep" x="22" y="-30" width="76" height="30" fill="url(#tgSweep)" />
        </g>

        {/* verified check, sitting above the stub */}
        <path
          d="M48 36.5 56 44.5 74 25.5"
          stroke="hsl(150,90%,62%)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(52,211,153,0.55))" }}
        />
      </svg>

      <style>{`
        @keyframes tgSweepMove {
          0%   { transform: translateY(0); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateY(150px); opacity: 0; }
        }
        .tg-sweep { animation: tgSweepMove 3.2s cubic-bezier(0.4,0,0.2,1) infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .tg-sweep { animation: none; opacity: 0; } }
      `}</style>
    </div>
  )
}
