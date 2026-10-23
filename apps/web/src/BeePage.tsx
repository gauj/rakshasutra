import type { Alert } from "@rakshasutra/core";
import { Beera } from "./Beera";
import { sentence } from "./Hero";
import { Page } from "./Page";
import { Squiggle } from "./Squiggle";
import { agoText, api, clock12, type State } from "./state";

interface Props {
  st: State;
  open?: Alert;
  /** Close the view and go back to where the guardian was. */
  onDone: () => void;
}

/**
 * Shown the moment the guardian talks to their Bee about the child: what they said (as a message),
 * what Bee understood or answered, and what the child is doing right now.
 */
export function BeePage({ st, open, onDone }: Props) {
  const v = st.voice!;
  const tz = st.child.tzOffsetMin;
  const name = st.child.name;
  const plan = v.planId ? st.plans.find((p) => p.id === v.planId) : undefined;
  const now = sentence(st, open);
  const listening = v.status === "listening";
  const age = st.now_state?.lastPingAgeMin;
  const act = (id: string, what: "confirm" | "reject") => api(`/api/plans/${id}/${what}`, { method: "POST" });

  let reply: React.ReactNode = null;
  if (!listening) {
    if (v.kind === "plan" && plan) {
      if (plan.status === "proposed") {
        reply = (
          <>
            Got it. <b>{plan.interpretation}</b> Is that right?
            {plan.confidence < 0.7 && <span className="bubble-note">I am not fully sure about the time, so please check it.</span>}
            <span className="bubble-actions">
              <button className="btn calm" onClick={() => act(plan.id, "confirm")}>Yes, that's right</button>
              <button className="btn" onClick={() => act(plan.id, "reject")}>Not quite</button>
            </span>
          </>
        );
      } else if (plan.status === "rejected") {
        reply = <>No problem, I dropped that one. Tell me again whenever you like.</>;
      } else {
        reply = (
          <>
            All set. {plan.title}: {name} home by <b>{clock12(plan.expectedAt, tz)}</b>. I will only bother you after {clock12(plan.expectedAt + plan.graceMin * 60_000, tz)}.
          </>
        );
      }
    } else if (v.kind === "question") {
      reply = <>Good question. Here is the latest on {name}, below.</>;
    } else {
      reply = <>I heard you mention {name}, but I could not find a time or a question. Try: “I'll pick him up at 5:30.”</>;
    }
  }

  return (
    <Page title="Bee" subtitle={listening ? "Listening…" : "Here is what I heard"} st={st}>
      <div className="chat" aria-live="polite">
        <div className="msg you">
          <span className="who">You{v.source === "typed" ? " (typed, not from Bee)" : ""}</span>
          <div className="bubble you">
            “{v.said}”
            {listening && <span className="bubble-wave"><Squiggle width={44} amp={3.5} wavelength={12} stroke={2.4} color="currentColor" animated /></span>}
          </div>
        </div>

        <div className="msg bee">
          <span className="who">Bee</span>
          <div className="with-avatar">
            <Beera mood={listening ? "listening" : v.kind === "plan" && plan?.status === "confirmed" ? "cheer" : "happy"} size={34} />
            <div className="bubble bee">
              {listening ? <Squiggle width={44} amp={3.5} wavelength={12} stroke={2.4} color="var(--subtext0)" animated /> : reply}
            </div>
          </div>
        </div>
      </div>

      <section className="group" aria-label={`${name} right now`}>
        <div className="group-head">{name} right now</div>
        <div className="group-row stack-text">
          <b>{now.title}</b>
          <span className="muted">{now.sub}{age !== undefined ? ` Last signal ${agoText(age)}.` : ""}</span>
        </div>
      </section>

      <div className="row">
        <button className="btn primary" onClick={onDone}>Done</button>
        <a className="btn" href="#/checkin">Open Check-in</a>
      </div>
    </Page>
  );
}
