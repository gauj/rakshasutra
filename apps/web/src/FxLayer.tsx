// Celebration effects (confetti and a toast), shown only for good news, never for alerts.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion, useCountUp, type FxDetail } from "./fx";

// One confetti piece with its random fall settings.
interface Piece {
  id: number;
  left: number;
  color: string;
  delay: number;
  dur: number;
  size: number;
  rot: number;
  drift: number;
  round: boolean;
}

const COLORS = ["--red", "--peach", "--yellow", "--green", "--sky", "--mauve", "--pink"];

/** Confetti and a little toast, for the good moments. Listens for the "fx" event. */
export function FxLayer() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [toast, setToast] = useState<string>();
  const seq = useRef(0);

  useEffect(() => {
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const d = (e as CustomEvent<FxDetail>).detail;
      // Confetti is skipped for people who prefer reduced motion; the toast still shows.
      if (d.confetti && !prefersReducedMotion()) {
        const made: Piece[] = Array.from({ length: d.confetti }, () => ({
          id: ++seq.current,
          left: Math.random() * 100,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          delay: Math.random() * 0.4,
          dur: 1.6 + Math.random() * 1.2,
          size: 5 + Math.random() * 6,
          rot: Math.random() * 720 - 360,
          drift: Math.random() * 160 - 80,
          round: Math.random() > 0.6,
        }));
        setPieces((p) => [...p, ...made]);
        // Remove the pieces once their animation has finished.
        setTimeout(() => setPieces((p) => p.filter((x) => !made.includes(x))), 3600);
      }
      if (d.toast) {
        setToast(d.toast);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setToast(undefined), 3600);
      }
    };
    window.addEventListener("fx", on);
    return () => {
      window.removeEventListener("fx", on);
      clearTimeout(toastTimer);
    };
  }, []);

  return (
    <>
      <div className="confetti" aria-hidden="true">
        {pieces.map((p) => (
          <i
            key={p.id}
            style={
              {
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 1.6,
                borderRadius: p.round ? "50%" : 2,
                background: `var(${p.color})`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
                ["--rot" as string]: `${p.rot}deg`,
                ["--drift" as string]: `${p.drift}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

/** A number that counts up when it changes. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  return <>{useCountUp(value, decimals)}</>;
}
