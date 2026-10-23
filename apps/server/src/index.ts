/**
 * The API server. It receives the child's location (from an iPhone through OwnTracks in real mode, or a simulator in
 * the demo), listens to the guardian's Bee, runs the engine, delivers alerts, and serves the web app.
 * Real mode keeps private data in the git-ignored data/ folder. Emergency numbers are display-only: nothing here dials them.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import QRCode from "qrcode";
import {
  AlertDispatcher,
  buildReport,
  buildScenario,
  buildTimeline,
  type Channel,
  type ChildProfile,
  compass,
  DEFAULT_THRESHOLDS,
  demoPlaces,
  demoProfile,
  type Evaluation,
  fmtClock,
  GuardianEngine,
  isQuestionAboutChild,
  isRelevantNote,
  NoteAssembler,
  ownTracksConfigLink,
  ownTracksToPing,
  type Plan,
  type Scenario,
  type ScenarioName,
  StaticPlaces,
  templateNarrative,
  type Thresholds,
} from "@rakshasutra/core";
import { BeeBridge, type BeeUtterance } from "./bee-bridge.js";
import { appChannel, beeChannel, ntfyChannel, smsChannel } from "./channels.js";
import { type FamilyConfig, loadFamily, loadState, profileFromFamily, REAL_DEFAULT_DISABLED, saveFamily, saveState, validateFamily } from "./family.js";
import { answerQuestion, narrateReport } from "./narrator.js";
import { cleanOrigin, clientIp, FailureLimiter, isLocalOrigin, safeEqual } from "./security.js";
import { activeShares, createShare, getShare, revokeShare, SHARE_PAGE } from "./share.js";

const PORT = Number(process.env.PORT ?? 8787);

// ---- Real family or demo ---------------------------------------------------
// If data/family.json exists, this server tracks a real child through their iPhone. Otherwise it is the demo.
let family: FamilyConfig | undefined = process.env.FORCE_DEMO === "1" ? undefined : loadFamily();
const REAL = !!family;
let profile: ChildProfile = family ? profileFromFamily(family) : demoProfile;
const CHILD_ID = profile.id;
const PARENT_ID = profile.parentIds[0]!;
const PARENT_TOKEN = process.env.PARENT_TOKEN ?? family?.secrets.parentToken ?? "demo-parent";

const thresholds: Thresholds = family
  ? { ...DEFAULT_THRESHOLDS, ...family.thresholds, disabledRules: family.rules?.disabled ?? REAL_DEFAULT_DISABLED }
  : DEFAULT_THRESHOLDS;
const engine = new GuardianEngine(REAL ? new StaticPlaces([]) : demoPlaces, thresholds);
engine.register(profile);
if (REAL) {
  const saved = loadState();
  if (saved) {
    engine.importState(saved);
    console.log(`[state] restored ${engine.pingsOf(CHILD_ID).length} location reports and ${engine.alerts.length} alerts`);
  }
}

// ---- Saving the day, so a restart does not lose it ---------------------------
let persistTimer: ReturnType<typeof setTimeout> | undefined;
/** Save the day to the data/ folder (real mode only), so a restart does not lose it. */
function persist() {
  if (!REAL) return;
  try {
    saveState(engine.exportState());
  } catch (e) {
    console.warn("[state] could not save:", (e as Error).message);
  }
}
// Batches saves: at most one every 5 seconds.
const schedulePersist = () => {
  if (!REAL || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persist();
  }, 5000);
};
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    persist();
    process.exit(0);
  });
}

// ---- Demo runner (virtual clock for the child's synthetic feed) -------------
// A running demo scenario, played on a virtual clock that can be sped up.
interface Run {
  scenario: Scenario;
  realStart: number;
  speed: number;
  cursor: number;
  anchorVirtual: number;
}
let run: Run | undefined;

// Simulated time advances `speed` times faster than real time and stops at the scenario's end.
const virtualNow = (r: Run) => Math.min(r.scenario.endTs, r.anchorVirtual + (Date.now() - r.realStart) * r.speed);
// Simulated time during a demo run, real time otherwise.
const nowMs = () => (run ? virtualNow(run) : Date.now());

// ---- Bee: the guardian's notes ---------------------------------------------
const assembler = new NoteAssembler();
let settle: ReturnType<typeof setTimeout> | undefined;
// How long the guardian must pause before a spoken note is treated as finished.
const SETTLE_MS = 4000;

