// The Beera mascot: a polished flat SVG bee (round head, curved-stripe body, glassy teal wings) whose face follows a mood.
import { useId } from "react";

/** The faces Beera can wear. */
export type BeeraMood = "happy" | "curious" | "worried" | "listening" | "cheer";

const LABEL: Record<BeeraMood, string> = {
  happy: "Beera the bee, smiling",
  curious: "Beera the bee, curious",
  worried: "Beera the bee, concerned",
  listening: "Beera the bee, listening",
  cheer: "Beera the bee, cheering",
};

const INK = "#1a1820";
const MOUTH = "#8a3139";
const CHEEK = "#ff9d86";

/** A four-point sparkle, used when Beera cheers. */
const sparkle = (x: number, y: number, s: number, key: string) => (
  <path key={key} className="spark" d={`M${x} ${y - s} Q${x + s * 0.22} ${y - s * 0.22} ${x + s} ${y} Q${x + s * 0.22} ${y + s * 0.22} ${x} ${y + s} Q${x - s * 0.22} ${y + s * 0.22} ${x - s} ${y} Q${x - s * 0.22} ${y - s * 0.22} ${x} ${y - s}Z`} fill="#fff8d6" stroke="#f5b700" strokeWidth="1.2" />
);

/**
 * Beera, the friendly bee. The name means courage and strength (it is linked with Lord Shiva in some Hindu naming traditions).
 * The face follows what is happening: a happy smile when all is well, a curious tilt when something is worth a look,
 * a gentle frown when it is not, an open mouth while you talk, and a cheer on good news.
 */
export function Beera({ mood = "happy", size = 96, className = "" }: { mood?: BeeraMood; size?: number; className?: string }) {
  const id = useId();
  const gold = `${id}-gold`;
  const wing = `${id}-wing`;
  const clip = `${id}-body`;
  const happyEyes = mood === "cheer";

  return (
    <svg className={`beera ${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={LABEL[mood]}>
      <defs>
        {/* sunny gold, lit from the top left */}
        <radialGradient id={gold} cx="36%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffe46e" />
          <stop offset="0.5" stopColor="#ffc928" />
          <stop offset="1" stopColor="#f5a800" />
        </radialGradient>
        <linearGradient id={wing} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4eef1" />
          <stop offset="1" stopColor="#86cdd8" />
        </linearGradient>
        <clipPath id={clip}>
          <ellipse cx="60" cy="85" rx="25" ry="28" />
        </clipPath>
      </defs>

      {/* wings: soft glassy teal with a bright inner highlight */}
      <g className="wing wing-l">
        <ellipse cx="18" cy="68" rx="18" ry="23" transform="rotate(-10 18 68)" fill={`url(#${wing})`} stroke="#7cc1cc" strokeWidth="1.2" />
        <ellipse cx="13" cy="61" rx="6" ry="11" transform="rotate(-10 13 61)" fill="#fff" opacity="0.45" />
      </g>
      <g className="wing wing-r">
        <ellipse cx="102" cy="68" rx="18" ry="23" transform="rotate(10 102 68)" fill={`url(#${wing})`} stroke="#7cc1cc" strokeWidth="1.2" />
        <ellipse cx="107" cy="61" rx="6" ry="11" transform="rotate(10 107 61)" fill="#fff" opacity="0.45" />
      </g>

      {/* antennae */}
      <g className="antennae" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M47 14 Q43 5 34 4" />
        <path d="M73 14 Q77 5 86 4" />
        <circle cx="34" cy="4.6" r="3.8" fill={INK} stroke="none" />
        <circle cx="86" cy="4.6" r="3.8" fill={INK} stroke="none" />
      </g>

      {/* body: three curved stripes that follow its roundness, and a small rounded stinger */}
      <path d="M55 110 Q60 120 65 110 Z" fill={INK} />
      <ellipse cx="60" cy="85" rx="25" ry="28" fill={`url(#${gold})`} />
      <g clipPath={`url(#${clip})`} fill={INK}>
        <path d="M30 66 Q60 74 90 66 V76 Q60 84 30 76 Z" />
        <path d="M30 86 Q60 94 90 86 V96 Q60 104 30 96 Z" />
        <path d="M30 104 Q60 112 90 104 V120 H30 Z" />
        <ellipse cx="48" cy="76" rx="3" ry="8" transform="rotate(8 48 76)" fill="#fff" opacity="0.16" />
      </g>

      {/* round head with a soft highlight */}
      <circle cx="60" cy="38" r="31" fill={`url(#${gold})`} />
      <path d="M36 22 Q46 12 58 11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.35" />

      {/* cheeks */}
      <ellipse cx="37.5" cy="48" rx="6.5" ry="4.4" fill={CHEEK} opacity={mood === "cheer" ? 0.95 : 0.78} />
      <ellipse cx="82.5" cy="48" rx="6.5" ry="4.4" fill={CHEEK} opacity={mood === "cheer" ? 0.95 : 0.78} />

      {/* eyes: glossy, with two highlights each */}
      {happyEyes ? (
        <g fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round">
          <path d="M39 39 Q46 30 53 39" />
          <path d="M67 39 Q74 30 81 39" />
        </g>
      ) : (
        <g className="eyes">
          <ellipse cx="46" cy="38" rx={mood === "listening" ? 7 : 6.4} ry={mood === "listening" ? 7.8 : 7.2} fill={INK} />
          <ellipse cx="74" cy="38" rx={mood === "listening" ? 7 : 6.4} ry={mood === "listening" ? 7.8 : 7.2} fill={INK} />
          <circle cx="43.6" cy="35" r="2.6" fill="#fff" />
          <circle cx="71.6" cy="35" r="2.6" fill="#fff" />
          <circle cx="48.4" cy="41.5" r="1.2" fill="#fff" />
          <circle cx="76.4" cy="41.5" r="1.2" fill="#fff" />
        </g>
      )}

      {/* brows for the serious faces */}
      {mood === "worried" && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M38 29.5 L53 24.5" />
          <path d="M82 29.5 L67 24.5" />
        </g>
      )}
      {mood === "curious" && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M38 28 L53 26" />
          <path d="M67 27 Q74 20 82 27" />
        </g>
      )}

      {/* mouth */}
      {mood === "happy" && <path d="M53 49.5 Q60 56 67 49.5" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />}
      {mood === "cheer" && <path d="M51 48 Q60 63 69 48 Q60 53 51 48Z" fill={MOUTH} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />}
      {mood === "curious" && <path d="M54 52 Q60 55 67 49" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {mood === "worried" && <path d="M53 55 Q60 48 67 55" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />}
      {mood === "listening" && <ellipse cx="60" cy="53" rx="3.8" ry="4.6" fill={MOUTH} stroke={INK} strokeWidth="2" />}

      {/* extras: sound waves while listening, sparkles on good news */}
      {mood === "listening" && (
        <g fill="none" stroke="#cba6f7" strokeWidth="3" strokeLinecap="round">
          <path className="wave w1" d="M99 18 Q106 24 99 30" />
          <path className="wave w2" d="M105 12 Q116 24 105 36" />
        </g>
      )}
      {mood === "cheer" && [sparkle(12, 20, 8, "a"), sparkle(106, 14, 6, "b"), sparkle(104, 100, 5, "c")]}
    </svg>
  );
}
