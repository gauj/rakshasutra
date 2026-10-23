// End-to-end API checks against a running server (npm run dev:server, or npm run start -w @rakshasutra/server).
// Usage: node scripts/e2e.mjs [baseUrl]      Takes about a minute (the demo clock is accelerated).
// The delay story uses typed notes (labelled "not from Bee") so it runs without speaking to a Bee.
// It never dials or messages an emergency number; the app does not do that.

const B = process.argv[2] ?? "http://localhost:8787";
const H = { "x-parent-token": "demo-parent", "content-type": "application/json" };
const j = async (p, o = {}) => {
  const r = await fetch(B + p, { headers: H, ...o });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const ok = (n, c) => {
  c ? pass++ : fail++;
  console.log((c ? "PASS" : "FAIL") + "  " + n);
};
const st = async () => (await j("/api/state")).b;
const start = (scenario, speed) => j("/api/demo/start", { method: "POST", body: JSON.stringify({ scenario, speed }) });

console.log("--- auth");
ok("no token -> 401", (await fetch(B + "/api/state")).status === 401);
ok("token in query string is not accepted", (await fetch(B + "/api/state?token=demo-parent")).status === 401);

console.log("--- everyday");
await start("everyday", 5000);
await sleep(9000);
let s = await st();
ok("no alerts, safe, no messages", s.alerts.length === 0 && s.tier === "safe" && s.deliveries.length === 0);
ok("day timeline present (home, walk, school)", s.day.timeline.length >= 3);
let r = (await j("/api/report?hours=12")).b;
ok("report all-clear with stays", r.wellbeing === "all-clear" && r.stays.length >= 2);

console.log("--- abduction");
await start("abduction", 600);
await sleep(11000);
s = await st();
ok("critical with deliveries", s.tier === "critical" && s.deliveries.length > 0);
const sos = s.alerts[0].sos;
ok("SOS detail present", sos.timeline3h.length > 2 && sos.hr && sos.unknowns.length > 2 && sos.contacts.length === 2 && sos.longText.includes("WHAT WE DO NOT KNOW"));
ok("one incident, reminders bounded", new Set(s.alerts.map((a) => a.incidentId)).size === 1 && s.deliveries.filter((d) => d.kind === "reminder").length <= 3);
ok("no dial link anywhere", !JSON.stringify(s).includes("tel:"));
r = (await j("/api/report?hours=3")).b;
ok("report: concern, one incident", r.wellbeing === "concern" && r.incidents.length === 1);

console.log("--- delay (typed notes stand in for the guardian)");
await start("delay", 600);
await sleep(1500);
const p1 = await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "Aarav has robotics practice today. Practice ends at 5 and I'll pick him up at 5:30." }) });
ok("note 1 -> proposal 5:30 PM, typed", p1.s === 200 && p1.b.interpretation.includes("5:30 PM") && p1.b.source === "typed");
ok("a proposal alone does nothing", (await st()).tier === "safe");
await j("/api/plans/" + p1.b.id + "/confirm", { method: "POST" });
await sleep(7000);
s = await st();
const late = s.alerts[0]?.sos.why.find((w) => w.id === "LATE_ARRIVAL");
ok("late-arrival warning fired", !!late && s.alerts[0].tier === "warning");
ok("explanation: expected, place, not-an-emergency", late && late.detail.includes("5:30 PM") && late.detail.includes("Robotics Center") && late.detail.includes("does not confirm an emergency"));
ok("warning reached only the in-app channel", s.deliveries.every((d) => d.channel === "app"));
const p2 = await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "Aarav's robotics practice is running late, I'll pick him up at 6 instead of 5:30." }) });
ok("note 2 -> 6:00 PM (was 5:30)", p2.s === 200 && p2.b.interpretation.includes("6:00 PM") && p2.b.interpretation.includes("5:30 PM"));
await j("/api/plans/" + p2.b.id + "/confirm", { method: "POST" });
await sleep(9000);
ok("alert cleared after the plan change", (await st()).tier === "safe");
await sleep(9000);
s = await st();
ok("plan completed, exactly one alert", s.plans.some((p) => p.status === "completed") && s.alerts.length === 1);

console.log("--- hostile and edge inputs");
await j("/api/demo/stop", { method: "POST" });
ok("irrelevant note -> 422", (await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "buy milk" }) })).s === 422);
ok("empty note -> 400", (await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "  " }) })).s === 400);
ok("HTML in a note is data", [200, 422].includes((await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "<script>alert(1)</script> pick up at 5" }) })).s));
ok("20 KB note does not crash", [200, 400, 422].includes((await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "pick up at 5 " + "x".repeat(20000) }) })).s));
ok("broken JSON handled", [200, 400, 404, 422].includes((await fetch(B + "/api/notes", { method: "POST", headers: H, body: "{not json" })).status));
ok("unknown scenario falls back", (await start("nonsense", 10)).s === 200);
ok("absurd speed accepted and clamped", (await j("/api/demo/speed", { method: "POST", body: JSON.stringify({ speed: 1e12 }) })).s === 200);
await j("/api/demo/stop", { method: "POST" });
ok("ack unknown -> 404", (await j("/api/alerts/zzz/ack", { method: "POST", body: "{}" })).s === 404);
ok("confirm unknown -> 404", (await j("/api/plans/zzz/confirm", { method: "POST" })).s === 404);

console.log("--- voice: what the guardian says about the child");
await j("/api/demo/stop", { method: "POST" });
await j("/api/voice/dismiss", { method: "POST" });
let vs = await st();
ok("no voice at rest", vs.voice === null);
ok("ordinary chatter is ignored and never shown", (await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "remember to buy milk and call the plumber" }) })).s === 422 && (await st()).voice === null);
const vn = await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "Aarav has practice today and I will pick him up at six." }) });
vs = await st();
ok("a note about Aarav opens the Bee page data (kind plan, done, typed)", vn.s === 200 && vs.voice && vs.voice.kind === "plan" && vs.voice.status === "done" && vs.voice.source === "typed" && vs.voice.said.includes("pick him up"));
ok("spelled-out hour is read as 6:00 PM", vn.b.interpretation.includes("6:00 PM"));
const firstVoice = vs.voice.id;
await j("/api/notes", { method: "POST", body: JSON.stringify({ text: "Where is Aarav?" }) });
vs = await st();
ok("a question about Aarav is a new conversation (kind question)", vs.voice.kind === "question" && vs.voice.id > firstVoice);
ok("dismiss clears it", (await j("/api/voice/dismiss", { method: "POST" })).s === 200 && (await st()).voice === null);

console.log("--- responder links");
const urls = [];
for (let i = 0; i < 7; i++) urls.push((await j("/api/share", { method: "POST" })).b.url);
ok("only 5 links stay active", (await fetch(urls[0] + "/data")).status === 404 && (await fetch(urls[6] + "/data")).status === 200);
const pg = await fetch(urls[6]);
ok("page headers: no-store, noindex, origin-only referrer", pg.headers.get("cache-control") === "no-store" && pg.headers.get("x-robots-tag").includes("noindex") && pg.headers.get("referrer-policy") === "strict-origin");
const data = await (await fetch(urls[6] + "/data")).json();
ok("link exposes only name, age, position, speed and trail", Object.keys(data).sort().join() === "child,compass,expiresAt,now,position,speedKmh,trail" || Object.keys(data).sort().join() === "child,expiresAt,now,position,speedKmh,trail");
ok("wrong token -> 404", (await fetch(B + "/s/not-a-real-token/data")).status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
