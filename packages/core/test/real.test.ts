// Real-phone path: OwnTracks messages (untrusted input from the internet) and the engine on sparse phone data.
import { describe, expect, it } from "vitest";
import {
  Alert,
  buildScenario,
  DEFAULT_THRESHOLDS,
  DEMO_CHILD_ID,
  demoPlaces,
  demoProfile,
  GuardianEngine,
  ownTracksConfigLink,
  ownTracksToPing,
  Ping,
  ROBOTICS,
  HOME,
  SignalId,
} from "../src/index.js";

const local = (h: number, m: number) => Date.UTC(2026, 9, 14, h + 5, m); // local CDT -> UTC
const ping = (ts: number, o: Partial<Ping> & { lat: number; lon: number }): Ping => ({ childId: DEMO_CHILD_ID, ts, source: "phone", ...o });

describe("OwnTracks translation (input from the internet)", () => {
  const now = Date.UTC(2026, 9, 14, 22, 0);
  const good = { _type: "location", lat: 29.97, lon: -95.69, tst: Math.floor(now / 1000) - 30, acc: 12, batt: 64, vel: 5, cog: 90, t: "c", inregions: ["Home"], motionactivities: ["walking"], tid: "AY" };

  it("maps a real-looking location message", () => {
    const p = ownTracksToPing(good, "c", now)!;
    expect(p).toMatchObject({ childId: "c", lat: 29.97, lon: -95.69, accuracyM: 12, battery: 64, speedKmh: 5, headingDeg: 90, trigger: "c", source: "phone", regions: ["Home"], activity: ["walking"] });
    expect(p.ts).toBe(good.tst * 1000);
  });

  it("ignores everything that is not a location", () => {
    for (const bad of [null, "x", 5, [], { _type: "transition", lat: 1, lon: 1, tst: 1 }, { _type: "card" }, {}]) expect(ownTracksToPing(bad, "c", now)).toBeUndefined();
  });

  it("rejects impossible or hostile values", () => {
    expect(ownTracksToPing({ ...good, lat: 91 }, "c", now)).toBeUndefined();
    expect(ownTracksToPing({ ...good, lon: -181 }, "c", now)).toBeUndefined();
    expect(ownTracksToPing({ ...good, lat: "29.9" }, "c", now)).toBeUndefined();
    expect(ownTracksToPing({ ...good, lat: NaN }, "c", now)).toBeUndefined();
    expect(ownTracksToPing({ ...good, tst: Math.floor(now / 1000) + 3600 }, "c", now)).toBeUndefined(); // an hour in the future
    expect(ownTracksToPing({ ...good, tst: Math.floor(now / 1000) - 5 * 86400 }, "c", now)).toBeUndefined(); // days late
  });

  it("drops out-of-range extras instead of trusting them, and never copies unknown fields", () => {
    const p = ownTracksToPing({ ...good, batt: 500, vel: -3, cog: 900, acc: -1, evil: "<script>", inregions: ["ok", 5, ""] }, "c", now)!;
    expect(p.battery).toBeUndefined();
    expect(p.speedKmh).toBeUndefined();
    expect(p.headingDeg).toBeUndefined();
    expect(p.accuracyM).toBeUndefined();
    expect(p.regions).toEqual(["ok"]);
    expect(JSON.stringify(p)).not.toContain("script");
  });

  it("builds a one-tap setup link that carries the places and low-battery monitoring", () => {
    const link = ownTracksConfigLink({ baseUrl: "https://x.example", username: "ayaan", password: "pw", tid: "ay", places: [{ name: "Home", lat: 1, lon: 2, radiusM: 120 }] });
    expect(link.startsWith("owntracks:///config?inline=")).toBe(true);
    const cfg = JSON.parse(Buffer.from(link.split("inline=")[1]!, "base64").toString("utf8"));
    expect(cfg).toMatchObject({ _type: "configuration", mode: 3, url: "https://x.example/ingest/owntracks", auth: true, monitoring: 1, tid: "AY", cmd: false, allowRemoteLocation: false });
    expect(cfg.waypoints[0]).toMatchObject({ desc: "Home", lat: 1, lon: 2, rad: 120 });
  });
});

