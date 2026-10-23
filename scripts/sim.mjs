// Plays Ayaan's iPhone (or Bee) for you, so the whole app can be demonstrated without anyone walking outside.
// It starts its own private copy of the real-mode server (port 8788, data-sim/), and sends the same OwnTracks
// reports an iPhone would, through the same login-protected intake. Your real setup in data/ is never touched.
// It never contacts anyone: no push topic is set, and emergency numbers are display-only by design.
//
//   node scripts/sim.mjs serve              start the private server (leave it running), prints the family code
//   node scripts/sim.mjs <scenario> [--speed N]   in another window, play a scenario
//   scenarios: school-run (walk) | pickup | late | arrive | wrong-place | sudden-stop | no-movement | signal-lost
//   (play `late` first, then `arrive` to resolve it)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "data-sim");
const PORT = 8788;
const B = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const cmd = args[0];
const speedArg = args.indexOf("--speed") >= 0 ? Number(args[args.indexOf("--speed") + 1]) : undefined;

// ---- geography: the same fictional neighbourhood near Cypress, TX as the demo ----
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
function dest(p, bearing, m) {
  const d = m / R;
  const b = rad(bearing);
  const la1 = rad(p.lat);
  const lo1 = rad(p.lon);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: deg(la2), lon: deg(lo2) };
}
function dist(a, b) {
  const x = rad(b.lat - a.lat);
  const y = rad(b.lon - a.lon);
  const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Uses the real Home and School from data/family.json when they are set (that file is git-ignored), else a fictional neighbourhood.
function realPlace(name) {
  if (process.env.SIM_FICTIONAL === "1") return undefined; // for videos and screenshots: never draw a real home
  try {
    const f = JSON.parse(readFileSync(path.join(root, "data", "family.json"), "utf8"));
    const z = f.zones.find((x) => x.name === name);
    return z ? { lat: z.lat, lon: z.lon } : undefined;
  } catch {
    return undefined;
  }
}
const HOME = realPlace("Home") ?? { lat: 29.97, lon: -95.69 };
const SCHOOL = realPlace("School") ?? dest(HOME, 40, 1100);
const CTE = realPlace("CTE Center") ?? dest(HOME, 300, 1800);
const LOT = dest(SCHOOL, 200, 700);
const PARK = dest(HOME, 250, 650);
const ZONES = [
  { name: "Home", kind: "safe", ...HOME, radiusM: 120, allowPickup: true },
  { name: "School", kind: "safe", ...SCHOOL, radiusM: 250, allowPickup: true },
  { name: "CTE Center", kind: "safe", ...CTE, radiusM: 200, allowPickup: true },
  { name: "Abandoned lot", kind: "attention", ...LOT, radiusM: 350, level: "elevated", reason: "Parent-flagged: no foot traffic, reported incidents (demo place)." },
];

// ---- the private server ----
function prepare() {
  if (!existsSync(path.join(DIR, "family.json"))) {
    const r = spawnSync(process.execPath, ["--import", "tsx", "apps/server/src/setup-real.ts", "--name", "Ayaan", "--age", "13", "--tz", "-300"], {
      cwd: root,
      env: { ...process.env, DATA_DIR: DIR },
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(r.stdout, r.stderr);
      process.exit(1);
    }
  }
  const f = JSON.parse(readFileSync(path.join(DIR, "family.json"), "utf8"));
  f.zones = ZONES;
  f.contacts = [{ name: "Aunt Meera (demo)", phone: "+1 555 0101" }];
  f.rules = { disabled: [] }; // the simulator stands in for continuous reports, so every rule is on
  f.notify = {};
  f.child.nameAliases = ["Ayan", "Ian", "Aayan", "Ayaan"]; // how Bee mishears his name
  writeFileSync(path.join(DIR, "family.json"), JSON.stringify(f, null, 2), { mode: 0o600 });
  rmSync(path.join(DIR, "state.json"), { force: true }); // each run starts from a clean day
  return f;
}
const family = () => JSON.parse(readFileSync(path.join(DIR, "family.json"), "utf8"));

if (cmd === "serve") {
  const f = prepare();
  // The guardian's Bee (Apple Watch or phone app) is read live through the official Bee CLI when it is installed here, unless --no-bee.
  const BEE_BIN = path.join(root, "tools", "bee-cli", process.platform === "win32" ? "bee.exe" : "bee");
  const useBee = !args.includes("--no-bee") && existsSync(BEE_BIN);
  const env = { ...process.env, DATA_DIR: DIR, PORT: String(PORT), FORCE_DEMO: "", NTFY_TOPIC: "", BEE_NOTES: useBee ? "1" : "", BEE_CLI_BINARY: useBee ? BEE_BIN : "", BEE_ALERTS: "", PUBLIC_URL: "" };
  const RESET = path.join(DIR, "reset.flag");
  let server;
  let quitting = false;
  let restarting = false;
  const launch = (first) => {
    server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: root, env, stdio: ["ignore", "pipe", "inherit"] });
    server.stdout.on("data", (d) => {
      if (!String(d).includes("RakshaSutra API")) return;
      if (first) {
        console.log(["", `Simulator ready. Open ${B} and sign in with this family code:`, "", `    ${f.secrets.parentToken}`, ""].join(String.fromCharCode(10)));
        console.log(useBee ? "Live Bee notes: ON (your Bee is read through the official Bee CLI)." : "Live Bee notes: off.");
        console.log("In another window: node scripts/sim.mjs walk   (also: pickup, late, arrive, wrong-place, sudden-stop, no-movement, signal-lost)");
      }
    });
    server.on("exit", () => {
      if (!quitting && !restarting) process.exit(0);
    });
  };
  launch(true);
  // A scenario asks for a clean day by dropping a flag file; each story is told on its own.
  setInterval(() => {
    if (!existsSync(RESET)) return;
    rmSync(RESET, { force: true });
    restarting = true;
    const old = server;
    old.once("exit", () => {
      rmSync(path.join(DIR, "state.json"), { force: true });
      restarting = false;
      launch(false);
    });
    old.kill();
  }, 400);
  process.on("SIGINT", () => {
    quitting = true;
    server.kill();
    process.exit(0);
  });
} else if (!cmd || cmd === "--help") {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 13).join("\n"));
}

