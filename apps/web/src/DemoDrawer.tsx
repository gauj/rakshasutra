import { useState } from "react";
import { api, clock12, type State } from "./state";

/** Everything that is only for showing the prototype lives here, out of the product's way. */
export function DemoDrawer({ st }: { st: State }) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState("delay");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string>();
  const tz = st.child.tzOffsetMin;
  const speeds = [10, 30, 60, 120, 300, 600];

  const start = () => api("/api/demo/start", { method: "POST", body: JSON.stringify({ scenario }) });
  const stop = () => api("/api/demo/stop", { method: "POST" });
  const sendNote = async () => {
    if (!note.trim()) return;
    try {
      await api("/api/notes", { method: "POST", body: JSON.stringify({ text: note }) });
      setNote("");
      setMsg(undefined);
    } catch {
      setMsg("That does not sound like it is about Adam, a pick-up or a schedule, so I ignored it.");
    }
  };

  return (
    <>
      <button className="btn demo-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Close demo" : "Demo controls"}
      </button>
      {open && (
        <section className="card drawer" aria-label="Demo controls">
          <p className="eyebrow">Prototype demo</p>
          <label className="small muted" htmlFor="sc">Story</label>
          <select id="sc" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="delay">The unexpected delay (Bee notes)</option>
            <option value="schoolday">A school day with Bee (9 to 6)</option>
            <option value="abduction">Walk home goes wrong</option>
            <option value="everyday">A normal school day</option>
          </select>
          <div className="row">
            <button className="btn primary" onClick={start}>{st.run ? "Restart" : "Play"}</button>
            {st.run && <button className="btn" onClick={stop}>Stop</button>}
          </div>
          {st.run && (
            <>
              <p className="small muted" style={{ margin: "10px 0 0" }}>{st.run.title} · {clock12(st.now, tz)} on the child's clock</p>
              <div className="bar2"><i style={{ width: `${Math.round(st.run.progress * 100)}%` }} /></div>
              <label className="small muted" htmlFor="sp">Speed</label>
              <select id="sp" value={st.run.speed} onChange={(e) => api("/api/demo/speed", { method: "POST", body: JSON.stringify({ speed: Number(e.target.value) }) })}>
                {[...new Set([...speeds, st.run.speed])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v}x</option>)}
              </select>
            </>
          )}
          <p className="eyebrow" style={{ marginTop: 14 }}>Bee</p>
          <p className="small" style={{ margin: 0 }}>
            <span className={`dot ${st.bee.state === "live" ? "on" : ""}`} />
            {st.bee.state === "live" ? "Connected: your Bee's notes become plans." : st.bee.scriptedNotes ? "Not connected: the demo plays scripted notes." : st.bee.detail}
          </p>
          <p className="eyebrow" style={{ marginTop: 14 }}>Or type a note (not from Bee)</p>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendNote()} placeholder={`I'll pick ${st.child.name} up at 6 instead of 5:30`} aria-label="Type a note" />
          {msg && <p className="small" style={{ margin: "6px 0 0" }}>{msg}</p>}
        </section>
      )}
    </>
  );
}