// What the guardian just said about the child, for the "Bee" page. Only speech that is about the
// child is ever kept or shown: a Bee hears everything nearby, and the rest must never reach the screen.
interface Voice {
  id: number;
  at: number; // real ms of the latest piece
  said: string;
  status: "listening" | "done";
  kind?: "plan" | "question" | "note";
  planId?: string;
  source: "bee" | "typed";
}
let voice: Voice | undefined;
let voiceSeq = 0;
const aboutChild = (t: string) => isRelevantNote(t, profile) || isQuestionAboutChild(t, profile);

/** Start or extend the "listening" state for the Bee page; a new speaker source starts a new conversation. */
function openVoice(text: string, source: Voice["source"]) {
  if (!voice || voice.status === "done" || voice.source !== source) {
    voice = { id: ++voiceSeq, at: Date.now(), said: text, status: "listening", source };
  } else {
    voice.said = text;
    voice.at = Date.now();
  }
}

/** The note is complete: read it, and record what we understood. */
function finishSpoken(text: string, source: Voice["source"], ts = nowMs()) {
  openVoice(text, source);
  const plan = engine.proposeFromNote(CHILD_ID, text, ts, source);
  const v = voice!;
  v.said = text;
  v.at = Date.now();
  v.status = "done";
  if (plan) {
    v.kind = "plan";
    v.planId = plan.id;
  } else {
    v.kind = isQuestionAboutChild(text, profile) ? "question" : "note";
  }
  schedulePersist();
  return plan;
}

/** Every utterance the guardian's Bee hears arrives here; only speech about the child is kept (see aboutChild). */
function onBeeUtterance(u: BeeUtterance) {
  // Pieces are held in memory only. Bee delivers a spoken note out of order and can split a
  // time across sentences, so wait for a pause before reading the whole note.
  assembler.add({ id: u.id, text: u.text, spokenAt: u.spokenAt });
  const text = assembler.text();
  if (aboutChild(text)) openVoice(text, "bee"); // the page switches while the guardian is still talking
  clearTimeout(settle);
  settle = setTimeout(() => {
    const full = assembler.text();
    if (!aboutChild(full)) return;
    const plan = finishSpoken(full, "bee");
    assembler.clear();
    if (plan) console.log(`[bee] proposed plan from note: ${plan.interpretation}`);
  }, SETTLE_MS);
}

const bridge = new BeeBridge({
  command: process.env.BEE_CLI_BINARY,
  logRaw: process.env.BEE_RAW_LOG === "1",
  onUtterance: onBeeUtterance,
});
// Bee is off unless BEE_NOTES=1.
if (process.env.BEE_NOTES === "1") {
  void bridge.start().then(() => console.log(`[bee] ${bridge.status.state}: ${bridge.status.detail}`));
}
const beeLive = () => bridge.status.state === "live";

// ---- Proactive delivery: tell the parent without waiting for them to open the app ----
const pushOpts = {
  topic: () => process.env.NTFY_TOPIC ?? family?.notify?.ntfyTopic,
  publicUrl: () => process.env.PUBLIC_URL ?? family?.notify?.publicUrl,
  includeName: () => !!family?.notify?.ntfyIncludeName,
  childName: () => profile.name,
};
const push = ntfyChannel(pushOpts);
// The in-app list is always on. ntfy is added in real mode or when NTFY_TOPIC is set; Bee reminders and SMS to the parent are opt-in.
const channels: Channel[] = [appChannel];
if (REAL || process.env.NTFY_TOPIC) channels.push(push);
if (process.env.BEE_ALERTS === "1") channels.push(beeChannel(bridge, () => !!run));
if (process.env.SNS_TO_PHONE) channels.push(smsChannel(process.env.SNS_TO_PHONE));
const dispatcher = new AlertDispatcher(channels);

