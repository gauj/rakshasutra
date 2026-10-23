// The Beera mascot: a soft, round SVG bee whose face follows a mood.
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

// Warm hand-painted palette: golden body, near-black stripes, pale blue wings, rosy cheeks.
const STRIPE = "#1c1a1f";
const FACE = "#3b2a1c";
const CHEEK = "#ff8fa6";

/** A four-point sparkle, used when Beera cheers. */
const sparkle = (x: number, y: number, s: number, key: string) => (
  <path key={key} className="spark" d={`M${x} ${y - s} Q${x + s * 0.22} ${y - s * 0.22} ${x + s} ${y} Q${x + s * 0.22} ${y + s * 0.22} ${x} ${y + s} Q${x - s * 0.22} ${y + s * 0.22} ${x - s} ${y} Q${x - s * 0.22} ${y - s * 0.22} ${x} ${y - s}Z`} fill="#fff8d6" stroke="#f5b700" strokeWidth="1.2" />
);

/**
 * Beera, the friendly bee. The name means courage and strength (it is linked with Lord Shiva in some Hindu naming traditions).
 * The face follows what is happening: a happy smile when all is well, a curious tilt when something is worth a look,
 * a gentle frown when it is not, big ears while you talk, and a cheer on good news.
 */
export function Beera({ mood = "happy", size = 96, className = "" }: { mood?: BeeraMood; size?: number; className?: string }) {
  const id = useId();
  const body = `${id}-body`;
  const clip = `${id}-clip`;
  const sheen = `${id}-sheen`;
  const happyEyes = mood === "happy" || mood === "cheer";

  return (
    <svg className={`beera ${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={LABEL[mood]}>
      <defs>
        <radialGradient id={body} cx="42%" cy="34%" r="75%">
          <stop offset="0" stopColor="#ffe36b" />
          <stop offset="0.55" stopColor="#ffc72c" />
          <stop offset="1" stopColor="#f29a00" />
        </radialGradient>
        <radialGradient id={sheen} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clip}>
          <ellipse cx="60" cy="67" rx="41" ry="38" />
        </clipPath>
      </defs>

      {/* wings sit behind the body */}
      <g className="wing wing-l">
        <ellipse cx="19" cy="72" rx="16" ry="9.5" transform="rotate(-38 19 72)" fill="#cfdceb" opacity="0.9" stroke="#a9bdd1" strokeWidth="1.5" />
      </g>
      <g className="wing wing-r">
        <ellipse cx="102" cy="54" rx="16" ry="9.5" transform="rotate(36 102 54)" fill="#cfdceb" opacity="0.9" stroke="#a9bdd1" strokeWidth="1.5" />
      </g>

      {/* antennae */}
      <g className="antennae" fill="none" stroke={STRIPE} strokeWidth="3" strokeLinecap="round">
        <path d="M49 32 Q45 17 36 14" />
        <path d="M71 32 Q75 17 84 14" />
        <circle cx="36" cy="14" r="3.6" fill={STRIPE} stroke="none" />
        <circle cx="84" cy="14" r="3.6" fill={STRIPE} stroke="none" />
      </g>

      {/* round golden body with two curved stripes */}
      <ellipse cx="60" cy="67" rx="41" ry="38" fill={`url(#${body})`} />
      <g clipPath={`url(#${clip})`}>
        <path d="M14 80 Q60 96 106 80 V92 Q60 108 14 92 Z" fill={STRIPE} />
        <path d="M20 99 Q60 115 100 99 V112 Q60 128 20 112 Z" fill={STRIPE} />
        <ellipse cx="44" cy="45" rx="16" ry="9" transform="rotate(-24 44 45)" fill={`url(#${sheen})`} />
      </g>

      {/* cheeks */}
      <ellipse cx="39" cy="71" rx="6" ry="4.6" fill={CHEEK} opacity={mood === "cheer" ? 0.85 : 0.65} />
      <ellipse cx="81" cy="71" rx="6" ry="4.6" fill={CHEEK} opacity={mood === "cheer" ? 0.85 : 0.65} />

      {/* eyes */}
      {happyEyes ? (
        <g fill="none" stroke={FACE} strokeWidth="3.4" strokeLinecap="round">
          <path d="M40 64 Q46 56 52 64" />
          <path d="M68 64 Q74 56 80 64" />
        </g>
      ) : (
        <g className="eyes">
          <ellipse cx="46" cy="63" rx="4.6" ry={mood === "listening" ? 5.8 : 5} fill={FACE} />
          <ellipse cx="74" cy="63" rx="4.6" ry={mood === "listening" ? 5.8 : 5} fill={FACE} />
          <circle cx="47.6" cy="61" r="1.6" fill="#fff" />
          <circle cx="75.6" cy="61" r="1.6" fill="#fff" />
        </g>
      )}

      {/* brows for the serious faces */}
      {mood === "worried" && (
        <g stroke={FACE} strokeWidth="2.8" strokeLinecap="round" fill="none">
          <path d="M39 53 L52 56" />
          <path d="M81 53 L68 56" />
        </g>
      )}
      {mood === "curious" && (
        <g stroke={FACE} strokeWidth="2.8" strokeLinecap="round" fill="none">
          <path d="M40 55 L52 53" />
          <path d="M68 54 Q74 49 81 54" />
        </g>
      )}

      {/* mouth */}
      {mood === "happy" && <path d="M52 73 Q60 81 68 73" fill="none" stroke={FACE} strokeWidth="3.2" strokeLinecap="round" />}
      {mood === "cheer" && <path d="M51 72 Q60 86 69 72 Q60 76 51 72Z" fill="#7a2f33" stroke={FACE} strokeWidth="2.6" strokeLinejoin="round" />}
      {mood === "curious" && <path d="M54 75 Q60 78 67 73" fill="none" stroke={FACE} strokeWidth="3" strokeLinecap="round" />}
      {mood === "worried" && <path d="M53 78 Q60 72 67 78" fill="none" stroke={FACE} strokeWidth="3" strokeLinecap="round" />}
      {mood === "listening" && <ellipse cx="60" cy="76" rx="3.4" ry="4.2" fill="#7a2f33" stroke={FACE} strokeWidth="2" />}

      {/* extras: sound waves while listening, sparkles on good news */}
      {mood === "listening" && (
        <g fill="none" stroke="#cba6f7" strokeWidth="3" strokeLinecap="round">
          <path className="wave w1" d="M104 28 Q111 34 104 40" />
          <path className="wave w2" d="M110 22 Q121 34 110 46" />
        </g>
      )}
      {mood === "cheer" && [sparkle(18, 28, 8, "a"), sparkle(104, 26, 6, "b"), sparkle(100, 100, 5, "c")]}
    </svg>
  );
}
