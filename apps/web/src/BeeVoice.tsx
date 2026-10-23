import type { Plan } from "@rakshasutra/core";
import { Icon } from "./Icons";
import { clock12, type State } from "./state";

/** Where the guardian's Bee speaks: what it heard, what we understood, and a clear way to confirm. */
export function BeeVoice({ st, onAct }: { st: State; onAct: (id: string, what: "confirm" | "reject") => void }) {
  const tz = st.child.tzOffsetMin;
  const pending: Plan | undefined = st.plans.find((p) => p.status === "proposed");
  const active = st.plans.find((p) => p.status === "confirmed");
  const live = st.bee.state === "live";

  if (!pending && !active) {
    return (
      <section className="card bee">
        <div className="icon" aria-hidden="true"><Icon name="wave" size={22} stroke={2} /></div>
        <div>
          <p className="eyebrow">Your Bee</p>
          <p style={{ margin: 0 }}>
            Say it out loud: <i>"{st.child.name} has practice, I'll pick him up at 5:30."</i> I will turn it into a plan for you to confirm, so a late alert only fires when it should.
          </p>
          <p className="small muted" style={{ margin: "8px 0 0" }}>{live ? "Your Bee is listening." : "Your Bee is not connected in this run; the demo plays scripted notes."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card bee">
      <div className="icon" aria-hidden="true"><Icon name="wave" size={22} stroke={2} /></div>
      <div>
        {pending ? (
          <>
            <p className="eyebrow">{pending.source === "bee" ? "Your Bee heard" : "You typed (not from Bee)"}</p>
            <p className="quote">{pending.sourceText}</p>
            <p className="reading"><b>I understood:</b> {pending.interpretation}</p>
            {pending.confidence < 0.7 && <p className="small muted" style={{ margin: "0 0 10px" }}>I am not fully sure about the time. Please check it.</p>}
            <div className="row">
              <button className="btn calm" onClick={() => onAct(pending.id, "confirm")}>Yes, that is right</button>
              <button className="btn" onClick={() => onAct(pending.id, "reject")}>Not quite</button>
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">Today's plan</p>
            <p style={{ margin: 0 }}>
              <b>{active!.title}.</b> Expecting {st.child.name} home by <b>{clock12(active!.expectedAt, tz)}</b>.
              {active!.previousExpectedAt ? <span className="muted"> It was {clock12(active!.previousExpectedAt, tz)}.</span> : null}
            </p>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              You will only hear from us about this after {clock12(active!.expectedAt + active!.graceMin * 60_000, tz)}.
              {st.bee.remindersWritten > 0 ? " A reminder is on your Bee." : ""}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
