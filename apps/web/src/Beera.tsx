// The Beera mascot: an SVG bee whose face follows a mood.
import { useId } from "react";

/** The faces Beera can wear. */
export type BeeraMood = "happy" | "curious" | "worried" | "listening" | "cheer";

const INK = "#11111b";

const LABEL: Record<BeeraMood, string> = {
  happy: "Beera the bee, smiling",
  curious: "Beera the bee, curious",
  worried: "Beera the bee, concerned",
  listening: "Beera the bee, listening",
  cheer: "Beera the bee, cheering",
};

/**
 * Beera, the friendly bee. The name means courage and strength (it is linked with Lord Shiva in some Hindu naming traditions). The face follows what is happening: smiling when all is well, curious when
 * something is worth a look, serious when it is not, all ears while you talk, and cheering on good news.
 */
export function Beera({ mood = "happy", size = 96, className = "" }: { mood?: BeeraMood; size?: number; className?: string }) {
  const clip = useId();
  return (
    <svg className={`beera ${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={LABEL[mood]}>
      <defs>
        <clipPath id={clip}>
          <circle cx="60" cy="66" r="44" />
        </clipPath>
      </defs>

      {/* wings and antennae */}
      <g className="wing wing-l"><ellipse cx="34" cy="32" rx="21" ry="12" transform="rotate(-28 34 32)" fill="var(--sky)" opacity="0.8" stroke={INK} strokeWidth="2.5" /></g>
      <g className="wing wing-r"><ellipse cx="86" cy="32" rx="21" ry="12" transform="rotate(28 86 32)" fill="var(--sky)" opacity="0.8" stroke={INK} strokeWidth="2.5" /></g>
      <g className="antennae" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d="M47 26 Q41 10 29 10" />
        <path d="M73 26 Q79 10 91 10" />
        <circle cx="29" cy="10" r="5" fill={INK} stroke="none" />
        <circle cx="91" cy="10" r="5" fill={INK} stroke="none" />
      </g>

      {/* body and stripes */}
      <circle cx="60" cy="66" r="44" fill="var(--yellow)" />
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="93" width="120" height="9" fill={INK} opacity="0.9" />
        <rect x="0" y="106" width="120" height="9" fill={INK} opacity="0.9" />
      </g>
      <circle cx="60" cy="66" r="44" fill="none" stroke={INK} strokeWidth="3.5" />

      {/* face */}
      <g className="eyes">
        <circle cx="46" cy="62" r="7" fill={INK} />
        <circle cx="74" cy="62" r="7" fill={INK} />
        <circle cx="48.4" cy="59.2" r="2.4" fill="#fff" />
        <circle cx="76.4" cy="59.2" r="2.4" fill="#fff" />
      </g>
      <circle cx="35" cy="75" r="6" fill="var(--pink)" opacity="0.7" />
      <circle cx="85" cy="75" r="6" fill="var(--pink)" opacity="0.7" />

      {mood === "happy" && <path d="M50 76 Q60 87 70 76" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />}
      {mood === "curious" && (
        <>
          <path d="M52 81 Q60 79 68 80" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M66 50 Q74 45 82 50" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {mood === "worried" && (
        <>
          <path d="M51 84 Q60 76 69 84" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M37 51 L53 55" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M83 51 L67 55" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {mood === "listening" && <ellipse cx="60" cy="80" rx="4.5" ry="5.5" fill={INK} />}
      {mood === "cheer" && (
        <>
          <path d="M46 73 Q60 98 74 73 Z" fill={INK} />
          <path d="M53 87 Q60 93 67 87 Q60 83 53 87 Z" fill="var(--pink)" />
        </>
      )}
    </svg>
  );
}