/** Confirm a plan and, best effort, write a reminder into the guardian's Bee for when it falls due. */
async function confirmPlan(planId: string): Promise<Plan | undefined> {
  const plan = engine.confirmPlan(planId);
  if (!plan) return undefined;
  schedulePersist();
  // Write the follow-up back to the guardian's Bee as a reminder, timed on the same clock as the demo.
  const target = plan.expectedAt + plan.graceMin * 60_000;
  const speed = run?.speed ?? 1;
  const real = Math.max(Date.now() + 60_000, Date.now() + (target - nowMs()) / speed);
  const label = run ? " (demo)" : "";
  const wrote = await bridge.addReminder(`Check that ${profile.name} is home. Expected by ${fmtClock(plan.expectedAt, profile.tzOffsetMin)}${label}`, new Date(real));
  if (wrote) console.log("[bee] reminder written to Bee todos");
  return plan;
}

/** Begin a demo scenario from a clean slate. */
function startRun(name: ScenarioName, speed?: number) {
  engine.reset(CHILD_ID);
  dispatcher.reset();
  assembler.clear();
  voice = undefined;
  const scenario = buildScenario(name);
  run = { scenario, realStart: Date.now(), speed: speed ?? scenario.defaultSpeed, cursor: 0, anchorVirtual: scenario.startTs };
}

/** Change the demo speed without a jump in simulated time. */
function setSpeed(speed: number) {
  if (!run) return;
  run.anchorVirtual = virtualNow(run);
  run.realStart = Date.now();
  run.speed = speed;
}

// Main loop, every 200 ms: deliver alerts, then either keep judging real time (real mode) or play the demo events that are now due.
setInterval(() => {
  void dispatcher.sync(engine.alerts, nowMs());
  if (REAL) {
    // Real time passes whether or not the phone reports: keep judging (for example, "he is overdue").
    engine.tick(CHILD_ID, Date.now());
    return;
  }
  if (!run) return;
  const now = virtualNow(run);
  const ev = run.scenario.events;
  while (run.cursor < ev.length && ev[run.cursor]!.t <= now) {
    const e = ev[run.cursor++]!;
    if (e.ping) engine.ingestPing(e.ping);
    else if (e.utterance) engine.ingestUtterance(e.utterance);
    else if (e.note && !beeLive()) finishSpoken(e.note, "typed", e.t);
    else if (e.planAction && !beeLive()) {
      const latest = [...engine.plansOf(CHILD_ID)].reverse().find((p) => p.status === "proposed");
      if (latest) void confirmPlan(latest.id);
    }
  }
  engine.tick(CHILD_ID, now);
}, 200);

// ---- The phone: what the iPhone has told us -----------------------------------
// What the phone last reported, in memory only; shown on the Set up page.
const device = { lastAt: 0, battery: undefined as number | undefined, count: 0, lastTrigger: undefined as string | undefined };

// ---- HTTP ------------------------------------------------------------------
const app = new Hono();
// Ten failed attempts from one address in a minute block that address for the rest of the minute.
const authFailures = new FailureLimiter(10, 60_000);
const ingestFailures = new FailureLimiter(10, 60_000);

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin");
  c.header("X-Frame-Options", "DENY");
  const p = new URL(c.req.url).pathname;
  // The app page may only load its own scripts, talk to itself, and fetch map tiles and fonts. (The read-only share page has its own header.)
  if (!p.startsWith("/s/")) {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
    );
  }
  if (p.startsWith("/api/") || p.startsWith("/ingest/")) c.header("Cache-Control", "no-store");
});

