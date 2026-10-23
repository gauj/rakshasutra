import type { ReactNode } from "react";
import { Squiggle } from "./Squiggle";
import type { State } from "./state";

/** One line, never wraps: four wordings, picked by width. */
export function Foot({ st }: { st: State }) {
  const voice = st.child.consent.voice;
  return (
    <p className="foot">
      <span className="f1">Only you can see {st.child.name}'s information · Voice listening is {voice ? "on (opt-in; only what is about him is shown)" : "off"} · Flagged areas are advisory · This app never dials emergency numbers</span>
      <span className="f2">Private to you · Voice listening {voice ? "on (opt-in)" : "off"} · Flagged areas are advisory · Never dials emergency numbers</span>
      <span className="f3">Private to you · Voice {voice ? "opt-in" : "off"} · Never dials emergency numbers</span>
      <span className="f4">Private · Never dials emergency numbers</span>
    </p>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  st: State;
  /** Wider layout for pages with two columns. */
  wide?: boolean;
  children: ReactNode;
}

/** What goes inside an expanded view: a large title with a squiggle under it, then the content. */
export function Page({ title, subtitle, st, wide, children }: Props) {
  return (
    <main className={`page ${wide ? "wide" : ""}`}>
      <header className="large-title">
        <h1>{title}</h1>
        <Squiggle width={92} amp={3.5} wavelength={14} stroke={3} />
        {subtitle && <p>{subtitle}</p>}
      </header>
      {children}
      <Foot st={st} />
    </main>
  );
}
