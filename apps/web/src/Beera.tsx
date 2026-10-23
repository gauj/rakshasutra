// The Beera mascot: a flat, friendly SVG bee (round head, striped body, teal wings) whose face follows a mood.
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

// Flat kawaii palette: sunny yellow, near-black stripes, soft teal wings, peach cheeks.
const YELLOW = "#ffc92c";
const INK = "#16151a";
const WING = "#9fd8df";
const CHEEK = "#f9a27f";

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
  const clip = `${id}-body`;
  const happyEyes = mood === "cheer";

  return (
    <svg className={`beera ${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={LABEL[mood]}>
      <defs>
        <clipPath id={clip}>
          <ellipse cx="60" cy="84" rx="25" ry="28" />
        </clipPath>
      </defs>

      {/* wings sit behind the head and body */}
      <g className="wing wing-l">
        <ellipse cx="19" cy="66" rx="19" ry="23" transform="rotate(-8 19 66)" fill={WING} />
      </g>
      <g className="wing wing-r">
        <ellipse cx="101" cy="66" rx="19" ry="23" transform="rotate(8 101 66)" fill={WING} />
      </g>

      {/* antennae */}
      <g className="antennae" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round">
        <path d="M47 15 Q43 6 34 5" />
        <path d="M73 15 Q77 6 86 5" />
        <circle cx="34" cy="5.5" r="3.8" fill={INK} stroke="none" />
        <circle cx="86" cy="5.5" r="3.8" fill={INK} stroke="none" />
      </g>

      {/* striped body with a small stinger */}
      <path d="M54 109 L60 119 L66 109 Z" fill={INK} />
      <ellipse cx="60" cy="84" rx="25" ry="28" fill={YELLOW} />
      <g clipPath={`url(#${clip})`}>
        <rect x="30" y="66" width="60" height="11" fill={INK} />
        <rect x="30" y="85" width="60" height="11" fill={INK} />
        <rect x="30" y="103" width="60" height="12" fill={INK} />
      </g>

      {/* round head */}
      <circle cx="60" cy="38" r="31" fill={YELLOW} />

      {/* cheeks */}
      <ellipse cx="38" cy="47" rx="6.5" ry="4.6" fill={CHEEK} opacity={mood === "cheer" ? 0.95 : 0.8} />
      <ellipse cx="82" cy="47" rx="6.5" ry="4.6" fill={CHEEK} opacity={mood === "cheer" ? 0.95 : 0.8} />

      {/* eyes */}
      {happyEyes ? (
        <g fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round">
          <path d="M40 38 Q46 30 52 38" />
          <path d="M68 38 Q74 30 80 38" />
        </g>
      ) : (
        <g className="eyes">
          <circle cx="46" cy="37" r={mood === "listening" ? 7 : 6.2} fill={INK} />
          <circle cx="74" cy="37" r={mood === "listening" ? 7 : 6.2} fill={INK} />
          <circle cx="44" cy="34.5" r="2.2" fill="#fff" />
          <circle cx="72" cy="34.5" r="2.2" fill="#fff" />
          <circle cx="48" cy="40" r="1.1" fill="#fff" />
          <circle cx="76" cy="40" r="1.1" fill="#fff" />
        </g>
      )}

      {/* brows for the serious faces */}
      {mood === "worried" && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M38 25 L53 29" />
          <path d="M82 25 L67 29" />
        </g>
      )}
      {mood === "curious" && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M39 28 L53 26" />
          <path d="M67 27 Q74 21 82 27" />
        </g>
      )}

      {/* mouth */}
      {mood === "happy" && <path d="M53 49 Q60 55 67 49" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />}
      {mood === "cheer" && <path d="M51 47 Q60 62 69 47 Q60 52 51 47Z" fill="#8a3139" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />}
      {mood === "curious" && <path d="M54 51 Q60 54 67 48" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {mood === "worried" && <path d="M53 54 Q60 47 67 54" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />}
      {mood === "listening" && <ellipse cx="60" cy="52" rx="3.8" ry="4.6" fill="#8a3139" stroke={INK} strokeWidth="2" />}

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