app.use("/api/*", async (c, next) => {
  const ip = clientIp(c);
  if (authFailures.blocked(ip)) return c.json({ error: "too many attempts, wait a minute" }, 429);
  if (!safeEqual(c.req.header("x-parent-token") ?? "", PARENT_TOKEN)) {
    authFailures.hit(ip);
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// Reply for demo controls when the server is following a real child.
const demoOnly = () => ({ error: "Demo controls are off: this server is following a real child." });

// Belt and braces: the signed-in parent must be a parent of this child.
function ownsChild(): boolean {
  return !!engine.profile(CHILD_ID)?.parentIds.includes(PARENT_ID);
}

// Everything the app shows, in one poll. The trail is thinned to about 400 points.
app.get("/api/state", (c) => {
  if (!ownsChild()) return c.json({ error: "forbidden" }, 403);
  const now = nowMs();
  const ev: Evaluation | undefined = engine.tick(CHILD_ID, now);
  const pings = engine.pingsOf(CHILD_ID);
  const from = now - 3 * 3600_000;
  const trail = pings.filter((p) => p.ts >= from).filter((_, i, a) => a.length < 400 || i % Math.ceil(a.length / 400) === 0);
  const s = ev?.snapshot;
  return c.json({
    mode: REAL ? "real" : "demo",
    now,
    run: run ? { name: run.scenario.name, title: run.scenario.title, speed: run.speed, progress: (now - run.scenario.startTs) / (run.scenario.endTs - run.scenario.startTs) } : null,
    bee: { ...bridge.status, scriptedNotes: !beeLive() },
    device: REAL ? { connected: device.lastAt > 0, lastAt: device.lastAt || null, battery: device.battery ?? null, count: device.count } : null,
    child: { id: profile.id, name: profile.name, age: profile.age, zones: profile.zones, consent: profile.consent, tzOffsetMin: profile.tzOffsetMin, photo: family?.child.photo ?? "" },
    tier: ev?.tier ?? "safe",
    score: ev?.score ?? 0,
    signals: ev?.signals ?? [],
    now_state: s
      ? { last: s.last, speedKmh: Math.round(s.speedMs * 36) / 10, headingDeg: s.headingDeg, motion: s.motion, zone: s.zoneNow?.name, lastPingAgeMin: s.lastPingAgeMin }
      : null,
    trail,
    alerts: [...engine.alerts].reverse(),
    plans: [...engine.plansOf(CHILD_ID)].reverse(),
    voice: voice && Date.now() - voice.at < 10 * 60_000 ? voice : null,
    day: { from: pings[0]?.ts ?? now, timeline: buildTimeline(pings, pings[0]?.ts ?? now, now, profile) },
    deliveries: [...dispatcher.records].reverse().slice(0, 40),
    channels: channels.map((c) => ({ id: c.id, label: c.label, minTier: c.minTier })),
    shares: activeShares().map((x) => ({ token: x.token, expiresAt: x.expiresAt })),
  });
});

app.post("/api/demo/start", async (c) => {
  if (REAL) return c.json(demoOnly(), 409);
  const b = (await c.req.json().catch(() => ({}))) as { scenario?: ScenarioName; speed?: number };
  const name: ScenarioName = b.scenario === "everyday" || b.scenario === "delay" ? b.scenario : "abduction";
  startRun(name, b.speed);
  return c.json({ ok: true });
});

app.post("/api/demo/speed", async (c) => {
  if (REAL) return c.json(demoOnly(), 409);
  const b = (await c.req.json().catch(() => ({}))) as { speed?: number };
  if (b.speed && b.speed > 0) setSpeed(Math.min(b.speed, 5000));
  return c.json({ ok: true });
});

app.post("/api/demo/stop", (c) => {
  if (REAL) return c.json(demoOnly(), 409);
  run = undefined;
  engine.reset(CHILD_ID);
  dispatcher.reset();
  return c.json({ ok: true });
});

app.post("/api/alerts/:id/ack", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { falseAlarm?: boolean };
  const a = engine.acknowledge(c.req.param("id"), !!b.falseAlarm, nowMs());
  if (a) schedulePersist();
  return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

// Live link for responders: created only when the parent asks, read-only, expires in 2 hours, revocable.
app.post("/api/share", (c) => {
  const sh = createShare(CHILD_ID);
  const origin = new URL(c.req.url).origin;
  return c.json({ url: `${origin}/s/${sh.token}`, token: sh.token, expiresAt: sh.expiresAt });
});

app.delete("/api/share/:token", (c) => (revokeShare(c.req.param("token")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404)));

app.post("/api/voice/dismiss", (c) => {
  voice = undefined;
  assembler.clear();
  return c.json({ ok: true });
});

// Plans: proposed from a Bee note, applied only after the guardian confirms.
app.post("/api/plans/:id/confirm", async (c) => {
  const p = await confirmPlan(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "not found or not pending" }, 404);
});

app.post("/api/plans/:id/reject", (c) => {
  const p = engine.rejectPlan(c.req.param("id"));
  if (p) schedulePersist();
  return p ? c.json(p) : c.json({ error: "not found or not pending" }, 404);
});

// Typed note: a fallback for testing without a Bee. Clearly marked as not coming from Bee.
app.post("/api/notes", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { text?: string };
  if (!b.text?.trim()) return c.json({ error: "text required" }, 400);
  const text = b.text.slice(0, 500);
  if (!aboutChild(text)) return c.json({ error: `That does not look like a note about ${profile.name}, a pick-up or a schedule.` }, 422);
  const plan = finishSpoken(text, "typed");
  return plan ? c.json(plan) : c.json({ ok: true, kind: voice?.kind });
});

/** Report for the last `hours` hours, or since the first ping if the history is shorter. */
function reportFor(hours: number) {
  const now = nowMs();
  const first = engine.pingsOf(CHILD_ID)[0]?.ts ?? now;
  const from = Math.max(first, now - hours * 3600_000);
  const r = buildReport(profile, engine.pingsOf(CHILD_ID), engine.alerts, from, now);
  return { ...r, narrative: templateNarrative(r, profile.tzOffsetMin) };
}

app.get("/api/report", async (c) => {
  const hours = Math.min(24, Math.max(1, Number(c.req.query("hours") ?? 3)));
  const r = reportFor(hours);
  const n = await narrateReport(r, profile);
  return c.json({ ...r, narrative: n.text, narrativeEngine: n.engine });
});

app.post("/api/ask", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { question?: string };
  if (!b.question?.trim()) return c.json({ error: "question required" }, 400);
  const n = await answerQuestion(b.question.slice(0, 300), reportFor(6), profile);
  return c.json(n);
});

// ---- Setup: the family, the places, the iPhone, the notifications (real mode) -------------------
/**
 * What the Set up page needs. The iPhone link (and QR code) is built only when a public address is known, because
 * the phone cannot reach a local one. The link carries the phone's access code, so this is parent-only.
 */
async function setupPayload(origin: string) {
  const f = family!;
  const base = origin && !isLocalOrigin(origin) ? origin : process.env.PUBLIC_URL ?? f.notify?.publicUrl ?? "";
  let link: string | undefined;
  let qrSvg: string | undefined;
  if (base) {
    link = ownTracksConfigLink({
      baseUrl: base,
      username: f.secrets.ingestUser,
      password: f.secrets.ingestToken,
      tid: f.child.name.slice(0, 2),
      places: f.zones.filter((z) => z.kind === "safe").map((z) => ({ name: z.name, lat: z.lat, lon: z.lon, radiusM: z.radiusM })),
      monitoring: 1,
    });
    qrSvg = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "L", color: { dark: "#11111b", light: "#ffffff" } });
  }
  return {
    child: f.child,
    contacts: f.contacts,
    zones: f.zones,
    notify: { ntfyTopic: f.notify?.ntfyTopic ?? "", ntfyIncludeName: !!f.notify?.ntfyIncludeName, publicUrl: f.notify?.publicUrl ?? "" },
    rules: { disabled: f.rules?.disabled ?? REAL_DEFAULT_DISABLED },
    iphone: { baseUrl: base, link, qrSvg, needsPublicAddress: !base, username: f.secrets.ingestUser },
    device: { connected: device.lastAt > 0, lastAt: device.lastAt || null, battery: device.battery ?? null, count: device.count },
  };
}

