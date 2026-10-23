import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icons";

const EXPAND_MS = 520;

const FULL: CSSProperties = { top: 0, left: 0, width: "100vw", height: "100dvh", borderRadius: 0 };

function fromRect(r: DOMRect | null): CSSProperties {
  if (!r) {
    // No tile to grow from: grow from the middle of the screen.
    const w = Math.min(560, window.innerWidth * 0.8);
    const h = Math.min(420, window.innerHeight * 0.6);
    return { top: (window.innerHeight - h) / 2, left: (window.innerWidth - w) / 2, width: w, height: h, borderRadius: 26 };
  }
  return { top: r.top, left: r.left, width: r.width, height: r.height, borderRadius: 26 };
}

interface Props {
  /** The color of the tile this view grows from. */
  accent: string;
  /** Small title shown in the bar once the large title has scrolled away. */
  title: string;
  /** Where the view grows from and shrinks back to. */
  getOrigin: () => DOMRect | null;
  /** True while the view is shrinking back; the parent unmounts it in onClosed. */
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  backLabel?: string;
  children: ReactNode;
}

/**
 * The expanding view. It starts exactly where its tile is, then grows to fill the screen
 * (and shrinks back the same way), like a card in the App Store. The content fades in as it grows.
 */
export function Sheet({ accent, title, getOrigin, closing, onRequestClose, onClosed, backLabel = "Back", children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>(() => fromRect(getOrigin()));
  const [scrolled, setScrolled] = useState(false);

  // Grow: paint once at the tile's size, then change to full size so the browser animates it.
  useLayoutEffect(() => {
    // Reading the box forces the browser to commit the starting size before we change it.
    root.current?.getBoundingClientRect();
    const t = setTimeout(() => {
      setOpen(true);
      setStyle(FULL);
      root.current?.focus({ preventScroll: true });
    }, 24);
    return () => clearTimeout(t);
  }, []);

  // Shrink back (or grow again if the parent changed its mind mid-way).
  const wasClosing = useRef(false);
  useEffect(() => {
    if (closing) {
      wasClosing.current = true;
      setOpen(false);
      setStyle(fromRect(getOrigin()));
      const t = setTimeout(onClosed, EXPAND_MS);
      return () => clearTimeout(t);
    }
    if (wasClosing.current) {
      wasClosing.current = false;
      setOpen(true);
      setStyle(FULL);
    }
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the page behind from scrolling, and let Escape close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onRequestClose();
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", key);
    };
  }, [onRequestClose]);

  return (
    <div className="sheet-layer">
      <div className={`sheet-scrim ${open ? "on" : ""}`} onClick={onRequestClose} />
      <div
        ref={root}
        className={`sheet ${open ? "open" : ""} ${scrolled ? "scrolled" : ""}`}
        style={{ ...style, ["--accent" as string]: accent }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheet-nav">
          <button className="nav-back" onClick={onRequestClose}>
            <Icon name="chevronLeft" size={20} stroke={2.2} />
            <span>{backLabel}</span>
          </button>
          <div className="nav-title">{title}</div>
          <button className="nav-close" onClick={onRequestClose} aria-label="Close">
            <Icon name="xmark" size={18} stroke={2.2} />
          </button>
        </div>
        <div className="sheet-scroll" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 46)}>
          <div className="sheet-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
