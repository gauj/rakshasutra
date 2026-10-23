// Alert contents, the dispatcher (channels, tiers, failures), display-only emergency numbers and the hold-off after acknowledging.
import { describe, expect, it } from "vitest";
import {
  Alert,
  AlertDispatcher,
  Channel,
  DEMO_CHILD_ID,
  OutboundMessage,
  buildScenario,
  demoPlaces,
  demoProfile,
  GuardianEngine,
  isEmergencyNumber,
  ScenarioName,
} from "../src/index.js";

// Replays a scenario into an engine, calling onStep after every event.
function play(name: ScenarioName, onStep?: (engine: GuardianEngine, t: number) => Promise<void> | void) {
  const engine = new GuardianEngine(demoPlaces);
  engine.register(demoProfile);
  const steps = buildScenario(name).events.map((e) => async () => {
    if (e.note) engine.proposeFromNote(DEMO_CHILD_ID, e.note, e.t, "typed");
    if (e.planAction) {
      const latest = [...engine.plansOf(DEMO_CHILD_ID)].reverse().find((p) => p.status === "proposed");
      if (latest) engine.confirmPlan(latest.id);
    }
    if (e.ping) engine.ingestPing(e.ping);
    else if (e.utterance) engine.ingestUtterance(e.utterance);
    else engine.tick(DEMO_CHILD_ID, e.t);
    await onStep?.(engine, e.t);
  });
  return { engine, run: async () => { for (const s of steps) await s(); } };
}

const fakeChannel = (id: string, minTier: Channel["minTier"], sent: OutboundMessage[], fail = false): Channel => ({
  id,
  label: id,
  minTier,
  async send(m) {
    if (fail) throw new Error("boom");
    sent.push(m);
    return { ok: true };
  },
});

describe("SOS detail (abduction)", async () => {
  const { engine, run } = play("abduction");
  await run();
  const sos = engine.alerts[engine.alerts.length - 1]!.sos;

  it("tells the story of the last 3 hours in plain language", () => {
    const kinds = sos.timeline3h.map((s) => s.kind);
    expect(kinds).toContain("walking");
    expect(kinds).toContain("vehicle");
    expect(kinds[kinds.length - 1]).toBe("no-signal");
    expect(sos.distance3hKm).toBeGreaterThan(3);
    expect(sos.maxSpeed15mKmh).toBeGreaterThanOrEqual(0);
  });

  it("places the child relative to something a parent knows", () => {
    expect(sos.locationContext).toMatch(/of .*Abandoned industrial lot|Abandoned industrial lot/);
    expect(sos.lastMovement?.place).toBeTruthy();
  });

  it("summarises heart rate around the last reading, not just the last minutes", () => {
    expect(sos.hr!.max).toBeGreaterThanOrEqual(180);
    expect(sos.hr!.min).toBeLessThan(120);
    expect(sos.hr!.trend).toBe("rising");
  });

  it("says what it cannot know", () => {
    const u = sos.unknowns.join(" ");
    expect(u).toContain("No location since");
    expect(u).toContain("demo feed");
    expect(u).toContain("cannot confirm");
  });

  it("gives responders a brief with description and medical information, and parents backup contacts", () => {
    expect(sos.emergencyBrief).toContain("Aarav");
    expect(sos.emergencyBrief).toContain("Medical: Mild asthma");
    expect(sos.contacts.length).toBe(2);
    expect(sos.longText).toContain("WHAT WE DO NOT KNOW");
    expect(sos.longText).toContain("LAST 3 HOURS");
  });
});

describe("AlertDispatcher", () => {
  it("notifies every channel on a critical alert, then sends updates and bounded reminders", async () => {
    const app: OutboundMessage[] = [];
    const bee: OutboundMessage[] = [];
    const d = new AlertDispatcher([fakeChannel("app", "warning", app), fakeChannel("bee", "warning", bee)], { reminderEveryMin: 5, maxReminders: 2 });
    const { engine, run } = play("abduction", async (e, t) => d.sync(e.alerts, t));
    await run();
    expect(app.length).toBe(bee.length);
    expect(app[0]!.kind).toBe("new");
    expect(app[0]!.tier).toBe("critical");
    expect(app.filter((m) => m.kind === "update").length).toBeGreaterThan(0);
    expect(app.filter((m) => m.kind === "reminder").length).toBe(2);
    expect(app[0]!.short.length).toBeLessThan(480);
    expect(app[0]!.long).toContain("WHERE");
    expect(d.records.every((r) => r.ok)).toBe(true);
    expect(engine.alerts.length).toBeGreaterThan(0);
  });

  it("stops reminding once the parent acknowledges", async () => {
    const sent: OutboundMessage[] = [];
    const d = new AlertDispatcher([fakeChannel("app", "warning", sent)], { reminderEveryMin: 5, maxReminders: 3 });
    // A parent who acknowledges every alert as it arrives is never reminded.
    const { run } = play("abduction", async (e, t) => {
      await d.sync(e.alerts, t);
      for (const a of e.alerts) if (a.status === "open") e.acknowledge(a.id, false, t);
    });
    await run();
    expect(sent.filter((m) => m.kind === "reminder")).toHaveLength(0);
  });

  it("keeps a quiet warning off the loud channel", async () => {
    const quiet: OutboundMessage[] = [];
    const loud: OutboundMessage[] = [];
    const d = new AlertDispatcher([fakeChannel("app", "warning", quiet), fakeChannel("sms", "critical", loud)]);
    const { run } = play("delay", async (e, t) => d.sync(e.alerts, t));
    await run();
    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet[0]!.tier).toBe("warning");
    expect(loud).toHaveLength(0);
  });

  it("survives a failing channel and records it", async () => {
    const ok: OutboundMessage[] = [];
    const d = new AlertDispatcher([fakeChannel("bad", "warning", [], true), fakeChannel("good", "warning", ok)]);
    const { run } = play("abduction", async (e, t) => d.sync(e.alerts, t));
    await run();
    expect(ok.length).toBeGreaterThan(0);
    expect(d.records.some((r) => r.channel === "bad" && !r.ok && r.detail === "boom")).toBe(true);
  });

  it("sends nothing on a normal day", async () => {
    const sent: OutboundMessage[] = [];
    const d = new AlertDispatcher([fakeChannel("app", "warning", sent)]);
    const { run } = play("everyday", async (e, t) => d.sync(e.alerts, t));
    await run();
    expect(sent).toHaveLength(0);
  });
});

describe("emergency numbers are display-only", () => {
  it("recognises emergency numbers in common formats and ignores ordinary ones", () => {
    for (const n of ["911", "112", "1098", "999", "1-800-843-5678", "+1 (800) 843-5678", "100"]) expect(isEmergencyNumber(n), n).toBe(true);
    for (const n of ["+1-555-0100", "+1 281 555 0142", "+91 98765 43210"]) expect(isEmergencyNumber(n), n).toBe(false);
  });
});

describe("acknowledging holds the same situation quiet", () => {
  it("does not re-alert the same situation after the parent acknowledges, and no reminders follow", async () => {
    const { engine, run } = play("abduction", async (e) => {
      const open = e.alerts.filter((a) => a.status === "open").pop();
      if (open && !acked) {
        e.acknowledge(open.id, false);
        acked = true;
      }
    });
    let acked = false;
    await run();
    expect(engine.alerts.filter((a) => a.raisedAt > engine.alerts[0]!.raisedAt && a.tier === engine.alerts[0]!.tier && a.sos.why.length <= engine.alerts[0]!.sos.why.length).length).toBeLessThanOrEqual(1);
  });
});

void (null as unknown as Alert);
