// The home screen: map, status pill, Beera and the three tiles, plus the full-screen views they open.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert } from "@rakshasutra/core";
import { AskPage } from "./AskPage";
import { Beera, type BeeraMood } from "./Beera";
import { BeePage } from "./BeePage";
import { CheckinPage } from "./CheckinPage";
import { CountUp } from "./FxLayer";
import { Mark, sentence } from "./Hero";
import { Icon, type IconName } from "./Icons";
import { MapView, safePhoto } from "./MapView";
import { Sheet } from "./Sheet";
import { Squiggle } from "./Squiggle";
import { SetupPage } from "./SetupPage";
import { SummaryPage } from "./SummaryPage";
import { agoText, clock12, moodOf, planClock, type State } from "./state";

export type SheetId = "ask" | "summary" | "checkin" | "bee" | "setup";

// Title, accent colour and back-button label for each expanded view.
const META: Record<SheetId, { title: string; accent: string; back: string }> = {
  ask: { title: "Ask About", accent: "var(--red)", back: "Home" },
  summary: { title: "Summary", accent: "var(--peach)", back: "Home" },
  checkin: { title: "Check-in", accent: "var(--yellow)", back: "Home" },
  bee: { title: "Bee", accent: "var(--mauve)", back: "Done" },
  setup: { title: "Set up", accent: "var(--blue)", back: "Home" },
};

interface Props {
  st: State;
  open?: Alert;
  /** Which expanded view the address asks for, if any. */
  view: SheetId | "home";
  onCloseBee: () => void;
}

/** What Beera says, and how Beera looks while saying it. Serious when it matters, cheerful when it is earned. */
function beeraSays(st: State, open?: Alert): { mood: BeeraMood; line: string; sub: string } {
  const name = st.child.name;
  const last = st.now_state?.last;
  const plan = st.plans.find((p) => p.status === "confirmed");
  const done = st.plans.find((p) => p.status === "completed");
  if (st.voice?.status === "listening") return { mood: "listening", line: "I'm all ears…", sub: "Go ahead, I'm listening." };
  if (st.tier === "critical") return { mood: "worried", line: `${name} may need help.`, sub: "Tap Check-in. I'll show you what I know." };
  if (st.tier === "warning") {
    const why = st.signals.find((s) => s.severity >= 3);
    return { mood: "curious", line: "Hmm, this is worth a look.", sub: why ? `${why.title}. Not a confirmed emergency.` : "I'm keeping an eye on it." };
  }
  if (!last) return { mood: "happy", line: "Hi, I'm Beera!", sub: `Tell me when you expect ${name} somewhere.` };
  const tz = st.child.tzOffsetMin;
  const zoneName = (id?: string) => st.child.zones.find((z) => z.id === id)?.name ?? "the planned place";
  // Good news first: he reached the place a plan expected, in the last 45 minutes.
  const arrived = st.plans
    .filter((p) => p.status === "completed" && p.completedAt && st.now - p.completedAt < 45 * 60_000)
    .sort((a, b) => b.completedAt! - a.completedAt!)[0];
  if (arrived && !plan) {
    const home = arrived.expectedZoneId === "home";
    return { mood: "cheer", line: home ? `${name} is home!` : `${name} arrived safely!`, sub: `Reached ${zoneName(arrived.expectedZoneId)} at ${clock12(arrived.completedAt!, tz)}. Right on plan.` };
  }
  // A "keep an eye on him" request is in force.
  if (plan?.watch) {
    return { mood: "happy", line: `I'm keeping an eye on ${name}.`, sub: `Watching ${zoneName(plan.watch.zoneId)} until ${clock12(plan.watch.until, tz)}, then ${zoneName(plan.expectedZoneId)}.` };
  }
  if (done && !plan) return { mood: "cheer", line: `${name} is home!`, sub: "Right on plan. Nice one." };
  const place = st.now_state?.zone ? `at ${st.now_state.zone}` : st.now_state?.motion === "still" ? "somewhere new" : "on the move";
  return { mood: "happy", line: `${name}'s ${place}. All good!`, sub: open ? "Back to normal after the earlier alert." : plan ? "I'm watching the clock for you." : "No plan yet. Tell me one!" };
}