// ---- playing a scenario ----
function authed() {
  const f = family();
  return {
    parent: { "x-parent-token": f.secrets.parentToken, "content-type": "application/json" },
    phone: { "content-type": "application/json", authorization: "Basic " + Buffer.from(`${f.secrets.ingestUser}:${f.secrets.ingestToken}`).toString("base64") },
  };
}
const inRegions = (p) => ZONES.filter((z) => dist(p, z) <= z.radiusM).map((z) => z.name);

// ---- real roads: routes come from free public routing servers, once, and are then cached in the git-ignored data/ folder ----
const ROUTES_FILE = path.join(root, "data", "routes.json");
const readRoutes = () => {
  try {
    return JSON.parse(readFileSync(ROUTES_FILE, "utf8"));
  } catch {
    return {};
  }
};
/** A road route (car) or footpath route (foot) between two points, as a list of {lat, lon}. */
async function route(profile, a, b) {
  const key = [profile, a.lat, a.lon, b.lat, b.lon].map((x) => (typeof x === "number" ? x.toFixed(5) : x)).join(",");
  const cache = readRoutes();
  if (cache[key]) return cache[key];
  const base = profile === "foot" ? "https://routing.openstreetmap.de/routed-foot/route/v1/foot" : "https://router.project-osrm.org/route/v1/driving";
  const url = `${base}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  let line;
  try {
    const d = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
    line = d.routes[0].geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
  } catch (e) {
    console.error(`Could not get a ${profile} route (${e.message}). The simulator needs the internet once to learn the roads; try again.`);
    process.exit(1);
  }
  mkdirSync(path.dirname(ROUTES_FILE), { recursive: true });
  writeFileSync(ROUTES_FILE, JSON.stringify({ ...cache, [key]: line }));
  return line;
}
const reversed = (line) => [...line].reverse();

/** Builds a timeline of what the phone reports. Offsets are milliseconds from the start of the story. */
class Story {
  line = [];
  cum = [0];
  at = 0;
  pos;
  t = 0;
  batt = 88;
  items = [];
  constructor(start) {
    this.pos = start;
  }
  report(v = 0, bearing = 0, act = v > 5 ? "automotive" : v > 0.5 ? "walking" : "stationary", jitter = 3) {
    const at = jitter ? dest(this.pos, Math.random() * 360, Math.random() * jitter) : this.pos;
    this.items.push({ t: this.t, lat: at.lat, lon: at.lon, v, bearing, act, batt: Math.max(4, Math.round(this.batt)), regions: inRegions(at) });
  }
  /** Start following a road or footpath from its first point. */
  follow(line) {
    this.line = line;
    this.cum = [0];
    for (let i = 1; i < line.length; i++) this.cum.push(this.cum[i - 1] + dist(line[i - 1], line[i]));
    this.at = 0;
    this.pos = line[0];
  }
  pointAt(m) {
    const total = this.cum[this.cum.length - 1];
    const d = Math.min(Math.max(m, 0), total);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const f = (d - this.cum[i - 1]) / seg;
    const a = this.line[i - 1];
    const b = this.line[i];
    const bearing = deg(Math.atan2(rad(b.lon - a.lon) * Math.cos(rad(a.lat)), rad(b.lat - a.lat)));
    return { p: { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }, bearing };
  }
  get remaining() {
    return this.cum[this.cum.length - 1] - this.at;
  }
  /** Travel along the followed route at v m/s for up to `secs` (or until it ends), a report every `every` s. */
  along(v, secs, every) {
    for (let s = 0; s < secs && this.remaining > 0.5; s += every) {
      this.at = Math.min(this.at + v * every, this.cum[this.cum.length - 1]);
      const { p, bearing } = this.pointAt(this.at);
      this.pos = p;
      this.t += every * 1000;
      this.batt -= 0.02;
      this.report(v, bearing, undefined, v > 5 ? 0 : 3);
    }
  }
  /** Travel to the end of the followed route. */
  alongAll(v, every) {
    this.along(v, this.remaining / v + every, every);
  }
  move(bearing, v, secs, every) {
    for (let s = 0; s < secs; s += every) {
      this.pos = dest(this.pos, bearing, v * every);
      this.t += every * 1000;
      this.batt -= 0.02;
      this.report(v, bearing, undefined, v > 5 ? 0 : 3);
    }
  }
  dwell(secs, every) {
    for (let s = 0; s < secs; s += every) {
      this.t += every * 1000;
      this.batt -= 0.005;
      this.report(0, 0);
    }
  }
}

async function build(name) {
  const wander = dest(CTE, 90, 700); // where he drifts to after class
  switch (name) {
    case "walk":
    case "school-run": {
      const s = new Story(HOME);
      s.report();
      s.dwell(30, 10);
      s.follow(await route("car", HOME, SCHOOL));
      s.alongAll(13, 10); // the morning drop-off, along the real roads
      s.dwell(60, 10);
      return { story: s, speed: 30, title: "You drop Ayaan at School along the real roads. Safe place to safe place, a pick-up point at both ends: nothing to worry about." };
    }
    case "pickup": {
      const s = new Story(SCHOOL);
      s.report();
      s.dwell(60, 10); // waiting at the gate
      s.follow(await route("car", SCHOOL, HOME));
      s.alongAll(13, 10); // the afternoon pick-up, along the real roads
      s.dwell(60, 10);
      return { story: s, speed: 30, title: "You pick Ayaan up from School and drive him Home along the real roads. Nothing to worry about." };
    }
    case "late": {
      const s = new Story(CTE);
      s.report();
      s.dwell(180, 30); // in class at the CTE Center
      const out = await route("foot", CTE, wander);
      s.follow(out);
      s.alongAll(1.3, 15); // walks off along the footpath, away from home
      s.dwell(60, 20);
      // The last report is 30 minutes old, so the later ride home (the arrive scenario) lines up after it.
      return { story: s, speed: 15, endAgoMin: 30, title: "Ayaan leaves the CTE Center on foot and does not head home. A pick-up plan is then confirmed as already overdue.", plan: true };
    }
    case "arrive": {
      const out = await route("foot", CTE, wander);
      const s = new Story(out[out.length - 1]);
      s.report();
      s.follow(reversed(out));
      s.alongAll(1.3, 15); // walks back to the CTE Center, a pick-up point
      s.dwell(60, 20);
      s.follow(await route("car", CTE, HOME));
      s.alongAll(13, 10); // you drive him home along the real roads
      s.dwell(30, 10);
      return { story: s, speed: 40, title: "Ayaan walks back to the CTE Center, you pick him up and drive him Home. The overdue pick-up should resolve." };
    }
    case "wrong-place": {
      const s = new Story(SCHOOL);
      s.report();
      s.dwell(30, 10);
      s.follow(await route("foot", SCHOOL, LOT));
      s.alongAll(1.4, 10); // walks along the footpath to the flagged lot
      s.dwell(40, 10);
      return { story: s, speed: 40, title: "Ayaan walks from School to the parent-flagged Abandoned lot." };
    }
    case "sudden-stop": {
      const start = dest(SCHOOL, 90, 400);
      const s = new Story(start);
      s.report();
      s.follow(await route("car", start, dest(SCHOOL, 90, 5000)));
      s.along(1.4, 120, 10); // walking along the road
      for (const v of [5, 9, 13]) s.along(v, 4, 2); // then vehicle speed within a minute, away from any pick-up point
      s.along(15, 40, 2); // about 54 km/h
      s.t += 2000;
      s.report(0, 0, "stationary", 0); // speed falls from 15 m/s to 0 in 2 seconds
      s.dwell(100, 10); // the phone just lies there
      return { story: s, speed: 20, title: "Ayaan walks, then moves at vehicle speed away from a pick-up point, then stops abruptly and the phone lies still." };
    }
    case "no-movement": {
      const s = new Story(PARK);
      s.report();
      s.dwell(200 * 60, 5 * 60); // nothing for 3+ hours, outside any safe place
      return { story: s, speed: 0, title: "Ayaan's phone has not moved for 3+ hours, outside any safe place (reports back-dated, played instantly)." };
    }
    case "signal-lost": {
      const s = new Story(CTE);
      s.report();
      s.follow(await route("foot", CTE, wander));
      s.alongAll(1.3, 30); // walks away from the CTE Center, then nothing
      s.dwell(60, 30);
      return { story: s, speed: 0, endAgoMin: 200, title: "Ayaan's phone goes silent. The last report was 3+ hours ago, outside any safe place." };
    }
    default:
      return null;
  }
}

/** Asks the simulator server for a clean day, then waits until it is back. */
async function freshDay() {
  writeFileSync(path.join(DIR, "reset.flag"), "1");
  await sleep(1500);
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(B + "/api/state", { headers: authed().parent })).ok) return;
    } catch {
      /* still restarting */
    }
    await sleep(500);
  }
}

async function playScenario(name) {
  if (!existsSync(path.join(DIR, "family.json"))) {
    console.error("Start the simulator first:  node scripts/sim.mjs serve");
    process.exit(1);
  }
  const sc = await build(name);
  if (!sc) {
    console.error(`Unknown scenario "${name}". Try: school-run, pickup, late, arrive, wrong-place, sudden-stop, no-movement, signal-lost`);
    process.exit(1);
  }
  const h = authed();
  const speed = speedArg ?? sc.speed;
  const keepPlan = args.includes("--keep-plan"); // use the plan your Bee created instead of a scripted one
  if (name !== "arrive" && !keepPlan) await freshDay();
  console.log(`\n${sc.title}\n`);
  try {
    await fetch(B + "/api/state", { headers: h.parent });
  } catch {
    console.error("The simulator server is not running. Start it with:  node scripts/sim.mjs serve");
    process.exit(1);
  }
  const items = sc.story.items;
  const span = items[items.length - 1].t;
  const start = Date.now() - span - (sc.endAgoMin ?? 0) * 60000 - 2000;
  const begin = Date.now();
  let sent = 0;
  for (const it of items) {
    if (speed > 0) {
      const wait = it.t / speed - (Date.now() - begin);
      if (wait > 0) await sleep(wait);
    }
    const msg = {
      _type: "location",
      lat: it.lat,
      lon: it.lon,
      tst: Math.floor((start + it.t) / 1000),
      acc: 8,
      batt: it.batt,
      vel: Math.round(it.v * 3.6),
      cog: Math.round(((it.bearing % 360) + 360) % 360),
      t: it.regions.length ? "c" : "u",
      inregions: it.regions,
      motionactivities: [it.act],
    };
    const r = await fetch(B + "/ingest/owntracks", { method: "POST", headers: h.phone, body: JSON.stringify(msg) });
    if (!r.ok) {
      console.error(`The intake refused a report (${r.status}). Stopping.`);
      process.exit(1);
    }
    sent++;
    if (sent % 10 === 0) process.stdout.write(".");
  }
  if (sc.plan && !keepPlan) {
    const clock = (minsAgo) => {
      const d = new Date(Date.now() - minsAgo * 60000 - 300 * 60000);
      const hh = d.getUTCHours();
      return `${((hh + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
    };
    const r = await fetch(B + "/api/notes", { method: "POST", headers: h.parent, body: JSON.stringify({ text: `Ayaan has CTE class. I will pick him up at ${clock(15)}.` }) });
    const note = await r.json();
    if (note?.id) await fetch(B + `/api/plans/${note.id}/confirm`, { method: "POST", headers: h.parent });
    console.log("\nA pick-up plan (due 15 minutes ago) was added and confirmed.");
  }
  await sleep(2500);
  const s = await (await fetch(B + "/api/state", { headers: h.parent })).json();
  console.log(`\nSent ${sent} reports. Here is what the app says now:`);
  const regions = s.now_state?.last?.regions ?? [];
  console.log("  Where:        ", regions.length ? `in ${regions.join(", ")}` : "outside any safe place");
  console.log("  Concerns now: ", (s.signals ?? []).length ? s.signals.map((x) => `${x.title} (${x.id})`).join("; ") : "none");
  for (const p of s.plans ?? []) console.log(`  Plan:          ${p.status}`);
  console.log("  Alerts sent:  ", (s.alerts ?? []).length ? s.alerts.map((a) => a.sos?.title ?? a.sos?.headline ?? "alert").join("; ") : "none");
  console.log(`\nOpen ${B} to see it.\n`);
}

// Run last, so everything above is defined.
if (cmd && cmd !== "serve" && cmd !== "--help") await playScenario(cmd);
