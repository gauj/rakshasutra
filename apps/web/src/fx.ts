import { useEffect, useRef, useState } from "react";

export interface FxDetail {
  /** How many confetti pieces to throw. */
  confetti?: number;
  toast?: string;
}

/** Celebrate a good moment. Never used for alerts. */
export function celebrate(d: FxDetail) {
  window.dispatchEvent(new CustomEvent<FxDetail>("fx", { detail: d }));
  if (d.confetti) navigator.vibrate?.(14);
}

export const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up to its value, so changes feel alive. */
export function useCountUp(value: number, decimals = 0, ms = 800): string {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion() || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(a + (value - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    // If frames are throttled, still land on the real value.
    const done = setTimeout(() => {
      setShown(value);
      from.current = value;
    }, ms + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [value, ms]);
  return shown.toFixed(decimals);
}
