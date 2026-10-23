// Beera, the assistant's face: the RakshaSutra shield, which changes with how the child is doing.
// A calm tick when all is well, an amber siren when something is worth a look, and a harder-pulsing red siren when it is not.
import { useId } from "react";

/** The states the shield can show. (The names stay "moods" so every screen that shows Beera keeps working.) */
export type BeeraMood = "happy" | "curious" | "worried" | "listening" | "cheer";

const LABEL: Record<BeeraMood, string> = {
  happy: "All is well",
  curious: "Worth a look",
  worried: "Needs you now",
  listening: "Listening",
  cheer: "Good news",
};

// Each state has its own colour, pulse speed and symbol, so it reads at a glance even when tiny.
const LOOK: Record<BeeraMood, { from: string; to: string; ring: string; pulse: string }> = {
  happy: { from: "#56c596", to: "#2f9e72", ring: "#56c596", pulse: "3.4s" },
  cheer: { from: "#56c596", to: "#2f9e72", ring: "#a6e3a1", pulse: "1.8s" },
  listening: { from: "#b992f7", to: "#8b5fe0", ring: "#cba6f7", pulse: "1.6s" },
  curious: { from: "#ffb84d", to: "#ef8a14", ring: "#ffb84d", pulse: "1.3s" },
  worried: { from: "#ff6b81", to: "#d62a43", ring: "#ff6b81", pulse: "0.75s" },
};

/** A four-point sparkle, used on good news. */
const sparkle = (x: number, y: number, s: number, key: string) => (
  <path key={key} className="spark" d={`M${x} ${y - s} Q${x + s * 0.22} ${y - s * 0.22} ${x + s} ${y} Q${x + s * 0.22} ${y + s * 0.22} ${x} ${y + s} Q${x - s * 0.22} ${y + s * 0.22} ${x - s} ${y} Q${x - s * 0.22} ${y - s * 0.22} ${x} ${y - s}Z`} fill="#fff8d6" stroke="#f5b700" strokeWidth="1.2" />
);

/**
 * The status shield. The outline is the app's logo; inside it the symbol follows what is happening:
 * a tick (all well, a sparkle burst on good news), sound bars (listening), a siren (worth a look), and a larger, faster,
 * red siren (needs you now). Pulsing rings make it feel alive, and pulse faster as the situation gets more serious.
 */
export function Beera({ mood = "happy", size = 96, className = "" }: { mood?: BeeraMood; size?: number; className?: string }) {
  const id = useId();
  const grad = `${id}-grad`;
  const look = LOOK[mood];
  const siren = mood === "curious" || mood === "worried";

  return (
    <svg
      className={`beera shield ${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={LABEL[mood]}
      style={{ ["--pulse" as string]: look.pulse, ["--ring" as string]: look.ring }}
    >
      <defs>
        <linearGradient id={grad} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={look.from} />
          <stop offset="1" stopColor={look.to} />
        </linearGradient>
      </defs>

      {/* the scanner: a dot that keeps circling the shield, as if checking where the child is */}
      <circle cx="60" cy="62" r="55" fill="none" stroke={look.ring} strokeOpacity="0.22" strokeWidth="1.6" strokeDasharray="2 5" />
      <g className="orbit">
        <circle cx="60" cy="7" r="4.4" fill={look.ring} />
        <circle cx="60" cy="7" r="8" fill={look.ring} opacity="0.25" />
      </g>

      {/* pulsing rings behind the shield */}
      <g className="rings" fill="none" stroke={look.ring} strokeWidth="3">
        <path className="ring r1" d="M60 10 L100 24 V58 C100 84 84 102 60 112 C36 102 20 84 20 58 V24 Z" />
        {(siren || mood === "cheer") && <path className="ring r2" d="M60 10 L100 24 V58 C100 84 84 102 60 112 C36 102 20 84 20 58 V24 Z" />}
      </g>

      {/* the shield */}
      <g className="body">
        <path d="M60 10 L100 24 V58 C100 84 84 102 60 112 C36 102 20 84 20 58 V24 Z" fill={`url(#${grad})`} stroke="#ffffff" strokeOpacity="0.9" strokeWidth="4" strokeLinejoin="round" />
        <path d="M34 28 L60 19 L86 28" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="4" strokeLinecap="round" />

        {/* eyes: it is awake, it blinks, it glances about, and it opens wide when worried */}
        <g className="eyes">
          <ellipse cx="46" cy="38" rx={mood === "worried" ? 7.4 : 6.4} ry={mood === "worried" ? 8.6 : 7.4} fill="#fff" />
          <ellipse cx="74" cy="38" rx={mood === "worried" ? 7.4 : 6.4} ry={mood === "worried" ? 8.6 : 7.4} fill="#fff" />
          <g className="pupils" fill="#1b1a22">
            <circle cx="46" cy="39" r={mood === "worried" ? 2.8 : 3.4} />
            <circle cx="74" cy="39" r={mood === "worried" ? 2.8 : 3.4} />
          </g>
        </g>

        {/* the symbol */}
        <g transform="translate(12 24) scale(0.8)">
        {(mood === "happy" || mood === "cheer") && <path className="tick" d="M40 60 L55 75 L82 44" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />}

        {mood === "listening" && (
          <g fill="#fff">
            <rect className="bar b1" x="38" y="46" width="9" height="28" rx="4.5" />
            <rect className="bar b2" x="55.5" y="38" width="9" height="44" rx="4.5" />
            <rect className="bar b3" x="73" y="46" width="9" height="28" rx="4.5" />
          </g>
        )}

        {siren && (
          <g>
            {/* the siren: a dome light on a base, with rays that flash */}
            <path className="dome" d="M43 70 a17 17 0 0 1 34 0 V77 H43 Z" fill="#fff" />
            <rect x="39" y="77" width="42" height="9" rx="3.5" fill="#fff" />
            <path className="dome-shine" d="M50 66 a10 10 0 0 1 8 -8" fill="none" stroke={look.to} strokeOpacity="0.55" strokeWidth="3.5" strokeLinecap="round" />
            <g className="rays" stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
              <path d="M60 36 V44" />
              <path d="M36 46 L42 52" />
              <path d="M84 46 L78 52" />
              <path d="M28 64 H35" />
              <path d="M92 64 H85" />
            </g>
          </g>
        )}
        </g>
      </g>

      {mood === "cheer" && [sparkle(14, 20, 8, "a"), sparkle(108, 16, 6, "b"), sparkle(106, 102, 5, "c")]}
    </svg>
  );
}
