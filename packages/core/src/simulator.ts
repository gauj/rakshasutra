import { ROUTE_CTE_TO_SCHOOL, ROUTE_HOME_TO_SCHOOL, ROUTE_SCHOOL_TO_CTE, ROUTE_SCHOOL_TO_HOME, SCHOOLDAY_PLACES } from "./routes.js";
import { bearingDeg, destination, haversineM, LatLon } from "./geo.js";
import { StaticPlaces } from "./sos.js";
import { ChildProfile, Ping } from "./types.js";

/** Demo geography: a fictional neighbourhood near Cypress, TX. All places are made up. */
export const HOME: LatLon = { lat: 29.97, lon: -95.69 };
export const SCHOOL: LatLon = destination(HOME, 40, 1100);

export const ROBOTICS: LatLon = destination(HOME, 300, 1800);
/** Career and technical education centre: the afternoon bus destination in the "schoolday" story. */
export const CTE: LatLon = destination(SCHOOL, 20, 2400);

export const DEMO_CHILD_ID = "child-adam";

export const demoProfile: ChildProfile = {
  id: DEMO_CHILD_ID,
  name: "Adam",
  nameAliases: ["Atom", "Adan", "Adams", "Edam"], // how speech-to-text may mishear the name
  age: 11,
  region: "US",
  tzOffsetMin: -300,
  parentIds: ["parent-demo"],
  consent: { location: true, voice: true, heartRate: true },
  quietHours: [21, 6],
  description: "About 150 cm, black hair, glasses, blue backpack with a robot patch (demo data)",
  medical: "Mild asthma; carries an inhaler (demo data)",
  contacts: [
    { name: "Parent (demo)", phone: "+1-555-0100" },
    { name: "Aunt Meera, backup (demo)", phone: "+1-555-0101" },
  ],
  zones: [
    { id: "home", name: "Home", kind: "safe", ...HOME, radiusM: 120, allowPickup: true },
    { id: "robotics", name: "Robotics Center (demo)", kind: "safe", ...ROBOTICS, radiusM: 120, allowPickup: true },
    { id: "school", name: "Liberty HS", kind: "safe", ...SCHOOL, radiusM: 150, allowPickup: true },
    { id: "cte", name: "Liberty HS CTE Center", kind: "safe", ...CTE, radiusM: 150, allowPickup: true },
    {
      id: "lot",
      name: "Abandoned industrial lot (demo)",
      kind: "attention",
      ...destination(destination(HOME, 220, 800), 100, 2400),
      radiusM: 350,
      level: "elevated",
      reason: "Parent-flagged: no foot traffic, reported incidents (demo data).",
    },
  ],
};

/**
 * The "schoolday" story is set in real places: Liberty High School and the Frisco ISD CTE Center (both public), with a
 * generic home in Prosper. Real roads come from routes.ts. Nothing here is any family's actual address.
 */
export const schooldayProfile: ChildProfile = {
  ...demoProfile,
  zones: [
    { id: "home", name: "Home", kind: "safe", ...SCHOOLDAY_PLACES.home, radiusM: 120, allowPickup: true },
    { id: "school", name: "Liberty HS", kind: "safe", ...SCHOOLDAY_PLACES.school, radiusM: 250, allowPickup: true },
    { id: "cte", name: "Liberty HS CTE Center", kind: "safe", ...SCHOOLDAY_PLACES.cte, radiusM: 200, allowPickup: true },
  ],
};

export const demoPlaces = new StaticPlaces([
  { name: "County Sheriff Substation (demo)", kind: "police", ...destination(HOME, 100, 3300), phone: "911" },
  { name: "Community Hospital ER (demo)", kind: "hospital", ...destination(HOME, 120, 4700), phone: "911" },
  { name: "Fire Station 7 (demo)", kind: "fire", ...destination(HOME, 70, 2900), phone: "911" },
  { name: "24h Pharmacy (demo)", kind: "open-24h", ...destination(HOME, 90, 3800) },
]);

