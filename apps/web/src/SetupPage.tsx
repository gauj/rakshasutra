// The one-time setup page (real mode): the iPhone link, the child's details and places, contacts and notifications.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Zone } from "@rakshasutra/core";
import { celebrate } from "./fx";
import { Icon } from "./Icons";
import { MapView, safePhoto } from "./MapView";
import { Page } from "./Page";
import { agoText, api, type State } from "./state";

// The shape returned by GET /api/setup.
interface Setup {
  child: { id: string; name: string; age: number; description?: string; medical?: string; photo?: string };
  contacts: { name: string; phone: string }[];
  zones: Zone[];
  notify: { ntfyTopic: string; ntfyIncludeName: boolean; publicUrl: string };
  iphone: { baseUrl: string; link?: string; qrSvg?: string; needsPublicAddress: boolean; username: string };
  device: { connected: boolean; lastAt: number | null; battery: number | null; count: number };
}

// A hard-to-guess notification topic name. Anyone who knows a topic can read it, so the name acts as a password.
const randomTopic = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return "ra-" + [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 20);
};

/** Shrink a chosen picture to a small centred square, so only a few KB are stored and nothing else in the file is kept. */
async function toSmallSquare(file: File, size = 128): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Everything a parent does once to make it real: the iPhone, the places, the family, the alerts. */
export function SetupPage({ st }: { st: State }) {
  const name = st.child.name;
  const [data, setData] = useState<Setup>();
  const [err, setErr] = useState<string>();
  const [zones, setZones] = useState<Zone[]>([]);
  const [contacts, setContacts] = useState<Setup["contacts"]>([]);
  const [about, setAbout] = useState({ age: 12, description: "", medical: "", photo: "" });
  const [notify, setNotify] = useState<Setup["notify"]>({ ntfyTopic: "", ntfyIncludeName: false, publicUrl: "" });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [pName, setPName] = useState("");
  const [pRadius, setPRadius] = useState(120);
  const [pPickup, setPPickup] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lon: number }>();
  const [picking, setPicking] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [testMsg, setTestMsg] = useState<string>();

  const load = useCallback(async () => {
    try {
      const d = await api<Setup>(`/api/setup?origin=${encodeURIComponent(location.origin)}`);
      setData(d);
      setZones(d.zones);
      setContacts(d.contacts);
      setAbout({ age: d.child.age, description: d.child.description ?? "", medical: d.child.medical ?? "", photo: d.child.photo ?? "" });
      setNotify(d.notify);
      setErr(undefined);
      setDirty(false);
    } catch {
      setErr("Setup is only for a real family. Run npm run setup:real first.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  // Access codes are never edited here: the server keeps them and ignores any sent from the browser.
  const save = async () => {
    setSaving(true);
    try {
      const d = await api<Setup>(`/api/setup?origin=${encodeURIComponent(location.origin)}`, {
        method: "PUT",
        body: JSON.stringify({ child: about, contacts, zones, notify }),
      });
      setData(d);
      setZones(d.zones);
      setContacts(d.contacts);
      setNotify(d.notify);
      setDirty(false);
      setErr(undefined);
      celebrate({ toast: "Saved." });
    } catch {
      setErr("Could not save. Check the details (an emergency number cannot be a contact).");
    } finally {
      setSaving(false);
    }
  };

  const addPlace = () => {
    if (!pName.trim() || !picked) return;
    setZones((z) => [...z, { id: pName.trim(), name: pName.trim(), kind: "safe", lat: picked.lat, lon: picked.lon, radiusM: pRadius, ...(pPickup ? { allowPickup: true } : {}) }]);
    setPName("");
    setPicked(undefined);
    setPicking(false);
    setPPickup(false);
    setDirty(true);
  };

  // Uses this device's location only to fill in the position of a place being added.
  const useMyLocation = () => {
    setGeoMsg("Finding you…");
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setPicked({ lat: p.coords.latitude, lon: p.coords.longitude });
        setGeoMsg(`Got it (accurate to about ${Math.round(p.coords.accuracy)} m).`);
      },
      () => setGeoMsg("I could not get your location. Allow location for this page, or pick a spot on the map."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const last = st.now_state?.last;
  const dev = data?.device;
  const mapZones = useMemo(() => zones, [zones]);

  if (err && !data) {
    return (
      <Page title="Set up" st={st}>
        <p className="muted">{err}</p>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page title="Set up" st={st}>
        <p className="muted">Loading…</p>
      </Page>
    );
  }

  return (
    <Page title="Set up" subtitle={`Do this once to follow ${name} for real`} st={st} wide>
      <div className="cols two">
        <div className="stack">
          <section className="card">
            <h2>{name}'s iPhone</h2>
            <p className="small" style={{ margin: "0 0 10px" }}>
              {dev?.connected ? (
                <>
                  <span className="dot on" />Connected. Last report {dev.lastAt ? agoText((Date.now() - dev.lastAt) / 60000) : "just now"}
                  {dev.battery !== null ? `, battery ${dev.battery}%` : ""}. {dev.count} reports so far.
                </>
              ) : (
                <>
                  <span className="dot" />Not connected yet.
                </>
              )}
            </p>
            {data.iphone.needsPublicAddress ? (
              <p className="reading">
                To connect the iPhone, open this app through its public address (the tunnel), then come back here. The iPhone cannot reach <b>localhost</b>. See <b>docs/REAL_USE.md</b>.
              </p>
            ) : (
              <>
                {data.iphone.qrSvg && <div className="qr" dangerouslySetInnerHTML={{ __html: data.iphone.qrSvg }} aria-label="QR code that sets up OwnTracks on the iPhone" role="img" />}
                <div className="row" style={{ marginTop: 12 }}>
                  <a className="btn primary" href={data.iphone.link}>Open on this phone</a>
                  <button className="btn" onClick={() => data.iphone.link && navigator.clipboard?.writeText(data.iphone.link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
                </div>
              </>
            )}
            <ol className="steps" style={{ marginTop: 14 }}>
              <li><div>On {name}'s iPhone, install <b>OwnTracks</b> from the App Store (free).</div></li>
              <li><div>Scan the QR code with the iPhone camera, or send him the link and tap it. OwnTracks fills in everything, including home and school.</div></li>
              <li><div>When asked, allow location <b>Always</b> and <b>Precise</b>, and keep Background App Refresh on.</div></li>
              <li><div>Walk him out the door and back, then check here that the reports arrive. Tell him it is on, and why.</div></li>
            </ol>
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              Low-battery mode reports when he enters or leaves a place and after bigger moves. It stays quiet while he sits still, so "no news" is normal, and the app only worries when a plan says he should have arrived.
            </p>
          </section>

          <section className="card">
            <h2>Alerts to your phone</h2>
            <p className="small muted" style={{ margin: "0 0 10px" }}>
              Install the free <b>ntfy</b> app, subscribe to your private topic, and you get a notification even when this app is closed. The notification never contains a location.
            </p>
            <div className="field">
              <label htmlFor="topic">Your private topic</label>
              <div className="ask-form">
                <input id="topic" className="input" value={notify.ntfyTopic} onChange={(e) => { setNotify({ ...notify, ntfyTopic: e.target.value }); setDirty(true); }} placeholder="Make one for me" />
                <button className="btn" onClick={() => { setNotify({ ...notify, ntfyTopic: randomTopic() }); setDirty(true); }}>Make one</button>
              </div>
            </div>
            <label className="check"><input type="checkbox" checked={notify.ntfyIncludeName} onChange={(e) => { setNotify({ ...notify, ntfyIncludeName: e.target.checked }); setDirty(true); }} /> Include {name}'s name in the notification</label>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={async () => { setTestMsg("Sending…"); try { await api("/api/setup/test-push", { method: "POST" }); setTestMsg("Sent. Check your phone."); } catch { setTestMsg("Could not send. Save first, and check the topic."); } }}>Send a test</button>
              {testMsg && <span className="small muted" style={{ alignSelf: "center" }}>{testMsg}</span>}
            </div>
          </section>

          <section className="card">
            <h2>About {name}</h2>
            <div className="field">
              <label htmlFor="photo">Photo on the map</label>
              <div className="photo-row">
                {safePhoto(about.photo) ? <img className="photo-prev" src={safePhoto(about.photo)} alt={`${name}'s photo`} /> : <span className="photo-prev empty">{name[0]}</span>}
                <label className="btn" htmlFor="photo">{about.photo ? "Change photo" : "Upload a photo"}</label>
                <input
                  id="photo"
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      setAbout((a) => ({ ...a, photo: "" }));
                      const url = await toSmallSquare(f);
                      setAbout((a) => ({ ...a, photo: url }));
                      setDirty(true);
                    } catch {
                      setErr("Could not read that picture. Try a JPG or PNG.");
                    }
                  }}
                />
                {about.photo && <button className="btn" onClick={() => { setAbout({ ...about, photo: "" }); setDirty(true); }}>Remove</button>}
              </div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>It is shrunk to a small square and kept only on this computer. It is shown on the map and on the home screen, never in alerts or share links.</p>
            </div>
            <div className="field"><label htmlFor="age">Age</label><input id="age" className="input" type="number" min={4} max={17} value={about.age} onChange={(e) => { setAbout({ ...about, age: Number(e.target.value) }); setDirty(true); }} /></div>
            <div className="field"><label htmlFor="desc">What he looks like (for responders)</label><input id="desc" className="input" value={about.description} onChange={(e) => { setAbout({ ...about, description: e.target.value }); setDirty(true); }} placeholder="Height, hair, usual backpack…" maxLength={200} /></div>
            <div className="field"><label htmlFor="med">Medical notes (for responders)</label><input id="med" className="input" value={about.medical} onChange={(e) => { setAbout({ ...about, medical: e.target.value }); setDirty(true); }} placeholder="Allergies, conditions…" maxLength={200} /></div>
            <h3 className="sub">Family contacts</h3>
            {contacts.map((c, i) => (
              <div className="zone-row" key={i}>
                <span><b>{c.name}</b> <span className="muted">{c.phone}</span></span>
                <button className="btn" onClick={() => { setContacts(contacts.filter((_, j) => j !== i)); setDirty(true); }} aria-label={`Remove ${c.name}`}><Icon name="xmark" size={16} stroke={2.4} /></button>
              </div>
            ))}
            {contacts.length < 5 && <ContactAdd onAdd={(c) => { setContacts([...contacts, c]); setDirty(true); }} />}
            <p className="small muted" style={{ margin: "8px 0 0" }}>Emergency numbers cannot be saved here. This app never dials or messages them.</p>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Places</h2>
            <p className="small muted" style={{ margin: "0 0 10px" }}>
              Safe places the iPhone watches for arrivals and departures. Add home, school and wherever he goes regularly.
            </p>
            <MapView className={`map small-map ${picking ? "pickable" : ""}`} zones={mapZones} trail={[]} last={last} initial={name[0]} onPick={picking ? (lat, lon) => setPicked({ lat, lon }) : undefined} pick={picked} />
            {zones.map((z, i) => (
              <div className="zone-row" key={z.id + i}>
                <span><b>{z.name}</b> <span className="muted">{z.radiusM} m{z.allowPickup ? ", pick-up spot" : ""}</span></span>
                <button className="btn" onClick={() => { setZones(zones.filter((_, j) => j !== i)); setDirty(true); }} aria-label={`Remove ${z.name}`}><Icon name="xmark" size={16} stroke={2.4} /></button>
              </div>
            ))}
            <h3 className="sub">Add a place</h3>
            <div className="field"><label htmlFor="pn">Name</label><input id="pn" className="input" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Home, School, Robotics…" maxLength={60} /></div>
            <div className="chips" style={{ marginBottom: 10 }}>
              <button onClick={useMyLocation}>Use my location now</button>
              {last && <button onClick={() => setPicked({ lat: last.lat, lon: last.lon })}>Use {name}'s last position</button>}
              <button onClick={() => setPicking(!picking)} aria-pressed={picking}>{picking ? "Tap the map…" : "Pick on the map"}</button>
            </div>
            {geoMsg && <p className="small muted" style={{ margin: "0 0 8px" }}>{geoMsg}</p>}
            {picked && <p className="small" style={{ margin: "0 0 8px" }}>Spot chosen: {picked.lat.toFixed(5)}, {picked.lon.toFixed(5)}</p>}
            <div className="seg" role="group" aria-label="Size of the place">
              {[80, 120, 200, 300].map((r) => (
                <button key={r} className={pRadius === r ? "on" : ""} onClick={() => setPRadius(r)}>{r} m</button>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={pPickup} onChange={(e) => setPPickup(e.target.checked)} /> A car stopping here is normal (school gate, home)</label>
            <button className="btn primary" style={{ marginTop: 10 }} onClick={addPlace} disabled={!pName.trim() || !picked}>Add this place</button>
          </section>
        </div>
      </div>

      {err && <p className="login-note">{err}</p>}
      <div className="savebar">
        <button className="btn primary" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : dirty ? "Save changes" : "All saved"}</button>
        {dirty && <span className="small muted">Changes to places update the iPhone link, so scan it again.</span>}
      </div>
    </Page>
  );
}

function ContactAdd({ onAdd }: { onAdd: (c: { name: string; phone: string }) => void }) {
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  return (
    <div className="ask-form" style={{ marginTop: 8 }}>
      <input className="input" value={n} onChange={(e) => setN(e.target.value)} placeholder="Name" aria-label="Contact name" maxLength={40} />
      <input className="input" value={p} onChange={(e) => setP(e.target.value)} placeholder="Phone" aria-label="Contact phone" inputMode="tel" maxLength={24} />
      <button className="btn" disabled={!n.trim() || !p.trim()} onClick={() => { onAdd({ name: n.trim(), phone: p.trim() }); setN(""); setP(""); }}>Add</button>
    </div>
  );
}
