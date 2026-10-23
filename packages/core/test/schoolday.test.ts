// Structure of the "schoolday" time-lapse scenario (no engine behaviour).
import { describe, expect, it } from "vitest";
import { buildScenario, demoProfile } from "../src/index.js";
import { haversineM } from "../src/geo.js";

const at = (h: number, m: number) => Date.UTC(2026, 9, 14, h + 5, m);
const zone = (id: string) => demoProfile.zones.find((z) => z.id === id)!;
const sc = buildScenario("schoolday");
const pings = sc.events.filter((e) => e.ping).map((e) => e.ping!);
/** The ping closest in time to h:m. */
const near = (h: number, m: number) => pings.reduce((a, p) => (Math.abs(p.ts - at(h, m)) < Math.abs(a.ts - at(h, m)) ? p : a));
const dist = (p: { lat: number; lon: number }, id: string) => haversineM(p, zone(id));

describe("schoolday scenario", () => {
  it("is chronological with a sensible span and speed", () => {
    for (let i = 1; i < sc.events.length; i++) expect(sc.events[i]!.t).toBeGreaterThanOrEqual(sc.events[i - 1]!.t);
    expect(sc.startTs).toBe(at(8, 40));
    expect(sc.endTs).toBe(at(18, 5));
    expect(sc.defaultSpeed).toBeGreaterThanOrEqual(120);
    expect((sc.endTs - sc.startTs) / 1000 / sc.defaultSpeed).toBeLessThan(5 * 60);
    expect(sc.events.filter((e) => e.tick).length).toBeGreaterThan(1000);
  });

  it("has exactly two guardian notes, each followed by a confirm", () => {
    const idx = sc.events.map((e, i) => (e.note ? i : -1)).filter((i) => i >= 0);
    expect(idx).toHaveLength(2);
    expect(sc.events[idx[0]!]!.note).toBe("Please keep an eye on Adam today and make sure he is safe. He goes to the CTE center at 3 p.m.");
    expect(sc.events[idx[1]!]!.note).toBe(
      "I am going to be a little late, so he should be home by 6 p.m. I will pick him up around 5:30. Please keep him safe at school and make sure he is not going around.",
    );
    for (const i of idx) expect(sc.events[i + 1]!.planAction).toBe("confirm-latest");
    expect(sc.events[idx[0]!]!.t).toBe(at(10, 0));
    expect(sc.events[idx[1]!]!.t).toBe(at(17, 0));
  });

  it("puts the child in the right places at the right times", () => {
    expect(dist(near(9, 30), "school")).toBeLessThan(zone("school").radiusM!);
    expect(dist(near(15, 0), "cte")).toBeLessThan(zone("cte").radiusM!);
    expect(dist(near(17, 13), "school")).toBeGreaterThan(zone("school").radiusM!);
    expect(dist(near(17, 25), "school")).toBeLessThan(zone("school").radiusM!);
    expect(dist(near(18, 2), "home")).toBeLessThan(zone("home").radiusM!);
  });

  it("walks off campus but never into the flagged lot", () => {
    const far = Math.max(...pings.filter((p) => p.ts >= at(17, 8) && p.ts <= at(17, 20)).map((p) => dist(p, "school")));
    expect(far).toBeGreaterThan(300);
    for (const p of pings) expect(dist(p, "lot")).toBeGreaterThan(zone("lot").radiusM!);
  });
});
