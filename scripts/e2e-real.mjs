// End-to-end test of REAL mode, with no iPhone: it starts its own server with its own temporary data folder,
// then sends realistic OwnTracks messages through the real HTTP intake, exactly as the phone would.
// It never touches your demo or any real family data, and never contacts anyone.
// Usage: node scripts/e2e-real.mjs      (about a minute)

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rakshasutra-real-"));
const PORT = 8791;
const B = `http://localhost:${PORT}`;
const env = { ...process.env, DATA_DIR: dir, PORT: String(PORT), FORCE_DEMO: "", NTFY_TOPIC: "", BEE_NOTES: "", BEE_ALERTS: "", PUBLIC_URL: "" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const ok = (n, c) => {
  c ? pass++ : fail++;
  console.log((c ? "PASS" : "FAIL") + "  " + n);
};

const setup = spawnSync(process.execPath, ["--import", "tsx", "apps/server/src/setup-real.ts", "--name", "Ayaan", "--age", "13", "--tz", "-300"], { cwd: root, env, encoding: "utf8" });
if (setup.status !== 0) {
  console.error(setup.stdout, setup.stderr);
  process.exit(1);
}
const family = JSON.parse(readFileSync(path.join(dir, "family.json"), "utf8"));
const code = family.secrets.parentToken;
const basic = "Basic " + Buffer.from(`${family.secrets.ingestUser}:${family.secrets.ingestToken}`).toString("base64");
const H = { "x-parent-token": code, "content-type": "application/json" };

let server;
const start = async () => {
  server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 30000);
    server.stdout.on("data", (d) => String(d).includes("RakshaSutra API") && (clearTimeout(t), resolve()));
    server.on("exit", () => reject(new Error("server exited")));
  });
};
const stop = () => new Promise((r) => (server ? (server.once("exit", r), server.kill()) : r()));
const j = async (p, o = {}) => {
  const r = await fetch(B + p, { headers: H, ...o });
  return { s: r.status, b: await r.json().catch(() => null), r };
};
const post = (body, auth = basic) => fetch(B + "/ingest/owntracks", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
const state = async () => (await j("/api/state")).b;

// local clock text for "n minutes ago" in the child's time zone (UTC-5)
const localText = (minsAgo) => {
  const d = new Date(Date.now() - minsAgo * 60000 + -300 * 60000);
  const h = d.getUTCHours();
  return `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const now = () => Math.floor(Date.now() / 1000);
const HOME = { lat: 29.97, lon: -95.69 };
const ROBO = { lat: 29.9776, lon: -95.7063 };

try {
  await start();

  console.log("--- access");
  ok("no code -> 401", (await fetch(B + "/api/state")).status === 401);
  ok("wrong code -> 401", (await fetch(B + "/api/state", { headers: { "x-parent-token": "x".repeat(24) } })).status === 401);
  ok("the old demo code does not work in real mode", (await fetch(B + "/api/state", { headers: { "x-parent-token": "demo-parent" } })).status === 401);
  let s = await state();
  ok("real mode, Ayaan, no demo feed", s.mode === "real" && s.child.name === "Ayaan" && s.run === null);
  ok("demo controls are refused", (await j("/api/demo/start", { method: "POST", body: "{}" })).s === 409);
  const hdr = (await j("/api/state")).r.headers;
  ok("security headers: no-store, nosniff, no framing", hdr.get("cache-control") === "no-store" && hdr.get("x-content-type-options") === "nosniff" && hdr.get("x-frame-options") === "DENY");

  console.log("--- the iPhone's intake");
  ok("no login -> 401", (await post({}, null)).status === 401);
  ok("wrong password -> 401", (await post({}, "Basic " + Buffer.from(`${family.secrets.ingestUser}:wrong`).toString("base64"))).status === 401);
  ok("the family code is not the phone's password", (await post({}, "Basic " + Buffer.from(`${family.secrets.ingestUser}:${code}`).toString("base64"))).status === 401);
  let r = await post({ _type: "location", lat: ROBO.lat, lon: ROBO.lon, tst: now() - 3000, acc: 10, batt: 71, t: "c", inregions: [] });
  ok("a valid report is accepted and answered with []", r.status === 200 && JSON.stringify(await r.json()) === "[]");
  ok("garbage, a transition and an impossible position are ignored", (await post([{ _type: "transition", event: "enter" }, { _type: "location", lat: 999, lon: 1, tst: now() }, "x", null])).status === 200);
  ok("a 100 KB body is refused", (await fetch(B + "/ingest/owntracks", { method: "POST", headers: { authorization: basic }, body: "x".repeat(100_000) })).status === 413);
  s = await state();
  ok("exactly one report was kept, marked as coming from the phone", s.device.count === 1 && s.trail.length === 1 && s.now_state.last.source === "phone" && s.device.battery === 71);

  console.log("--- setting up the places and the iPhone link");
  r = await j("/api/setup?origin=" + encodeURIComponent("https://example.trycloudflare.com"));
  ok("setup works and, without places, still builds a link on the public address", r.s === 200 && r.b.iphone.link.startsWith("owntracks:///config?inline="));
  r = await j("/api/setup", { method: "PUT", body: JSON.stringify({ zones: [{ name: "Home", kind: "safe", ...HOME, radiusM: 120, allowPickup: true }, { name: "Robotics Center", kind: "safe", ...ROBO, radiusM: 120, allowPickup: true }], contacts: [{ name: "Aunt Meera", phone: "+1 555 0101" }] }) });
  ok("two safe places and a contact were saved", r.s === 200 && r.b.zones.length === 2 && r.b.contacts.length === 1);
  ok("an emergency number cannot be saved as a contact", (await j("/api/setup", { method: "PUT", body: JSON.stringify({ contacts: [{ name: "x", phone: "911" }] }) })).s === 400);
  ok("access codes cannot be changed from the browser", (await j("/api/setup", { method: "PUT", body: JSON.stringify({ secrets: { parentToken: "hacked-hacked-hacked-hacked" } }) })).s === 200 && (await fetch(B + "/api/state", { headers: { "x-parent-token": code } })).status === 200);
  r = await j("/api/setup?origin=" + encodeURIComponent("https://example.trycloudflare.com"));
  const cfg = JSON.parse(Buffer.from(r.b.iphone.link.split("inline=")[1], "base64").toString("utf8"));
  ok("the iPhone link carries https url, login, low-battery mode and both places", cfg.url === "https://example.trycloudflare.com/ingest/owntracks" && cfg.username === family.secrets.ingestUser && cfg.monitoring === 1 && cfg.waypoints.length === 2 && cfg.cmd === false);
  ok("a QR code is produced", r.b.iphone.qrSvg.startsWith("<svg") || r.b.iphone.qrSvg.includes("<svg"));
  ok("localhost cannot be used for the phone link", (await j("/api/setup?origin=" + encodeURIComponent("http://localhost:8791"))).b.iphone.needsPublicAddress === true);

  console.log("--- the real use case: left robotics, never arrived, then arrives");
  await post({ _type: "location", lat: ROBO.lat, lon: ROBO.lon, tst: now() - 1500, acc: 8, batt: 68, t: "c", inregions: ["Robotics Center"] });
  await post({ _type: "location", lat: ROBO.lat - 0.002, lon: ROBO.lon, tst: now() - 1380, acc: 20, batt: 66, t: "c", inregions: [] });
  r = await j("/api/notes", { method: "POST", body: JSON.stringify({ text: `Ayaan has robotics practice. I will pick him up at ${localText(20)}.` }) });
  ok("the guardian's note becomes a plan due 20 minutes ago", r.s === 200 && r.b.status === "proposed");
  await j("/api/plans/" + r.b.id + "/confirm", { method: "POST" });
  await sleep(1500);
  s = await state();
  const late = s.alerts[0]?.sos.why.find((w) => w.id === "LATE_ARRIVAL");
  ok("a late-arrival warning is raised, explained, with the last confirmed place", !!late && late.detail.includes("Robotics Center") && late.detail.includes("does not confirm an emergency"));
  ok("the parent was told: push attempted (no topic yet, so it says so) and shown in the app", s.deliveries.some((d) => d.channel === "app") && s.deliveries.some((d) => d.channel === "push" && !d.ok));
  ok("the rules that cry wolf on real kids are off (no vehicle / hours-still / sudden-stop)", !s.alerts[0].sos.why.some((w) => ["MODE_SHIFT_VEHICLE", "STATIONARY_LONG", "ABRUPT_STOP", "SILENCE"].includes(w.id)));
  await post({ _type: "location", lat: HOME.lat, lon: HOME.lon, tst: now(), acc: 9, batt: 63, t: "c", inregions: ["Home"] });
  await sleep(1500);
  s = await state();
  ok("a late report says he is home: plan completed, nothing overdue", s.plans.some((p) => p.status === "completed") && !s.signals.some((x) => x.id === "LATE_ARRIVAL"));

  console.log("--- it survives a restart");
  const before = (await state()).device.count;
  await sleep(6500); // saving is debounced by 5 seconds
  await stop();
  await start();
  s = await state();
  ok("the day's reports, plan and alert are back after a restart", s.trail.length >= 3 && s.plans.some((p) => p.status === "completed") && s.alerts.length >= 1 && before >= 3);

  console.log("--- guessing the family code is slowed down");
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await fetch(B + "/api/state", { headers: { "x-parent-token": "wrong-wrong-wrong-wrong" } })).status;
  ok("after about 10 wrong tries the address is blocked for a minute (429)", last === 429);
  ok("and even the right code is paused while blocked", (await fetch(B + "/api/state", { headers: { "x-parent-token": code } })).status === 429);
} catch (e) {
  fail++;
  console.log("FAIL  the test crashed: " + e.message);
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
