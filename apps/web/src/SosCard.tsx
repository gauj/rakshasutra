// The alert card: what was noticed, what to do, and what is and is not known. Emergency numbers are shown, never dialled.
import { useState } from "react";
import { fmtMi, fmtMph, type Alert, type HrSummary } from "@rakshasutra/core";
import { clock12, moodOf, type State } from "./state";

// Tiny heart-rate chart; the dashed line marks the 180 bpm limit. Needs at least two readings.
function Sparkline({ hr }: { hr: HrSummary }) {
  const pts = hr.series;
  if (pts.length < 2) return null;
  const w = 260;
  const h = 48;
  const t0 = pts[0]!.ts;
  const t1 = pts[pts.length - 1]!.ts;
  const lo = Math.min(60, hr.min);
  const hi = Math.max(190, hr.max);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
  return (
    <svg width={w} height={h} role="img" aria-label={`Heart rate ${hr.min} to ${hr.max} beats per minute, ${hr.trend}`} style={{ display: "block", maxWidth: "100%" }}>
      <line x1="0" x2={w} y1={y(180)} y2={y(180)} stroke="var(--urgent)" strokeDasharray="3 3" opacity="0.6" />
      <polyline fill="none" stroke="var(--thread)" strokeWidth="2.5" points={pts.map((p) => `${x(p.ts).toFixed(1)},${y(p.hr).toFixed(1)}`).join(" ")} />
    </svg>
  );
}

interface Props {
  alert: Alert;
  st: State;
  /** The situation has returned to normal; the alert is kept for review until the parent closes it. */
  cleared: boolean;
  onAck: (id: string, falseAlarm: boolean) => void;
  onShare: () => Promise<string | undefined>;
}

/**
 * The alert, explained: what we noticed, what was expected, what we know, what we do not know,
 * and a few calm steps. Emergency numbers are text only: the app never dials them.
 */