describe("engine with sparse real-phone data", () => {
  const fresh = (disabled: SignalId[] = []) => {
    const e = new GuardianEngine(demoPlaces, { ...DEFAULT_THRESHOLDS, disabledRules: disabled });
    e.register(demoProfile);
    return e;
  };

  it("trusts the phone's own 'I am inside Home', even when GPS says the edge", () => {
    const e = fresh();
    const outsideRadius = { lat: HOME.lat + 0.0016, lon: HOME.lon }; // about 180 m north, outside the 120 m zone
    const without = e.ingestPing(ping(local(17, 0), outsideRadius))!;
    expect(without.snapshot.zoneNow).toBeUndefined();
    const withRegion = e.ingestPing(ping(local(17, 1), { ...outsideRadius, regions: ["Home"] }))!;
    expect(withRegion.snapshot.zoneNow?.name).toBe("Home");
  });

  it("keeps history in order when queued reports arrive late, and drops exact repeats", () => {
    const e = fresh();
    e.ingestPing(ping(local(17, 10), { lat: 29.97, lon: -95.69 }));
    e.ingestPing(ping(local(17, 0), { lat: 29.98, lon: -95.7 }));
    expect(e.ingestPing(ping(local(17, 0), { lat: 29.98, lon: -95.7 }))).toBeUndefined();
    expect(e.pingsOf(DEMO_CHILD_ID).map((p) => p.ts)).toEqual([local(17, 0), local(17, 10)]);
  });

  it("uses the phone's reported speed and heading", () => {
    const e = fresh();
    const ev = e.ingestPing(ping(local(17, 0), { lat: 29.97, lon: -95.69, speedKmh: 36, headingDeg: 270 }))!;
    expect(ev.snapshot.speedMs).toBeCloseTo(10, 5);
    expect(ev.snapshot.headingDeg).toBe(270);
  });

  it("switches off rules that would cry wolf on a school bus, a friend's house or a quiet phone", () => {
    const off: SignalId[] = ["MODE_SHIFT_VEHICLE", "ABRUPT_STOP", "STATIONARY_LONG", "HR_ABNORMAL", "VOICE_DISTRESS", "SILENCE"];
    const e = fresh(off);
    const seen = new Set<SignalId>();
    for (const ev of buildScenario("abduction").events) {
      const r = ev.ping ? e.ingestPing(ev.ping) : ev.utterance ? e.ingestUtterance(ev.utterance) : e.tick(DEMO_CHILD_ID, ev.t);
      r?.signals.forEach((s) => seen.add(s.id));
    }
    for (const id of off) expect(seen.has(id), id).toBe(false);
  });

  it("the real use case: left robotics, never arrived home, then arrives (region events only)", () => {
    const e = fresh(["SILENCE"]);
    const seen: Alert[] = [];
    const feed = (r: ReturnType<typeof e.ingestPing>) => r?.newAlert && seen.push(r.newAlert);
    e.confirmPlan(e.proposeFromNote(DEMO_CHILD_ID, "Adam has robotics. I will pick him up at 5:30.", local(16, 30), "bee")!.id);

    feed(e.ingestPing(ping(local(16, 40), { lat: ROBOTICS.lat, lon: ROBOTICS.lon, regions: ["Robotics Center (demo)"], battery: 64, trigger: "c" })));
    feed(e.ingestPing(ping(local(17, 5), { lat: ROBOTICS.lat - 0.002, lon: ROBOTICS.lon, regions: [], battery: 62, trigger: "c" }))); // left the place
    for (let m = 10; m <= 44; m += 2) feed(e.tick(DEMO_CHILD_ID, local(17, m))); // nothing more is reported
    expect(seen).toHaveLength(0); // still inside the 15 minute grace

    feed(e.tick(DEMO_CHILD_ID, local(17, 46)));
    expect(seen).toHaveLength(1);
    const why = seen[0]!.sos.why.find((w) => w.id === "LATE_ARRIVAL")!;
    expect(why.detail).toContain("Robotics Center");
    expect(why.detail).toContain("does not confirm an emergency");
    expect(seen[0]!.sos.device.battery).toBe(62);

    // a late report finally says he is home: the plan completes and the alert clears
    e.ingestPing(ping(local(17, 52), { lat: HOME.lat, lon: HOME.lon, regions: ["Home"], battery: 60, trigger: "c" }));
    expect(e.plansOf(DEMO_CHILD_ID).some((p) => p.status === "completed")).toBe(true);
    expect(e.tick(DEMO_CHILD_ID, local(17, 53))!.signals.some((s) => s.id === "LATE_ARRIVAL")).toBe(false);
  });

  it("saves and restores the day across a restart", () => {
    const a = fresh();
    a.ingestPing(ping(local(17, 0), { lat: 29.97, lon: -95.69 }));
    a.confirmPlan(a.proposeFromNote(DEMO_CHILD_ID, "Pick up Adam at 5:30", local(16, 30), "bee")!.id);
    const saved = JSON.parse(JSON.stringify(a.exportState()));
    const b = fresh();
    b.importState(saved);
    expect(b.pingsOf(DEMO_CHILD_ID)).toHaveLength(1);
    expect(b.activePlan(DEMO_CHILD_ID)?.status).toBe("confirmed");
  });
});