/**
 * The first screen: the map, a pill that changes with what is happening, Beera, and three tiles.
 * Each tile grows into a full-screen view; the pill grows into the Bee conversation.
 */
export function Landing({ st, open, view, onCloseBee }: Props) {
  const name = st.child.name;
  const mood = moodOf(st.tier);
  const last = st.now_state?.last;
  const age = st.now_state?.lastPingAgeMin;
  const clock = planClock(st);

  const tiles = useRef<Partial<Record<SheetId, HTMLElement | null>>>({});

  // Which expanded view is in the page, and whether it is on its way out.
  const [mounted, setMounted] = useState<SheetId | null>(view === "home" ? null : view);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (view !== "home") {
      setMounted(view);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = useCallback(() => {
    if (mounted === "bee") onCloseBee();
    else location.hash = "#/";
  }, [mounted, onCloseBee]);

  const origin = useCallback(() => (mounted ? tiles.current[mounted]?.getBoundingClientRect() ?? null : null), [mounted]);

  const attention = mood !== "calm";
  const s = sentence(st, open);
  const says = beeraSays(st, open);

  return (
    <div className="home">
      <div className="map-pane">
        <MapView zones={st.child.zones} trail={st.trail} last={last} alert={open} initial={name[0]} photo={st.child.photo} className="map" />

        <Island st={st} mood={mood} title={s.title} onRef={(el) => (tiles.current.bee = el)} />

        {st.mode === "real" && (
          <a className="gear" href="#/setup" ref={(el) => (tiles.current.setup = el)} aria-label="Set up">
            <Icon name="sliders" size={20} />
          </a>
        )}

        <div className="brandtag">
          <Mark size={22} />
          <span>RakshaSutra</span>
        </div>

        <div className="mapchips">
          {clock && <span className={`pill ${clock.tone}`}><Icon name="clock" size={16} stroke={2.2} /> {clock.text}</span>}
          {age !== undefined && <span className={`pill ${age >= 10 ? "look" : ""}`}><Icon name="pin" size={16} stroke={2.2} /> Last signal {agoText(age)}</span>}
        </div>
      </div>

      <nav className="tiles" aria-label="Main">
        <div className={`beera-card ${says.mood}`} role="status" aria-live="polite">
          {safePhoto(st.child.photo) ? (
            <span className="face">
              <img className="face-photo" src={safePhoto(st.child.photo)} alt={`${name}'s photo`} />
              <Beera mood={says.mood} size={24} className="face-bee" />
            </span>
          ) : (
            <Beera mood={says.mood} size={56} />
          )}
          <div className="speech">
            <b>{says.line}</b>
            <span>{says.sub}</span>
          </div>
        </div>

        <Tile id="ask" icon="chat" label={`Ask About ${name}`} accent="var(--red)" mounted={mounted} reg={tiles}>
          <p className="tile-line">“Where is {name} now?”</p>
          <p className="tile-hint">Ask in plain words</p>
        </Tile>

        <Tile id="summary" icon="doc" label={`${name}'s Summary`} accent="var(--peach)" mounted={mounted} reg={tiles}>
          <SummaryPreview st={st} />
        </Tile>

        <Tile id="checkin" icon="check" label="Check-in" accent="var(--yellow)" mounted={mounted} reg={tiles} attention={attention}>
          <p className="tile-line">{s.title}</p>
          {clock ? <span className={`pill on-tile ${clock.tone}`}><Icon name="clock" size={15} stroke={2.2} /> {clock.text}</span> : <p className="tile-hint">{age !== undefined ? `Last signal ${agoText(age)}` : "Waiting for the first signal"}</p>}
        </Tile>
      </nav>

      {mounted && (
        <Sheet
          accent={META[mounted].accent}
          title={mounted === "ask" ? `Ask About ${name}` : mounted === "summary" ? `${name}'s Summary` : META[mounted].title}
          backLabel={META[mounted].back}
          getOrigin={origin}
          closing={closing}
          onRequestClose={requestClose}
          onClosed={() => {
            setMounted(null);
            setClosing(false);
          }}
        >
          {mounted === "checkin" && <CheckinPage st={st} open={open} />}
          {mounted === "summary" && <SummaryPage st={st} />}
          {mounted === "ask" && <AskPage st={st} />}
          {mounted === "bee" && st.voice && <BeePage st={st} open={open} onDone={onCloseBee} />}
          {mounted === "setup" && <SetupPage st={st} />}
        </Sheet>
      )}
    </div>
  );
}

// Today's totals shown on the Summary tile.
function SummaryPreview({ st }: { st: State }) {
  const segs = st.day.timeline;
  const mi = Math.round(segs.reduce((a, s) => a + s.distanceM, 0) / 160.9344) / 10;
  const stops = segs.filter((s) => s.kind === "still" && s.to - s.from >= 10 * 60_000).length;
  if (!segs.length) return <p className="tile-hint">The story of the day starts with the first check-in</p>;
  return (
    <div className="tile-stats">
      <div><b><CountUp value={mi} decimals={1} /></b><span>mi today</span></div>
      <div><b><CountUp value={stops} /></b><span>{stops === 1 ? "stop" : "stops"}</span></div>
      <div><b><CountUp value={st.alerts.length} /></b><span>{st.alerts.length === 1 ? "alert" : "alerts"}</span></div>
    </div>
  );
}

interface TileProps {
  id: SheetId;
  icon: IconName;
  label: string;
  accent: string;
  mounted: SheetId | null;
  reg: React.MutableRefObject<Partial<Record<SheetId, HTMLElement | null>>>;
  attention?: boolean;
  children: React.ReactNode;
}

// A home-screen tile that links to its expanded view and hides while that view is open.
function Tile({ id, icon, label, accent, mounted, reg, attention, children }: TileProps) {
  return (
    <a
      className={`tile ${mounted === id ? "gone" : ""}`}
      href={`#/${id}`}
      ref={(el) => {
        reg.current[id] = el;
      }}
      style={{ ["--accent" as string]: accent }}
    >
      <div className="tile-head">
        <span className="tile-icon"><Icon name={icon} size={20} /></span>
        <span className="tile-title">{label}</span>
        {attention && <span className="tile-badge" aria-label="Needs attention">!</span>}
        <span className="tile-chev"><Icon name="chevronRight" size={18} stroke={2.2} /></span>
      </div>
      <div className="tile-body">{children}</div>
      <div className="tile-foot"><Squiggle width={64} amp={3} wavelength={11} stroke={2.5} color="currentColor" /></div>
    </a>
  );
}

/**
 * The pill at the top of the map. It is calm when all is well, widens when something needs a look,
 * shows a live wave while the guardian is talking to their Bee, and opens the Bee conversation when tapped.
 */
function Island({ st, mood, title, onRef }: { st: State; mood: "calm" | "look" | "urgent"; title: string; onRef: (el: HTMLElement | null) => void }) {
  const v = st.voice;
  const state = v?.status === "listening" ? "listening" : v ? "voice" : mood === "urgent" ? "urgent" : mood === "look" ? "look" : "calm";
  const label = state === "listening" ? "Listening…" : state === "voice" ? "Bee heard you" : title;
  const href = v ? "#/bee" : "#/checkin";
  return (
    <a className={`island ${state}`} href={href} ref={onRef} role="status" aria-live="polite">
      <span className="island-lead">{state === "listening" || state === "voice" ? <Icon name="wave" size={18} stroke={2} /> : <span className="island-dot" />}</span>
      <span className="island-text">{label}</span>
      <span className="island-tail">
        {state === "listening" ? <Squiggle width={34} amp={3} wavelength={10} stroke={2} color="currentColor" animated /> : <Icon name="chevronRight" size={16} stroke={2.4} />}
      </span>
    </a>
  );
}
