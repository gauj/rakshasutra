import { useState } from "react";
import { api, clock12, type State } from "./state";

const SPEEDS = [120, 240, 600, 1200];

/**
 * The demo's time-lapse bar: play the day, hold it, drag to any hour, jump to a key moment, or change how fast it runs.
 * It only exists in demo mode, so a real child's day can never be fast-forwarded.
 */
export function TimeLapse({ st }: { st: State }) {
  const run = st.run;
  const tz = st.child.tzOffsetMin;
  const [drag, setDrag] = useState<number>();
  const post = (path: string, body?: object) => api(path, { method: "POST", body: JSON.stringify(body ?? {}) }).catch(() => undefined);

  if (!run) {
    return (
      <div className="timelapse idle" role="group" aria-label="Time-lapse">
        <button className="btn primary" onClick={() => post("/api/demo/start", { scenario: "schoolday" })}>
          Play a school day with Bee, 9 to 6
        </button>
      </div>
    );
  }

  const shown = drag ?? run.now;
  const commit = () => {
    if (drag === undefined) return;
    void post("/api/demo/seek", { ts: drag });
    setDrag(undefined);
  };
  const atEnd = run.now >= run.endTs - 1000;

  return (
    <div className="timelapse" role="group" aria-label="Time-lapse">
      <div className="tl-row">
        <button
          className="btn tl-play"
          onClick={() => (atEnd ? post("/api/demo/start", { scenario: run.name, speed: run.speed }) : post("/api/demo/pause", { paused: !run.paused }))}
          aria-label={atEnd ? "Play again" : run.paused ? "Play" : "Pause"}
        >
          {atEnd ? "↺" : run.paused ? "▶" : "❚❚"}
        </button>
        <div className="tl-clock" aria-live="off">{clock12(shown, tz)}</div>
        <input
          className="tl-slider"
          type="range"
          min={run.startTs}
          max={run.endTs}
          step={60_000}
          value={shown}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          aria-label="Time of day"
        />
        <div className="tl-speeds" role="group" aria-label="Speed">
          {SPEEDS.map((v) => (
            <button key={v} className={`chip-btn ${Math.round(run.speed) === v ? "on" : ""}`} onClick={() => post("/api/demo/speed", { speed: v })}>
              {v}×
            </button>
          ))}
        </div>
      </div>
      {run.chapters.length > 0 && (
        <div className="tl-chapters" role="group" aria-label="Key moments">
          {run.chapters.map((c) => (
            <button key={c.t} className={`chip-btn ${Math.abs(run.now - c.t) < 5 * 60_000 ? "on" : ""}`} onClick={() => post("/api/demo/seek", { ts: c.t })}>
              <b>{clock12(c.t, tz)}</b> {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
