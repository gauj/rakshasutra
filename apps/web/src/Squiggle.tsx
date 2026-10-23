/** A hand-drawn-looking wavy line: the app's signature, used where we would otherwise put an ornament. */
export function squigglePath(width: number, amp: number, wavelength: number): string {
  const half = wavelength / 2;
  const n = Math.max(1, Math.ceil(width / half));
  let d = `M0 ${amp} q ${wavelength / 4} ${-amp * 2} ${half} 0`;
  for (let i = 1; i < n; i++) d += ` t ${half} 0`;
  return d;
}

interface Props {
  width?: number;
  amp?: number;
  wavelength?: number;
  stroke?: number;
  color?: string;
  /** The wave drifts sideways, like a live signal. */
  animated?: boolean;
  className?: string;
}

export function Squiggle({ width = 96, amp = 4, wavelength = 16, stroke = 3, color = "var(--accent, var(--blue))", animated = false, className }: Props) {
  const h = amp * 2 + stroke * 2;
  // One extra wavelength is drawn so the drift can loop without a seam.
  const d = squigglePath(width + wavelength, amp, wavelength);
  return (
    <svg
      className={className}
      width={width}
      height={h}
      viewBox={`0 ${-stroke} ${width} ${h}`}
      aria-hidden="true"
      style={{ overflow: "hidden", display: "block", ["--wl" as string]: `${wavelength}px` }}
    >
      <g className={animated ? "squiggle-drift" : undefined}>
        <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
