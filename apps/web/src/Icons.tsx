/** A small set of line icons in the spirit of SF Symbols: one stroke weight, round caps, no fills. */
const PATHS: Record<string, string[]> = {
  chat: ["M4 5.5h16v11H10l-4.5 3.5v-3.5H4z"],
  doc: ["M6 3.5h8.5L19 8v12.5H6z", "M14.5 3.5V8H19", "M9 12.5h7", "M9 16h7"],
  check: ["M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z", "M8.3 12.4l2.7 2.7 4.8-5.6"],
  chevronLeft: ["M14.5 5l-7 7 7 7"],
  chevronRight: ["M9.5 5l7 7-7 7"],
  xmark: ["M6 6l12 12", "M18 6L6 18"],
  wave: ["M4 12h0.01", "M8 9v6", "M12 5v14", "M16 8v8", "M20 11v2"],
  lock: ["M6.5 11h11v8.5h-11z", "M8.5 11V8.5a3.5 3.5 0 017 0V11"],
  pin: ["M12 20.5s6.5-5.6 6.5-10.5a6.5 6.5 0 10-13 0c0 4.9 6.5 10.5 6.5 10.5z", "M12 7.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z"],
  bell: ["M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5h-14z", "M10 20h4"],
  clock: ["M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z", "M12 7.5V12l3 2"],
  sliders: ["M5 7h14", "M5 12h14", "M5 17h14", "M9 5v4", "M15 10v4", "M8 15v4"],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]!.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
