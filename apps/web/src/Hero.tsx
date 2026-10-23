import { fmtMph, type Alert } from "@rakshasutra/core";
import { Beera, type BeeraMood } from "./Beera";
import { Icon } from "./Icons";
import { agoText, clock12, moodOf, type State } from "./state";

/** The mark: a shield with a check. Raksha means protection; the check is the thread (sutra) that says all is well. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 L26.5 6.8 V15 C26.5 21.6 22.2 26.4 16 29 C9.8 26.4 5.5 21.6 5.5 15 V6.8 Z" fill="none" stroke="var(--text)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M10.6 15.6 L14.6 19.6 L21.6 11.8" fill="none" stroke="var(--mauve)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** What Adam is doing, in one friendly sentence. Used by the check-in page and the Bee page. */
export function sentence(st: State, open?: Alert) {
  const name = st.child.name;
  const n = st.now_state;
  const last = n?.last;
  const where = n?.zone;
  const plan = st.plans.find((p) => p.status === "confirmed");
  const tz = st.child.tzOffsetMin;

  if (st.tier === "critical") {
    return { mood: "Needs you now", title: `${name} may need help.`, sub: open ? `${open.sos.why[0]?.title ?? "Several signs point the same way"}. Here is what we know, and what we do not.` : "Several signs point the same way." };
  }
  if (st.tier === "warning") {
    const why = st.signals.find((s) => s.severity >= 3);
    return { mood: "Worth a look", title: why?.id === "LATE_ARRIVAL" ? `${name} has not checked in as expected.` : "Something is not as expected.", sub: why ? why.title + ". This is not a confirmed emergency." : "We are keeping an eye on it." };
  }
  if (!last) {
    return { mood: "Hello", title: `Waiting for ${name}'s first check-in.`, sub: plan ? "Your plan is set, so we will not worry early." : `Tell your Bee when you expect ${name} somewhere, and confirm it here.` };
  }
  const walking = n && (n.motion === "walking" || n.motion === "moving");
  const place = where ? `at ${where}` : walking ? `on the move (${fmtMph(n!.speedKmh)} mph)` : "somewhere new to us";
  const done = st.plans.find((p) => p.status === "completed");
  const tail = plan ? `On plan: expected home by ${clock12(plan.expectedAt, tz)}.` : done ? `Home as planned (by ${clock12(done.expectedAt, tz)}).` : "No plan set for today.";
  const cleared = open ? " Back to normal after your earlier alert." : "";
  const quiet = (n?.lastPingAgeMin ?? 0) >= 10 ? ` We have not heard from the band for ${Math.round(n!.lastPingAgeMin!)} min. That can be a flat battery or no coverage.` : "";
  return { mood: st.tier === "watch" ? "All good, one small note" : "All good!", title: `${name} is ${place}.`, sub: tail + cleared + quiet };
}

export function Hero({ st, open }: { st: State; open?: Alert }) {
  const mood = moodOf(st.tier);
  const s = sentence(st, open);
  const age = st.now_state?.lastPingAgeMin;
  const src = st.now_state?.last?.source;
  const face: BeeraMood = st.tier === "critical" ? "worried" : st.tier === "warning" ? "curious" : st.plans.some((p) => p.status === "completed") && !st.plans.some((p) => p.status === "confirmed") ? "cheer" : "happy";
  return (
    <section className={`hero ${mood}`} role={mood === "urgent" ? "alert" : "status"} aria-live="polite">
      <Beera mood={face} size={60} className="hero-bee" />
      <div className="mood">
        {mood !== "calm" && <span className="pulse" aria-hidden="true" />}
        {s.mood}
      </div>
      <h1>{s.title}</h1>
      <p>{s.sub}</p>
      <div className="meta">
        {age !== undefined && <span className={`chip ${age >= 10 ? "warn" : ""}`}>Last signal {agoText(age)}</span>}
        {src && <span className={`chip ${src === "sim" ? "demo" : ""}`}>{src === "sim" ? "Demo feed, not a real tracker" : src === "bee" ? "From Bee" : src === "phone" ? `From ${st.child.name}'s iPhone` : "Live"}</span>}
        <span className="chip"><Icon name="lock" size={14} stroke={2} /> Only you can see this</span>
      </div>
    </section>
  );
}