export type ScenarioName = "abduction" | "everyday" | "delay" | "schoolday";

export interface ScenarioEvent {
  t: number; // epoch ms (virtual)
  ping?: Ping;
  utterance?: { childId: string; ts: number; text: string };
  tick?: true;
  /** A guardian note. Skipped when real Bee notes are being used. */
  note?: string;
  /** Simulates the guardian tapping Confirm on the latest proposal. Skipped with real Bee notes. */
  planAction?: "confirm-latest";
}

/** A moment worth jumping to in the time-lapse controls. */
export interface Chapter {
  t: number; // epoch ms (virtual)
  label: string;
}

export interface Scenario {
  name: ScenarioName;
  title: string;
  startTs: number;
  endTs: number;
  /** Virtual seconds per real second. */
  defaultSpeed: number;
  events: ScenarioEvent[];
  /** Play the scripted notes even when a live Bee is connected (the school-day story always does). */
  scripted?: boolean;
  /** Moments the time-lapse controls can jump to. */
  chapters?: Chapter[];
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  events: ScenarioEvent[] = [];
  pos: LatLon;
  t: number;
  battery = 88;
  private r = rng(7);
  constructor(start: number, pos: LatLon, private childId: string) {
    this.t = start;
    this.pos = pos;
  }
  private jitter(m = 3): LatLon {
    return destination(this.pos, this.r() * 360, this.r() * m);
  }
  ping(hr?: number, opts: { exact?: boolean } = {}) {
    const at = opts.exact ? this.pos : this.jitter();
    this.events.push({
      t: this.t,
      ping: { childId: this.childId, ts: this.t, lat: at.lat, lon: at.lon, accuracyM: 8, hr, battery: Math.max(3, Math.round(this.battery)), source: "sim" },
    });
  }
  /** Move at v m/s along a bearing for `secs`, emitting a ping every `every` s. */
  move(bearing: number, v: number, secs: number, every: number, hr: () => number | undefined) {
    for (let s = 0; s < secs; s += every) {
      this.pos = destination(this.pos, bearing, v * every);
      this.t += every * 1000;
      this.battery -= 0.01;
      this.ping(hr(), { exact: v > 5 });
    }
  }
  /** Travel along a real road or footpath at v m/s, a ping every `every` s, ending exactly at its last point. */
  follow(line: LatLon[], v: number, every: number, hr: () => number | undefined) {
    const step = v * every;
    let seg = 0;
    let into = 0; // metres travelled along the current segment
    let carry = step;
    this.pos = line[0]!;
    this.ping(hr(), { exact: true }); // a fix at the start of the road, so a long wait before it is not read as a jump
    while (seg < line.length - 1) {
      const a = line[seg]!;
      const b = line[seg + 1]!;
      const len = haversineM(a, b);
      if (into + carry >= len) {
        carry -= len - into;
        into = 0;
        seg++;
        continue;
      }
      into += carry;
      carry = step;
      this.pos = destination(a, bearingDeg(a, b), into);
      this.t += every * 1000;
      this.battery -= 0.01;
      this.ping(hr(), { exact: true });
    }
    this.pos = line[line.length - 1]!;
    this.t += every * 1000;
    this.ping(hr(), { exact: true });
  }
  dwell(mins: number, every: number, hr: () => number | undefined) {
    for (let s = 0; s < mins * 60; s += every) {
      this.t += every * 1000;
      this.battery -= 0.005;
      this.ping(hr());
    }
  }
  say(text: string) {
    this.events.push({ t: this.t, utterance: { childId: this.childId, ts: this.t, text } });
  }
  note(text: string) {
    this.events.push({ t: this.t, note: text });
  }
  confirm() {
    this.events.push({ t: this.t, planAction: "confirm-latest" });
  }
  tickUntil(endT: number, everyS = 30) {
    for (let t = this.t + everyS * 1000; t <= endT; t += everyS * 1000) this.events.push({ t, tick: true });
    this.t = endT;
  }
}