app.get("/api/setup", async (c) => {
  if (!REAL || !family) return c.json({ error: "Setup is for a real family. Run the setup command first." }, 409);
  return c.json(await setupPayload(cleanOrigin(c.req.query("origin"))));
});

app.put("/api/setup", async (c) => {
  if (!REAL || !family) return c.json({ error: "Setup is for a real family. Run the setup command first." }, 409);
  const b = (await c.req.json().catch(() => undefined)) as Record<string, any> | undefined;
  if (!b || typeof b !== "object") return c.json({ error: "bad request" }, 400);
  try {
    const next = validateFamily({
      child: { ...family.child, ...(b.child ?? {}), id: family.child.id },
      contacts: b.contacts ?? family.contacts,
      zones: b.zones ?? family.zones,
      rules: family.rules,
      thresholds: family.thresholds,
      notify: { ...(family.notify ?? {}), ...(b.notify ?? {}) },
      secrets: family.secrets, // access codes can only be changed on the server, never from the browser
    });
    saveFamily(next);
    family = next;
    profile = profileFromFamily(next);
    engine.updateProfile(profile);
    return c.json(await setupPayload(cleanOrigin(c.req.query("origin"))));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.post("/api/setup/test-push", async (c) => {
  if (!REAL) return c.json({ error: "real mode only" }, 409);
  const r = await push.send({ alertId: "test", incidentId: "test", childId: CHILD_ID, tier: "warning", kind: "new", subject: "Test", short: "Test", long: "Test", emergencyBrief: "", at: Date.now() });
  return c.json(r, r.ok ? 200 : 502);
});

// ---- The iPhone reports here (OwnTracks, HTTP mode) ---------------------------------------------
// Open to the internet by design, so it is guarded by its own long access code, rate limited,
// size limited, and everything it accepts is validated and trimmed (see ownTracksToPing).
app.post("/ingest/owntracks", async (c) => {
  if (!REAL || !family) return c.json({ error: "not found" }, 404);
  const ip = clientIp(c);
  if (ingestFailures.blocked(ip)) return c.json({ error: "too many attempts" }, 429);
  const m = /^Basic (.+)$/i.exec(c.req.header("authorization") ?? "");
  let ok = false;
  if (m) {
    const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
    const i = decoded.indexOf(":");
    ok = i > 0 && safeEqual(decoded.slice(0, i), family.secrets.ingestUser) && safeEqual(decoded.slice(i + 1), family.secrets.ingestToken);
  }
  if (!ok) {
    ingestFailures.hit(ip);
    return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": 'Basic realm="RakshaSutra"' });
  }
  const raw = await c.req.text();
  if (raw.length > 65_536) return c.json({ error: "too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "bad json" }, 400);
  }
  const msgs = Array.isArray(body) ? body.slice(0, 50) : [body];
  let accepted = 0;
  for (const msg of msgs) {
    const ping = ownTracksToPing(msg, CHILD_ID);
    if (!ping) continue;
    engine.ingestPing(ping);
    accepted++;
    if (ping.ts >= device.lastAt) {
      device.lastAt = ping.ts;
      device.battery = ping.battery ?? device.battery;
      device.lastTrigger = ping.trigger;
    }
  }
  device.count += accepted;
  if (accepted) schedulePersist();
  return c.json([]); // OwnTracks expects an array back
});

// Public, token-gated: no parent header, so it exposes the minimum a responder needs.
// Headers for the responder pages: never cached or indexed.
const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "strict-origin" };
app.get("/s/:token", (c) => {
  if (!getShare(c.req.param("token"))) return c.text("This link has expired or was revoked.", 404, noStore);
  return c.html(SHARE_PAGE, 200, noStore);
});
app.get("/s/:token/data", (c) => {
  const sh = getShare(c.req.param("token"));
  if (!sh) return c.json({ error: "expired" }, 404, noStore);
  const now = nowMs();
  const ev = engine.tick(CHILD_ID, now);
  const last = ev?.snapshot.last;
  const trail = engine.pingsOf(CHILD_ID).filter((p) => p.ts >= now - 3 * 3600_000).filter((_, i, a) => a.length < 300 || i % Math.ceil(a.length / 300) === 0);
  return c.json(
    {
      now,
      expiresAt: sh.expiresAt,
      child: { name: profile.name, age: profile.age, description: profile.description, medical: profile.medical },
      position: last ? { lat: last.lat, lon: last.lon, ts: last.ts } : null,
      speedKmh: Math.round((ev?.snapshot.speedMs ?? 0) * 36) / 10,
      compass: ev?.snapshot.headingDeg !== undefined ? compass(ev.snapshot.headingDeg) : undefined,
      trail: trail.map((p) => ({ lat: p.lat, lon: p.lon })),
    },
    200,
    noStore,
  );
});

// ---- The web app itself, so one address (and one tunnel) serves everything ----------------------
const WEB_DIST = fileURLToPath(new URL("../../web/dist/", import.meta.url));
if (existsSync(path.join(WEB_DIST, "index.html"))) {
  const rel = path.relative(process.cwd(), WEB_DIST).replace(/\\/g, "/");
  app.use("/*", serveStatic({ root: rel }));
  app.get("/", serveStatic({ path: `${rel}/index.html` }));
  console.log(`[web] serving the app from ${rel}`);
}

// Listen on this computer only by default: the phone and any visitors arrive through the tunnel, which connects locally.
// Set HOST=0.0.0.0 only if you deliberately want other devices on your network to reach it.
const HOST = process.env.HOST || "127.0.0.1";
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () =>
  console.log(`RakshaSutra API on http://localhost:${PORT} (${REAL ? `REAL: following ${profile.name}` : "demo"})`),
);
