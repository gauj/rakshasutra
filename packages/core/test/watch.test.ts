import { describe, expect, it } from "vitest";
import { ChildProfile, DEFAULT_THRESHOLDS, demoPlaces, destination, GuardianEngine, parseScheduleNote, Ping } from "../src/index.js";

// A small school day: Home, School and a CTE center a few km apart, all fictional.
const HOME = { lat: 29.97, lon: -95.69 };
const SCHOOL = destination(HOME, 40, 1100);
const CTE = destination(SCHOOL, 90, 2400);
const profile: ChildProfile = {
  id: "kid",
  name: "Ayaan",
  age: 13,
  region: "US",
  tzOffsetMin: -300,
  parentIds: ["p"],
  consent: { location: true, voice: false, heartRate: false },
  quietHours: [21, 6],
  contacts: [],
  zones: [
    { id: "home", name: "Home", kind: "safe", ...HOME, radiusM: 120, allowPickup: true },
    { id: "school", name: "School", kind: "safe", ...SCHOOL, radiusM: 150, allowPickup: true },
    { id: "cte", name: "CTE Center", kind: "safe", ...CTE, radiusM: 150, allowPickup: true },
  ],
};
const at = (h: number, m = 0) => Date.UTC(2026, 9, 14, h + 5, m); // local CDT to UTC

const N1 = "Please keep an eye on Ayaan today and make sure he is safe. He goes to the CTE center at 3 p.m.";
const N2 = "I am going to be a little late, so he should be home by 6 p.m. I will pick him up around 5:30. Please keep him safe at school and make sure he is not going around.";

const ping = (p: { lat: number; lon: number }, ts: number): Ping => ({ childId: "kid", ts, lat: p.lat, lon: p.lon, accuracyM: 8, source: "sim" });

describe("keep-watch notes", () => {
  it("reads 'goes to the CTE center at 3' as an arrival at CTE, watching the current place until 20 minutes before", () => {
    const p = parseScheduleNote(N1, { profile, ts: at(10), currentZoneId: "school" })!;
    expect(p.expectedZoneId).toBe("cte");
    expect(p.expectedAt).toBe(at(15));
    expect(p.title).toContain("CTE Center");
    expect(p.watch).toEqual({ zoneId: "school", until: at(14, 40) });
    expect(p.interpretation).toContain("Keeping watch at School");
  });

  it("reads 'home by 6, pick him up around 5:30, keep him safe at school' as home by 6, watching school until the pick-up", () => {
    const p = parseScheduleNote(N2, { profile, ts: at(17) })!;
    expect(p.expectedZoneId).toBe("home");
    expect(p.expectedAt).toBe(at(18));
    expect(p.watch).toEqual({ zoneId: "school", until: at(17, 30) });
  });

  it("makes no watch when the note does not ask for one", () => {
    const p = parseScheduleNote("Ayaan has practice, I will pick him up at 5:30 p.m.", { profile, ts: at(10), currentZoneId: "school" })!;
    expect(p.watch).toBeUndefined();
    expect(p.expectedZoneId).toBe("home");
  });
});

describe("the engine keeps watch", () => {
  const start = () => {
    const e = new GuardianEngine(demoPlaces, DEFAULT_THRESHOLDS);
    e.register(profile);
    e.ingestPing(ping(SCHOOL, at(9, 30)));
    const plan = e.proposeFromNote("kid", N1, at(10), "typed")!;
    e.confirmPlan(plan.id);
    return e;
  };

  it("stays quiet while he is at school", () => {
    const e = start();
    e.ingestPing(ping(SCHOOL, at(11)));
    expect(e.tick("kid", at(11, 1))!.signals.map((s) => s.id)).not.toContain("WATCH_BREACH");
  });

  it("raises a calm warning when he is well outside school during the watch", () => {
    const e = start();
    e.ingestPing(ping(destination(SCHOOL, 200, 450), at(11)));
    const ev = e.tick("kid", at(11, 1))!;
    const s = ev.signals.find((x) => x.id === "WATCH_BREACH")!;
    expect(s).toBeDefined();
    expect(s.severity).toBe(3);
    expect(s.detail).toContain("does not confirm anything is wrong");
  });

  it("does not raise it once the watch window has ended", () => {
    const e = start();
    e.ingestPing(ping(destination(SCHOOL, 200, 450), at(14, 45)));
    expect(e.tick("kid", at(14, 46))!.signals.map((s) => s.id)).not.toContain("WATCH_BREACH");
  });

  it("completes the plan when he reaches CTE and announces it exactly once", () => {
    const e = start();
    e.ingestPing(ping(CTE, at(15, 1)));
    e.tick("kid", at(15, 2));
    const done = e.newlyCompleted("kid");
    expect(done).toHaveLength(1);
    expect(done[0]!.expectedZoneId).toBe("cte");
    expect(done[0]!.completedAt).toBeDefined();
    expect(e.newlyCompleted("kid")).toHaveLength(0);
  });
});