const at = (h: number, m: number) => Date.UTC(2026, 9, 14, h + 5, m); // local CDT -> UTC

export function buildScenario(name: ScenarioName, childId = DEMO_CHILD_ID): Scenario {
  const r = rng(name === "abduction" ? 11 : 5);
  const calm = () => 82 + Math.round(r() * 14);
  if (name === "everyday") {
    const b = new Builder(at(7, 30), HOME, childId);
    b.dwell(20, 120, calm);
    b.move(40, 1.4, 780, 15, () => 100 + Math.round(r() * 10));
    b.pos = SCHOOL;
    b.dwell(300, 300, () => (r() > 0.85 ? 150 + Math.round(r() * 20) : calm())); // includes playground spikes
    b.move(220, 1.5, 740, 15, () => 98 + Math.round(r() * 10));
    b.pos = HOME;
    b.dwell(75, 120, calm);
    const end = b.t;
    return { name, title: "A normal school day", startTs: at(7, 30), endTs: end, defaultSpeed: 600, events: b.events };
  }

  if (name === "schoolday") {
    // A full school day as a time-lapse, on real roads: two guardian notes, a bus trip, one walk off campus, a late pick-up.
    // Dwell exactly where the roads begin and end, so there is no jump between a stop and its road.
    const P = { home: ROUTE_HOME_TO_SCHOOL[0]!, school: ROUTE_HOME_TO_SCHOOL[ROUTE_HOME_TO_SCHOOL.length - 1]!, cte: ROUTE_SCHOOL_TO_CTE[ROUTE_SCHOOL_TO_CTE.length - 1]! };
    const startTs = at(8, 30);
    const endTs = at(18, 5);
    const b = new Builder(startTs, P.home, childId);
    const V = 13; // about 47 km/h on the road
    const lengthM = (line: LatLon[]) => line.slice(1).reduce((sum, p, i) => sum + haversineM(line[i]!, p), 0);
    /** Stay near `center` until the virtual clock reaches `endMs`, pinging every `every` s with a little wandering. */
    const stayUntil = (center: LatLon, endMs: number, every: number, wander: number) => {
      while (b.t + every * 1000 <= endMs) {
        b.t += every * 1000;
        b.battery -= 0.25;
        b.pos = wander > 0 ? destination(center, r() * 360, r() * wander) : center;
        b.ping(calm());
      }
      b.t = endMs;
      b.pos = center;
    };
    /** Leave in time to arrive at h:m by road. */
    const drive = (line: LatLon[], h: number, m: number) => {
      const secs = lengthM(line) / V;
      stayUntil(line[0]!, at(h, m) - secs * 1000, 120, 6);
      b.follow(line, V, 12, ride);
    };
    const ride = () => 88 + Math.round(r() * 8);
    const stroll = () => 96 + Math.round(r() * 10);

    drive(ROUTE_HOME_TO_SCHOOL, 8, 58); // drop-off
    stayUntil(P.school, at(10, 0), 300, 40);
    b.note("Please keep an eye on Adam today and make sure he is safe. He goes to the CTE center at 3 p.m.");
    b.confirm();
    stayUntil(P.school, at(14, 40), 300, 90); // classes, lunch and recess inside the campus
    drive(ROUTE_SCHOOL_TO_CTE, 14, 59); // the bus
    stayUntil(P.cte, at(16, 30), 300, 50);
    drive(ROUTE_CTE_TO_SCHOOL, 16, 50); // the bus back
    stayUntil(P.school, at(17, 0), 300, 30);
    b.note("I am going to be a little late, so he should be home by 6 p.m. I will pick him up around 5:30. Please keep him safe at school and make sure he is not going around.");
    b.confirm();
    stayUntil(P.school, at(17, 8), 120, 20);
    // The tension beat: he walks about 420 m off campus (west), lingers, and comes back.
    const away = destination(P.school, 270, 420);
    b.pos = P.school;
    b.move(270, 1.4, 300, 15, stroll);
    b.pos = away;
    b.dwell(2, 60, stroll);
    b.pos = away;
    b.move(90, 1.4, 300, 15, stroll);
    b.pos = P.school;
    stayUntil(P.school, at(17, 36), 120, 20); // the parent arrives around 5:30 and signs him out
    drive(ROUTE_SCHOOL_TO_HOME, 17, 58); // the drive home
    stayUntil(P.home, at(18, 5), 120, 8);

    b.t = startTs;
    b.tickUntil(endTs, 30);
    const events = b.events.sort((x, y) => x.t - y.t); // stable: a note stays right before its confirm
    // The story is told with scripted notes even when a live Bee is connected, so the time-lapse always plays the same way.
    const chapters: Chapter[] = [
      { t: at(9, 0), label: "At school" },
      { t: at(10, 0), label: "Parent asks Bee to keep watch" },
      { t: at(14, 50), label: "Leaves for CTE" },
      { t: at(15, 0), label: "Reaches CTE safely" },
      { t: at(17, 0), label: "Late pick-up, keep him at school" },
      { t: at(17, 13), label: "Leaves school: heads-up" },
      { t: at(17, 58), label: "Home, safe" },
    ];
    return { name, title: "A school day with Bee: kept safe from 9 to 6", startTs, endTs, defaultSpeed: 240, events, scripted: true, chapters };
  }

  if (name === "delay") {
    const b = new Builder(at(16, 30), ROBOTICS, childId);
    b.dwell(1, 60, calm);
    b.note("Adam has robotics practice today. Practice ends at 5 and I'll pick him up at 5:30.");
    b.t += 60_000;
    b.confirm();
    b.dwell(40, 120, calm); // until 17:12, then the phone goes offline
    b.tickUntil(at(17, 46), 30); // 17:45: expected check-in is overdue
    b.note("Adam's robotics practice is running late, I'll pick him up at 6 instead of 5:30.");
    b.t += 60_000;
    b.confirm();
    b.tickUntil(at(17, 50), 30);
    b.t = at(17, 50);
    b.dwell(8, 120, calm); // phone back online, still at the Robotics Center
    b.t = at(18, 0);
    b.move(120, 10, 180, 10, () => 92); // parent picks him up and drives home
    b.pos = HOME;
    b.dwell(20, 60, calm);
    return { name, title: "The unexpected delay", startTs: at(16, 30), endTs: b.t, defaultSpeed: 120, events: b.events };
  }

  // abduction: walk home from school, get pulled into a vehicle, voice distress, abrupt stop, silence.
  const b = new Builder(at(15, 0), SCHOOL, childId);
  b.dwell(2, 30, calm);
  b.move(220, 1.4, 660, 15, () => 96 + Math.round(r() * 8));
  b.dwell(1.5, 15, () => 104);
  // vehicle pulls up: ramp to ~16 m/s heading east-ish
  const ramp = [0.5, 3, 7, 11, 14, 16, 16];
  let hr = 118;
  b.say("Who are you? I don't know you");
  for (const v of ramp) {
    hr += 8;
    b.move(100, v, 5, 5, () => Math.min(hr, 186));
    if (v === 7) b.say("Let go of me! Help!");
  }
  b.move(100, 16, 160, 5, () => 176 + Math.round(r() * 8));
  b.t += 2000;
  b.ping(179, { exact: true }); // 16 m/s -> 0 in 2 s
  b.t += 3000;
  b.ping(177, { exact: true });
  b.t += 15000;
  b.ping(174, { exact: true });
  b.battery = 41;
  // device gone: nothing more, only time passes
  b.tickUntil(b.t + 50 * 60_000);
  return { name, title: "Walk home goes wrong", startTs: at(15, 0), endTs: b.t, defaultSpeed: 60, events: b.events };
}
