// Engine tests: the demo scenarios, consent, individual rules, Bee event mapping and schedule-note parsing.
import { describe, expect, it } from "vitest";
import {
  Alert,
  buildReport,
  buildScenario,
  ChildProfile,
  DEMO_CHILD_ID,
  demoPlaces,
  demoProfile,
  GuardianEngine,
  mapBeeEvent,
  ScenarioName,
  SignalId,
} from "../src/index.js";

// Plays a scenario's events into a fresh engine; returns the signals seen and the alerts raised.
function run(name: ScenarioName, profile: ChildProfile = demoProfile) {
  const engine = new GuardianEngine(demoPlaces);
  engine.register(profile);
  const sc = buildScenario(name);
  const seen = new Set<SignalId>();
  const raised: Alert[] = [];
  for (const e of sc.events) {
    const ev = e.ping
      ? engine.ingestPing(e.ping)
      : e.utterance
        ? engine.ingestUtterance(e.utterance)
        : engine.tick(DEMO_CHILD_ID, e.t);
    ev?.signals.forEach((s) => seen.add(s.id));
    if (ev?.newAlert) raised.push(ev.newAlert);
  }
  return { engine, sc, seen, raised };
}

describe("everyday scenario", () => {
  it("raises no alerts (safe zones + exertion are not threats)", () => {
    const { raised, seen } = run("everyday");
    expect(raised).toHaveLength(0);
    expect(seen.has("MODE_SHIFT_VEHICLE")).toBe(false);
    expect(seen.has("SILENCE")).toBe(false);
  });

  it("produces an all-clear wellbeing report with stays at home and school", () => {
    const { engine, sc } = run("everyday");
    const r = buildReport(demoProfile, engine.pingsOf(DEMO_CHILD_ID), engine.alerts, sc.startTs, sc.endTs);
    expect(r.wellbeing).toBe("all-clear");
    expect(r.stays.map((s) => s.place).join()).toContain("Smith Middle School");
    expect(r.hr!.max).toBeLessThan(180);
  });
});

describe("abduction scenario", () => {
  const out = run("abduction");

  it("detects every expected signal", () => {
    for (const id of ["MODE_SHIFT_VEHICLE", "VOICE_DISTRESS", "ABRUPT_STOP", "SILENCE", "HR_ABNORMAL"] as SignalId[]) {
      expect(out.seen.has(id), id).toBe(true);
    }
  });

  it("raises a critical SOS quickly after the vehicle pick-up and does not spam", () => {
    const first = out.raised[0]!;
    expect(first.tier).toBe("critical");
    expect(out.raised.length).toBeLessThanOrEqual(8);
    // Raised within 5 virtual minutes of the vehicle ramp starting (~15:12).
    const ramp = Date.UTC(2026, 9, 14, 20, 12);
    expect(first.raisedAt - ramp).toBeLessThan(5 * 60_000);
  });

  it("SOS carries the details a parent needs", () => {
    const sos = out.raised.find((a) => a.sos.why.some((w) => w.id === "MODE_SHIFT_VEHICLE"))!.sos;
    expect(sos.position).toBeDefined();
    expect(sos.speedKmh).toBeGreaterThan(20);
    expect(sos.compass).toBeDefined();
    expect(sos.trail3h.length).toBeGreaterThan(10);
    expect(sos.nearestPlaces.length).toBe(3);
    expect(sos.predicted10Min).toBeDefined();
    expect(sos.smsText.length).toBeLessThan(480);
    expect(sos.emergencyNumbers[0]!.number).toBe("911");
  });

  it("groups follow-ups into one incident with a short headline", () => {
    const ids = new Set(out.raised.map((a) => a.incidentId));
    expect(ids.size).toBe(1);
    expect(out.raised.every((a) => a.sos.headline.length < 90)).toBe(true);
    const r = buildReport(demoProfile, out.engine.pingsOf(DEMO_CHILD_ID), out.engine.alerts, out.sc.startTs, out.sc.endTs);
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0]!.updates).toBe(out.raised.length);
    expect(r.narrative).toContain("Critical incident");
  });

  it("flags attention zone and reports concern", () => {
    const r = buildReport(demoProfile, out.engine.pingsOf(DEMO_CHILD_ID), out.engine.alerts, out.sc.startTs, out.sc.endTs);
    expect(r.wellbeing).toBe("concern");
    expect(r.alerts.length).toBeGreaterThan(0);
  });
});

