// The day as a thread of knots, newest first, built from the server's timeline and the current plan.
import { useState } from "react";
import { compass, fmtDist, fmtMph } from "@rakshasutra/core";
import type { TimelineSegment } from "@rakshasutra/core";
import { clock12, moodOf, type State } from "./state";

// One knot on the thread.
interface Item {
  key: string;
  cls: string;
  when: string;
  what: string;
  more?: string;
}

// Turns a timeline segment into a knot. isNow marks the newest one; concern tints a vehicle ride when the tier is not calm.
function describe(seg: TimelineSegment, isNow: boolean, tz: number, concern: boolean): Item {
  const from = clock12(seg.from, tz);
  const to = clock12(seg.to, tz);
  const mins = Math.max(1, Math.round((seg.to - seg.from) / 60000));
  const dir = seg.headingDeg !== undefined ? ` heading ${compass(seg.headingDeg)}` : "";
  const base = { key: String(seg.from), when: isNow ? `since ${from}` : `${from} to ${to}` };
  switch (seg.kind) {
    case "still": {
      const relative = /^\d.* of /.test(seg.endPlace);
      return { ...base, cls: isNow ? "now" : "", what: relative ? `Stopped ${seg.endPlace}` : `At ${seg.endPlace}`, more: `${mins} min` };
    }
    case "walking":
      return { ...base, cls: isNow ? "now" : "", what: `Walked ${fmtDist(seg.distanceM)}`, more: `${seg.startPlace} to ${seg.endPlace}` };
    case "moving":
      return { ...base, cls: isNow ? "now" : "", what: `Moved ${fmtDist(seg.distanceM)} at a running or cycling pace`, more: `${seg.startPlace} to ${seg.endPlace}` };
    case "vehicle":
      return { ...base, cls: `ride ${concern ? "look" : ""} ${isNow ? "now" : ""}`, what: `In a vehicle for ${fmtDist(seg.distanceM)}`, more: `${fmtMph(seg.avgKmh)} mph${dir}. ${seg.startPlace} to ${seg.endPlace}` };
    case "no-signal":
      return { ...base, cls: `lost ${isNow ? "now" : ""}`, what: "No signal", more: `Last seen ${seg.startPlace}. A missing signal can be a flat battery or no coverage, not only danger.` };
  }
}

/**
 * The day as a thread of knots: places, walks and rides. Where the signal was lost the thread is dashed;
 * where the day is expected to go next it is dotted.
 */
export function DayThread({ st }: { st: State }) {
  const [all, setAll] = useState(false);
  const tz = st.child.tzOffsetMin;
  const mood = moodOf(st.tier);
  const segs = st.day.timeline;
  const plan = st.plans.find((p) => p.status === "confirmed");
  const done = st.plans.find((p) => p.status === "completed");

  const past = [...segs].reverse().map((s, i) => describe(s, i === 0, tz, mood !== "calm"));
  if (past[0] && mood !== "calm" && !past[0].cls.includes("lost")) past[0].cls += ` ${mood}`;
  const shown = all ? past : past.slice(0, 5);

  const top: Item[] = [];
  if (plan) {
    const overdue = st.now > plan.expectedAt + plan.graceMin * 60_000;
    top.push({
      key: "expected",
      cls: `future ${overdue ? "look" : ""}`,
      when: overdue ? "overdue" : "expected",
      what: `Home by ${clock12(plan.expectedAt, tz)}`,
      more: `${plan.title}${plan.previousExpectedAt ? `. Changed from ${clock12(plan.previousExpectedAt, tz)}` : ""}`,
    });
  } else if (done) {
    top.push({ key: "done", cls: "now", when: "as planned", what: `Home by ${clock12(done.expectedAt, tz)}`, more: done.title });
  }

  if (!past.length && !top.length) {
    return <p className="muted small">The day's thread starts with the first check-in.</p>;
  }

  return (
    <div>
      <ol className="thread" aria-label={`${st.child.name}'s day, newest first`}>
        {[...top, ...shown].map((it) => (
          <li key={it.key} className={it.cls}>
            <span className="knot" aria-hidden="true" />
            <div className="when">{it.when}</div>
            <div className="what">{it.what}</div>
            {it.more && <div className="more">{it.more}</div>}
          </li>
        ))}
      </ol>
      {past.length > 5 && (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? "Show less" : `Show the earlier ${past.length - 5} parts of the day`}
        </button>
      )}
    </div>
  );
}
