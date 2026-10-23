import { describe, expect, it } from "vitest";
import { buildScenario, DEFAULT_THRESHOLDS, DEMO_CHILD_ID, demoPlaces, schooldayProfile, GuardianEngine } from "../src/index.js";

// Plays the whole "schoolday" story through the real engine, the way the server's demo runner does,
// and checks what the parent would be told, and when.
function play() {
  const sc = buildScenario("schoolday");
  const e = new GuardianEngine(demoPlaces, DEFAULT_THRESHOLDS);
  e.register(schooldayProfile);
  const seen: { t: number; ids: string[] }[] = [];
  const arrivals: { t: number; zone: string }[] = [];
  const plans: ReturnType<GuardianEngine["plansOf"]> = [];
  for (const ev of sc.events) {
    if (ev.ping) e.ingestPing(ev.ping);
    if (ev.note) e.proposeFromNote(DEMO_CHILD_ID, ev.note, ev.t, "typed");
    if (ev.planAction) {
      const latest = [...e.plansOf(DEMO_CHILD_ID)].reverse().find((p) => p.status === "proposed");
      if (latest) e.confirmPlan(latest.id);
    }
    if (ev.tick) {
      const r = e.tick(DEMO_CHILD_ID, ev.t);
      seen.push({ t: ev.t, ids: (r?.signals ?? []).map((s) => s.id) });
      for (const p of e.newlyCompleted(DEMO_CHILD_ID)) arrivals.push({ t: p.completedAt ?? ev.t, zone: p.expectedZoneId });
    }
  }
  plans.push(...e.plansOf(DEMO_CHILD_ID));
  return { sc, e, seen, arrivals, plans };
}

const hm = (ts: number) => {
  const d = new Date(ts - 5 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

describe("the school-day story, through the engine", () => {
  const { sc, e, seen, arrivals, plans } = play();

  it("turns the two guardian notes into watch plans", () => {
    const [first, second] = plans;
    expect(first!.expectedZoneId).toBe("cte");
    expect(first!.watch?.zoneId).toBe("school");
    expect(second!.expectedZoneId).toBe("home");
    expect(second!.watch?.zoneId).toBe("school");
  });

  it("stays quiet all day except for the one heads-up when he leaves school during the late pick-up", () => {
    const alarmed = seen.filter((s) => s.ids.length > 0);
    const kinds = new Set(alarmed.flatMap((s) => s.ids));
    expect([...kinds]).toEqual(["WATCH_BREACH"]);
    const minutes = alarmed.map((s) => hm(s.t));
    expect(Math.min(...minutes)).toBeGreaterThanOrEqual(17 * 60 + 8);
    expect(Math.max(...minutes)).toBeLessThanOrEqual(17 * 60 + 20);
  });

  it("announces the safe arrival at CTE around 3 pm and at home around 6 pm, once each", () => {
    expect(arrivals.map((a) => a.zone)).toEqual(["cte", "home"]);
    expect(hm(arrivals[0]!.t)).toBeGreaterThanOrEqual(14 * 60 + 58);
    expect(hm(arrivals[0]!.t)).toBeLessThanOrEqual(15 * 60 + 10);
    expect(hm(arrivals[1]!.t)).toBeGreaterThanOrEqual(17 * 60 + 56);
    expect(hm(arrivals[1]!.t)).toBeLessThanOrEqual(18 * 60 + 5);
  });

  it("ends with nothing outstanding", () => {
    expect(e.tick(DEMO_CHILD_ID, sc.endTs)!.signals).toEqual([]);
    expect(plans.every((p) => p.status === "completed" || p.status === "superseded")).toBe(true);
  });
});