describe("consent", () => {
  it("drops everything without location consent", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register({ ...demoProfile, consent: { location: false, voice: false, heartRate: false } });
    const sc = buildScenario("abduction");
    for (const ev of sc.events) if (ev.ping) e.ingestPing(ev.ping);
    expect(e.pingsOf(DEMO_CHILD_ID)).toHaveLength(0);
  });

  it("ignores voice and strips heart rate unless opted in", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register({ ...demoProfile, consent: { location: true, voice: false, heartRate: false } });
    const sc = buildScenario("abduction");
    const seen = new Set<SignalId>();
    for (const ev of sc.events) {
      const r = ev.ping ? e.ingestPing(ev.ping) : ev.utterance ? e.ingestUtterance(ev.utterance) : e.tick(DEMO_CHILD_ID, ev.t);
      r?.signals.forEach((s) => seen.add(s.id));
    }
    expect(seen.has("VOICE_DISTRESS")).toBe(false);
    expect(seen.has("HR_ABNORMAL")).toBe(false);
    expect(e.pingsOf(DEMO_CHILD_ID).every((p) => p.hr === undefined)).toBe(true);
  });
});

describe("individual rules", () => {
  const base = Date.UTC(2026, 9, 14, 17, 0);
  const fresh = () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    return e;
  };
  const far = { lat: 30.2, lon: -95.2 }; // outside every zone

  it("flags 3 hours without movement outside a safe zone", () => {
    const e = fresh();
    let last;
    for (let m = 0; m <= 185; m += 5) last = e.ingestPing({ childId: DEMO_CHILD_ID, ts: base + m * 60_000, ...far, source: "sim" });
    expect(last!.signals.some((s) => s.id === "STATIONARY_LONG")).toBe(true);
  });

  it("does not flag 3 hours stationary inside the school", () => {
    const e = fresh();
    let last;
    for (let m = 0; m <= 185; m += 5)
      last = e.ingestPing({ childId: DEMO_CHILD_ID, ts: base + m * 60_000, lat: demoProfile.zones[1]!.lat, lon: demoProfile.zones[1]!.lon, source: "sim" });
    expect(last!.signals.some((s) => s.id === "STATIONARY_LONG")).toBe(false);
  });

  it("applies the 30/180 bpm thresholds", () => {
    const e = fresh();
    const hi = e.ingestPing({ childId: DEMO_CHILD_ID, ts: base, ...far, hr: 190, source: "sim" });
    expect(hi!.signals.find((s) => s.id === "HR_ABNORMAL")?.severity).toBe(6);
    const lo = e.ingestPing({ childId: DEMO_CHILD_ID, ts: base + 60_000, ...far, hr: 25, source: "sim" });
    expect(lo!.signals.some((s) => s.id === "HR_ABNORMAL")).toBe(true);
    const ok = e.ingestPing({ childId: DEMO_CHILD_ID, ts: base + 120_000, ...far, hr: 120, source: "sim" });
    expect(ok!.signals.some((s) => s.id === "HR_ABNORMAL")).toBe(false);
  });

  it("acknowledging as false alarm closes the alert", () => {
    const { engine, raised } = run("abduction");
    const a = engine.acknowledge(raised[0]!.id, true);
    expect(a!.status).toBe("false-alarm");
  });
});

describe("Bee event mapping", () => {
  it("maps location and utterance shapes defensively", () => {
    const loc = mapBeeEvent("c", "update-location", { data: { location: { latitude: 1.5, longitude: 2.5, timestamp: 1000 } } });
    expect(loc.ping).toMatchObject({ lat: 1.5, lon: 2.5, ts: 1000, source: "bee" });
    const u = mapBeeEvent("c", "new-utterance", { text: "hello" });
    expect(u.utterance?.text).toBe("hello");
    expect(mapBeeEvent("c", "update-location", { nope: 1 })).toEqual({});
  });
});