export function SosCard({ alert, st, cleared, onAck, onShare }: Props) {
  const s = alert.sos;
  const tz = st.child.tzOffsetMin;
  const name = st.child.name;
  const mood = moodOf(alert.tier);
  const plan = st.plans.find((p) => p.status === "confirmed" || p.status === "completed");
  const [copied, setCopied] = useState<string>();
  const [link, setLink] = useState<string>();
  const copy = (key: string, text: string) => navigator.clipboard?.writeText(text).then(() => setCopied(key));
  const emergency = s.emergencyNumbers[0]!;
  const backups = s.contacts.slice(1);
  const lastPlace = s.lastMovement?.place ?? s.locationContext;

  if (cleared) {
    return (
      <section className="card">
        <p className="eyebrow">Earlier alert, now cleared · {clock12(alert.raisedAt, tz)}</p>
        <p style={{ margin: "0 0 12px" }}>{s.headline}. Things look normal again.</p>
        <div className="row">
          <button className="btn calm" onClick={() => onAck(alert.id, false)}>Got it, close this</button>
          <button className="btn" onClick={() => onAck(alert.id, true)}>It was a false alarm</button>
        </div>
      </section>
    );
  }

  // Only facts we actually have; what is missing is listed separately under "What we do not know".
  const known: string[] = [];
  if (s.locationContext) known.push(`${s.dataFreshness === "live" ? "Now" : "Last seen"}: ${s.locationContext}`);
  if (s.position) known.push(`Last signal ${s.position.ageMin} min ago${s.position.accuracyM ? `, accurate to about ${Math.round(s.position.accuracyM * 3.28084)} ft` : ""}`);
  known.push(s.motion === "still" || s.motion === "unknown" ? "Not moving at the last reading" : `Moving ${fmtMph(s.speedKmh)} mph${s.compass ? `, heading ${s.compass}` : ""}`);
  if (s.lastMovement) known.push(`Last movement ${s.lastMovement.ageMin} min ago${s.lastMovement.place ? `, near ${s.lastMovement.place}` : ""}`);
  if (s.hr) known.push(`Heart rate ${s.hr.latest} bpm, ${s.hr.trend}`);

  return (
    <section className={`card sos ${mood}`} aria-label="Alert details">
      <p className="eyebrow">{alert.tier === "critical" ? "Needs you now" : "Worth a look"} · raised {clock12(alert.raisedAt, tz)}</p>

      <div className="sos-grid">
      <div className="sos-a">
      <h2>What we noticed</h2>
      <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
        {s.why.map((w) => (
          <li key={w.id} style={{ margin: "6px 0" }}>
            <b>{w.title}.</b> <span className="muted">{w.detail}</span>
          </li>
        ))}
      </ul>
      {s.lastVoiceFlag && (
        <p className="reading" style={{ marginTop: 0 }}>
          <b>Heard on the band:</b> “{s.lastVoiceFlag.snippet}”
        </p>
      )}

      <h2 style={{ marginTop: 18 }}>What you can do</h2>
      <ol className={`steps ${mood}`}>
        <li><div><b>Try {name}.</b> Call or message {name} first.</div></li>
        <li>
          <div>
            {alert.tier === "critical" ? <b>Reach someone who can get to him.</b> : <b>Check with someone near {lastPlace ?? "where he was"}.</b>}
            {backups.length > 0 && <div className="muted small">{backups.map((c) => `${c.name} ${c.phone}`).join(" · ")}</div>}
          </div>
        </li>
        <li>
          <div>
            {alert.tier === "critical" ? (
              <>
                <b>If you cannot reach him, call emergency services yourself</b> ({emergency.number}).
                <div className="muted small">This app never dials for you. Copy the brief below and read it to them.</div>
              </>
            ) : (
              <>
                <b>We keep watching.</b> If this gets worse we tell you straight away, and remind you until you answer.
              </>
            )}
          </div>
        </li>
      </ol>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={() => onAck(alert.id, false)}>I am handling it</button>
        <button className="btn" onClick={() => onAck(alert.id, true)}>It is fine, false alarm</button>
        <button className="btn" onClick={() => copy("brief", s.emergencyBrief)}>{copied === "brief" ? "Copied" : "Copy brief for responders"}</button>
        <button className="btn" onClick={() => copy("all", s.longText)}>{copied === "all" ? "Copied" : "Copy all details"}</button>
        <button className="btn" onClick={async () => setLink(await onShare())}>Share a live link</button>
      </div>
      {link && (
        <p className="small" style={{ marginTop: 10, wordBreak: "break-all" }}>
          Read-only link (position and movement only, expires in 2 hours): <b>{link}</b>
          <br />
          <span className="muted">It opens on this computer's network only until the app is deployed.</span>
        </p>
      )}

      </div>
      <div className="sos-b">
      <div className="explain">
        <div className="expected">
          <h3>Expected</h3>
          {plan ? (
            <ul>
              <li>{name} home by {clock12(plan.expectedAt, tz)}</li>
              <li>{plan.title}</li>
            </ul>
          ) : (
            <p className="small" style={{ margin: 0 }}>No plan was set, so we compared with ordinary movement and a steady signal.</p>
          )}
        </div>
        <div className="known">
          <h3>What we know</h3>
          <ul>{known.map((k) => <li key={k}>{k}</li>)}</ul>
        </div>
        <div className="unknown">
          <h3>What we do not know</h3>
          <ul>{s.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
      </div>

      <details className="more">
        <summary>Movement, heart rate, nearest help</summary>
        <div className="kv">
          <div><b>{s.motion === "still" || s.motion === "unknown" ? "Still" : `${fmtMph(s.speedKmh)} mph`}</b><span>now{s.compass ? `, heading ${s.compass}` : ""}</span></div>
          <div><b>{fmtMph(s.maxSpeed15mKmh)} mph</b><span>top speed, 15 min up to last signal</span></div>
          <div><b>{fmtMi(s.distance3hKm)} mi</b><span>travelled in 3 hours</span></div>
          <div><b>{s.device.battery ?? "n/a"}{s.device.battery !== undefined ? "%" : ""}</b><span>battery{s.device.batteryDrainPctPerHour ? `, down ${s.device.batteryDrainPctPerHour}% an hour` : ""}</span></div>
        </div>
        {s.hr && (
          <>
            <p className="eyebrow">Heart rate before the last signal</p>
            <Sparkline hr={s.hr} />
            <p className="small muted" style={{ margin: "4px 0 12px" }}>{s.hr.min} to {s.hr.max} bpm, average {s.hr.avg}. The dashed line is 180.</p>
          </>
        )}
        <p className="eyebrow">Nearest help</p>
        {s.nearestPlaces.map((p) => (
          <div className="li" key={p.name}><span>{p.name}</span><span className="muted">{(p.distanceM / 1609.344).toFixed(1)} mi</span></div>
        ))}
      </details>
      </div>
      </div>
    </section>
  );
}