describe("schedule notes", () => {
  const ts = Date.UTC(2026, 9, 14, 21, 31); // 16:31 local (UTC-5)
  const local = (h: number, m: number) => Date.UTC(2026, 9, 14, h + 5, m);

  it("reads a pick-up time", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const p = e.proposeFromNote(DEMO_CHILD_ID, "Aarav has robotics practice today. Practice ends at 5 and I'll pick him up at 5:30.", ts, "bee");
    expect(p?.expectedAt).toBe(local(17, 30));
    expect(p?.status).toBe("proposed");
    expect(p?.title).toBe("Robotics practice");
  });

  it("reads a time with a space after the colon, as real Bee transcripts render it", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const p = e.proposeFromNote(DEMO_CHILD_ID, "Aarav has robotics practice, I will pick him up at 5: 30.", ts, "bee");
    expect(p?.expectedAt).toBe(local(17, 30));
  });

  it("reads a changed time ('6 instead of 5:30') and remembers the old one", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const p = e.proposeFromNote(DEMO_CHILD_ID, "I'll pick him up at 6 instead of 5:30", ts, "bee");
    expect(p?.expectedAt).toBe(local(18, 0));
    expect(p?.previousExpectedAt).toBe(local(17, 30));
  });

  it("reads a spelled-out hour, as real Bee transcripts sometimes render it", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const p = e.proposeFromNote(
      DEMO_CHILD_ID,
      "Aarav's robotics practice is running late, I'll pick him up at six instead of 5: 30",
      ts,
      "bee",
    );
    expect(p?.expectedAt).toBe(local(18, 0));
    expect(p?.previousExpectedAt).toBe(local(17, 30));
  });

  it("shifts the active plan when told it is running late with no new time", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    e.confirmPlan(e.proposeFromNote(DEMO_CHILD_ID, "Pick up Aarav at 5:30", ts, "bee")!.id);
    const p = e.proposeFromNote(DEMO_CHILD_ID, "Practice is running 20 minutes late", ts, "bee");
    expect(p?.expectedAt).toBe(local(17, 50));
    expect(p?.confidence).toBeLessThan(0.7);
  });

  it("ignores notes that are not about the schedule", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    expect(e.proposeFromNote(DEMO_CHILD_ID, "Remember to buy milk and call the plumber at 3", ts, "bee")).toBeUndefined();
  });

  it("proposals do nothing until the guardian confirms", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    e.proposeFromNote(DEMO_CHILD_ID, "Pick up Aarav at 5:30", ts, "bee");
    expect(e.activePlan(DEMO_CHILD_ID)).toBeUndefined();
  });
});

describe("delay scenario (late arrival, then a changed plan)", () => {
  const engine = new GuardianEngine(demoPlaces);
  engine.register(demoProfile);
  const sc = buildScenario("delay");
  const timeline: { t: number; tier: string; signals: SignalId[] }[] = [];
  const raised: Alert[] = [];
  for (const e of sc.events) {
    if (e.note) engine.proposeFromNote(DEMO_CHILD_ID, e.note, e.t, "typed");
    if (e.planAction) {
      const latest = [...engine.plansOf(DEMO_CHILD_ID)].reverse().find((p) => p.status === "proposed");
      if (latest) engine.confirmPlan(latest.id);
    }
    const ev = e.ping ? engine.ingestPing(e.ping) : e.tick || e.note || e.planAction ? engine.tick(DEMO_CHILD_ID, e.t) : undefined;
    if (ev) timeline.push({ t: e.t, tier: ev.tier, signals: ev.signals.map((s) => s.id) });
    if (ev?.newAlert) raised.push(ev.newAlert);
  }
  const local = (h: number, m: number) => Date.UTC(2026, 9, 14, h + 5, m);

  it("stays quiet until 15 min after the expected check-in", () => {
    const before = timeline.filter((x) => x.t < local(17, 45));
    expect(before.every((x) => !x.signals.includes("LATE_ARRIVAL"))).toBe(true);
    expect(raised).toHaveLength(1);
    expect(raised[0]!.raisedAt).toBeGreaterThanOrEqual(local(17, 45));
    expect(raised[0]!.raisedAt).toBeLessThan(local(17, 47));
  });

  it("explains what was expected and what is unknown", () => {
    const w = raised[0]!.sos.why.find((s) => s.id === "LATE_ARRIVAL")!;
    expect(w.detail).toContain("5:30 PM");
    expect(w.detail).toContain("Robotics Center");
    expect(w.detail).toContain("location currently unavailable");
    expect(w.detail).toContain("does not confirm an emergency");
    expect(raised[0]!.tier).toBe("warning");
  });

  it("clears after the guardian confirms the new pick-up time, and completes on arrival home", () => {
    const after = timeline.filter((x) => x.t >= local(17, 48));
    expect(after.every((x) => !x.signals.includes("LATE_ARRIVAL"))).toBe(true);
    expect(engine.plansOf(DEMO_CHILD_ID).map((p) => p.status)).toEqual(["superseded", "completed"]);
    expect(raised).toHaveLength(1); // no new alert for the pick-up drive or later
  });
});
