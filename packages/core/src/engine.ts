import { fmtMi, fmtMph } from "./units.js";
/**
 * The rules engine. It keeps each child's recent pings, turns them into signals, scores those into a tier,
 * and raises, updates or quiets alerts. It only judges and builds alerts; sending is done elsewhere.
 */
import { bearingDeg, haversineM, inQuietHours, localHour } from "./geo.js";
import { fmtClock, parseScheduleNote } from "./schedule.js";
import { buildSos, PlacesProvider } from "./sos.js";
import {
  Alert,
  ChildProfile,
  DEFAULT_THRESHOLDS,
  Evaluation,
  Ping,
  Plan,
  Signal,
  Snapshot,
  Thresholds,
  Tier,
  Utterance,
  Motion,
  Zone,
} from "./types.js";

// Pings older than 24 hours are dropped.
const HISTORY_MS = 24 * 3600_000;
// A distress phrase keeps counting as a signal for 10 minutes.
const VOICE_HOLD_MS = 10 * 60_000;
/** How far outside a watched place the child may be before it counts as leaving (GPS wobble and a walk to the gate). */
const WATCH_MARGIN_M = 60;

/** Phrases that flag an utterance as distress. Only checked when the child's voice consent is on. */
export const DISTRESS_PATTERNS: RegExp[] = [
  /\bhelp( me)?\b/i,
  /\blet (me )?go\b/i,
  /\bleave me alone\b/i,
  /\bdon'?t touch me\b/i,
  /\bstop it\b/i,
  /\bi don'?t know (you|him|her|them)\b/i,
  /\bwhere are you taking me\b/i,
  /\bi want (my )?(mom|mum|mommy|mama|dad|daddy|papa)\b/i,
];

// Per-child working state held in memory.
interface ChildState {
  profile: ChildProfile;
  pings: Ping[];
  flaggedVoice: { ts: number; snippet: string }[];
  plans: Plan[];
  /** After a parent acknowledges, the same situation does not re-alert until it gets worse or the hold ends. */
  suppress?: { tier: Tier; ids: Set<string>; until: number };
  openAlert?: Alert;
  lastRaisedAt?: number;
  quietSince?: number;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Inside a place if the phone says so (region monitoring), or the position is within its radius. */
function zoneContains(z: Zone, p: { lat: number; lon: number; regions?: string[] }): boolean {
  if (p.regions?.some((r) => same(r, z.id) || same(r, z.name))) return true;
  return haversineM(z, p) <= z.radiusM;
}

/** The saved form of the engine (see exportState). Voice snippets are not part of it. */
export interface EngineSnapshot {
  pings: Record<string, Ping[]>;
  plans: Record<string, Plan[]>;
  alerts: Alert[];
  seq: number;
  incSeq: number;
  planSeq: number;
}

/**
 * Judges each registered child from their pings. Score is the sum of signal severities (1, 3, 6):
 * 1 or more is watch, 3 or more is warning, 6 or more is critical. Alerts are raised from warning up.
 */
export class GuardianEngine {
  private children = new Map<string, ChildState>();
  readonly alerts: Alert[] = [];
  private seq = 0;
  private incSeq = 0;
  /** Plans whose safe arrival has already been announced, so each is announced once. */
  private announced = new Set<string>();
  private planSeq = 0;

  constructor(
    private places: PlacesProvider,
    private th: Thresholds = DEFAULT_THRESHOLDS,
  ) {}

  register(profile: ChildProfile) {
    this.children.set(profile.id, { profile, pings: [], flaggedVoice: [], plans: [] });
  }

  /** Change a child's details (name, places, contacts) without losing the history. */
  updateProfile(profile: ChildProfile) {
    const st = this.children.get(profile.id);
    if (st) st.profile = profile;
    else this.register(profile);
  }

  /** Everything worth keeping across a restart. Voice snippets are deliberately not saved. */
  exportState(): EngineSnapshot {
    const pings: Record<string, Ping[]> = {};
    const plans: Record<string, Plan[]> = {};
    for (const [id, st] of this.children) {
      pings[id] = st.pings;
      plans[id] = st.plans;
    }
    return { pings, plans, alerts: this.alerts, seq: this.seq, incSeq: this.incSeq, planSeq: this.planSeq };
  }

  /** Restore saved history and alerts. Only children already registered are filled in. */
  importState(s: EngineSnapshot) {
    for (const [id, st] of this.children) {
      st.pings = (s.pings[id] ?? []).slice().sort((a, b) => a.ts - b.ts);
      st.plans = s.plans[id] ?? [];
    }
    this.alerts.length = 0;
    this.alerts.push(...s.alerts);
    this.seq = s.seq;
    this.incSeq = s.incSeq;
    this.planSeq = s.planSeq;
    // Plans already completed before the restart were announced then: do not announce them again.
    for (const st of this.children.values()) for (const p of st.plans) if (p.status === "completed") this.announced.add(p.id);
    for (const [id, st] of this.children) {
      st.openAlert = [...this.alerts].reverse().find((a) => a.childId === id && a.status === "open");
    }
  }

  profile(childId: string): ChildProfile | undefined {
    return this.children.get(childId)?.profile;
  }

  pingsOf(childId: string): Ping[] {
    return this.children.get(childId)?.pings ?? [];
  }

  plansOf(childId: string): Plan[] {
    return this.children.get(childId)?.plans ?? [];
  }

  /** The confirmed plan currently in force, if any. */
  activePlan(childId: string): Plan | undefined {
    return this.children.get(childId)?.plans.find((p) => p.status === "confirmed");
  }

  /** Add a proposed plan. It has no effect on alerts until the guardian confirms it. */
  proposePlan(p: Omit<Plan, "id" | "status">): Plan {
    const st = this.children.get(p.childId)!;
    const plan: Plan = { ...p, id: `plan-${++this.planSeq}`, status: "proposed" };
    // A newer proposal replaces older unconfirmed ones.
    for (const o of st.plans) if (o.status === "proposed") o.status = "rejected";
    st.plans.push(plan);
    return plan;
  }

  /** Turn a guardian note into a proposed plan, if it is about the schedule. */
  proposeFromNote(childId: string, text: string, ts: number, source: Plan["source"]): Plan | undefined {
    const st = this.children.get(childId);
    if (!st) return undefined;
    const lastPing = st.pings[st.pings.length - 1];
    const currentZoneId = lastPing ? st.profile.zones.find((z) => z.kind === "safe" && zoneContains(z, lastPing))?.id : undefined;
    const parsed = parseScheduleNote(text, { profile: st.profile, ts, current: this.activePlan(childId), currentZoneId });
    return parsed ? this.proposePlan({ ...parsed, source }) : undefined;
  }

  /** Plans that reached their place since the last call. The server turns each into one good-news message. */
  newlyCompleted(childId: string): Plan[] {
    const st = this.children.get(childId);
    if (!st) return [];
    const fresh = st.plans.filter((p) => p.status === "completed" && !this.announced.has(p.id));
    for (const p of fresh) this.announced.add(p.id);
    return fresh;
  }

  /** Make a proposed plan the one in force; any earlier confirmed plan is superseded. */
  confirmPlan(planId: string): Plan | undefined {
    for (const st of this.children.values()) {
      const plan = st.plans.find((x) => x.id === planId);
      if (!plan || plan.status !== "proposed") continue;
      for (const o of st.plans) if (o.status === "confirmed") o.status = "superseded";
      plan.status = "confirmed";
      return plan;
    }
    return undefined;
  }

  /** Discard a proposed plan. */
  rejectPlan(planId: string): Plan | undefined {
    for (const st of this.children.values()) {
      const plan = st.plans.find((x) => x.id === planId);
      if (plan && plan.status === "proposed") {
        plan.status = "rejected";
        return plan;
      }
    }
    return undefined;
  }

  /** Forget history and alerts for a child (used when a demo scenario restarts). */
  reset(childId: string) {
    const st = this.children.get(childId);
    if (!st) return;
    st.pings = [];
    st.flaggedVoice = [];
    st.plans = [];
    this.announced.clear();
    st.suppress = undefined;
    st.openAlert = undefined;
    st.lastRaisedAt = undefined;
    st.quietSince = undefined;
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      if (this.alerts[i]!.childId === childId) this.alerts.splice(i, 1);
    }
  }

  /** Ingest a location/vitals ping. Honours consent: no location consent, no storage. */
  ingestPing(p: Ping): Evaluation | undefined {
    const st = this.children.get(p.childId);
    if (!st || !st.profile.consent.location) return undefined;
    const clean: Ping = { ...p };
    if (!st.profile.consent.heartRate) delete clean.hr;
    // Phones deliver queued reports late and out of order: keep the history sorted and drop exact repeats.
    const arr = st.pings;
    let i = arr.length;
    while (i > 0 && arr[i - 1]!.ts > clean.ts) i--;
    const before = arr[i - 1];
    if (before && before.ts === clean.ts && before.lat === clean.lat && before.lon === clean.lon) return undefined;
    arr.splice(i, 0, clean);
    const newest = arr[arr.length - 1]!.ts;
    const cutoff = newest - HISTORY_MS;
    while (arr.length && arr[0]!.ts < cutoff) arr.shift();
    return this.evaluate(p.childId, Math.max(p.ts, newest));
  }

  /** Voice is opt-in. Only the matched snippet is retained, never the transcript. */
  ingestUtterance(u: { childId: string; ts: number; text: string }): Evaluation | undefined {
    const st = this.children.get(u.childId);
    if (!st || !st.profile.consent.voice) return undefined;
    const hit = DISTRESS_PATTERNS.map((r) => r.exec(u.text)).find(Boolean);
    if (hit) {
      const i = hit.index;
      st.flaggedVoice.push({ ts: u.ts, snippet: u.text.slice(Math.max(0, i - 15), i + hit[0].length + 15).trim() });
    }
    return this.evaluate(u.childId, u.ts);
  }

  /** Re-judge a child at a given time without new data, so silence and overdue plans are noticed. */
  tick(childId: string, now: number): Evaluation | undefined {
    return this.children.has(childId) ? this.evaluate(childId, now) : undefined;
  }

  /**
   * Mark an alert seen or a false alarm. The same situation is then held back for 30 minutes (60 for a false alarm)
   * unless it gets worse.
   */
  acknowledge(alertId: string, falseAlarm: boolean, now?: number): Alert | undefined {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a) return undefined;
    a.status = falseAlarm ? "false-alarm" : "acknowledged";
    const st = this.children.get(a.childId);
    if (st) {
      if (st.openAlert?.id === a.id) st.openAlert = undefined;
      const at = now ?? st.pings[st.pings.length - 1]?.ts ?? Date.now();
      st.suppress = { tier: a.tier, ids: new Set(a.sos.why.map((w) => w.id)), until: at + (falseAlarm ? 60 : 30) * 60_000 };
    }
    return a;
  }

  /** Current speed, heading, motion class, zone and last movement for a child. */
  snapshot(childId: string, now: number): Snapshot {
    const st = this.children.get(childId)!;
    const pings = st.pings;
    const last = pings[pings.length - 1];
    const snap: Snapshot = { childId, now, last, speedMs: 0, motion: "unknown" };
    if (!last) return snap;
    snap.lastPingAgeMin = (now - last.ts) / 60000;
    const prev = this.prevForSpeed(pings);
    if (prev) {
      const dt = (last.ts - prev.ts) / 1000;
      const d = haversineM(prev, last);
      // Moves smaller than half the reported accuracy (at least 5 m) are treated as GPS jitter, not movement.
      const noise = Math.max(5, (last.accuracyM ?? 10) * 0.5);
      snap.speedMs = d < noise ? 0 : d / dt;
      if (d >= noise) snap.headingDeg = bearingDeg(prev, last);
    }
    // The phone's own speed and heading beat our estimate from sparse positions.
    if (last.speedKmh !== undefined) snap.speedMs = last.speedKmh / 3.6;
    if (last.headingDeg !== undefined) snap.headingDeg = last.headingDeg;
    snap.motion = this.motionOf(snap.speedMs);
    snap.zoneNow = st.profile.zones.find((z) => zoneContains(z, last));
    for (let i = pings.length - 1; i > 0; i--) {
      const a = pings[i - 1]!;
      const b = pings[i]!;
      const d = haversineM(a, b);
      if (d > 8 && d / Math.max(1, (b.ts - a.ts) / 1000) > 0.7) {
        snap.lastMovementTs = b.ts;
        break;
      }
    }
    return snap;
  }

  /** An earlier ping at least 2 seconds before the last one, so speed is not computed from near-duplicates. */
  private prevForSpeed(pings: Ping[]): Ping | undefined {
    const last = pings[pings.length - 1];
    if (!last) return undefined;
    for (let i = pings.length - 2; i >= 0; i--) {
      if (last.ts - pings[i]!.ts >= 2000) return pings[i];
    }
    return undefined;
  }

  /** Walking up to walkMaxMs, vehicle from vehicleSpeedMs, "moving" (running or cycling pace) in between. */
  private motionOf(v: number): Motion {
    if (v < 0.5) return "still";
    if (v <= this.th.walkMaxMs) return "walking";
    if (v < this.th.vehicleSpeedMs) return "moving";
    return "vehicle";
  }

  /** Speed series over the recent window. */
  private speedSeries(pings: Ping[], sinceTs: number): { ts: number; v: number; dt: number }[] {
    const out: { ts: number; v: number; dt: number }[] = [];
    for (let i = 1; i < pings.length; i++) {
      const a = pings[i - 1]!;
      const b = pings[i]!;
      if (b.ts < sinceTs) continue;
      const dt = (b.ts - a.ts) / 1000;
      if (dt <= 0) continue;
      const d = haversineM(a, b);
      const noise = Math.max(5, (b.accuracyM ?? 10) * 0.5);
      out.push({ ts: b.ts, v: d < noise ? 0 : d / dt, dt });
    }
    return out;
  }

  /** Score the rules, pick the tier, and raise an alert if warranted. */
  private evaluate(childId: string, now: number): Evaluation {
    const st = this.children.get(childId)!;
    const snap = this.snapshot(childId, now);
    const signals = this.rules(st, snap, now);
    const score = signals.reduce((s, x) => s + x.severity, 0);
    const tier: Tier = score >= 6 ? "critical" : score >= 3 ? "warning" : score >= 1 ? "watch" : "safe";
    const ev: Evaluation = { childId, now, tier, score, signals, snapshot: snap };
    this.maybeRaise(st, ev);
    return ev;
  }

  /**
   * Decide whether this evaluation produces a new alert: the first one for a situation, an escalation, or a
   * follow-up when a new serious signal appears. Ten quiet minutes resolve an open alert.
   */
  private maybeRaise(st: ChildState, ev: Evaluation) {
    const rank: Record<Tier, number> = { safe: 0, watch: 1, warning: 2, critical: 3 };
    if (rank[ev.tier] < 2) {
      if (ev.tier === "safe" && st.openAlert) {
        st.quietSince ??= ev.now;
        if (ev.now - st.quietSince > 10 * 60_000) {
          st.openAlert.status = "resolved";
          st.openAlert = undefined;
        }
      }
      return;
    }
    st.quietSince = undefined;
    const open = st.openAlert;
    if (!open && st.suppress) {
      const sup = st.suppress;
      const worse = rank[ev.tier] > rank[sup.tier] || ev.signals.some((x) => x.severity >= 3 && !sup.ids.has(x.id));
      if (ev.now < sup.until && !worse) return;
      if (worse || ev.now >= sup.until) st.suppress = undefined;
    }
    const escalated = !!open && rank[ev.tier] > rank[open.tier];
    const cooled = !st.lastRaisedAt || ev.now - st.lastRaisedAt > this.th.alertCooldownMin * 60_000;
    // A follow-up goes out when a new serious signal joins an open alert (at most once a minute).
    const known = new Set(open?.sos.why.map((w) => w.id));
    const newSignal = !!open && ev.signals.some((x) => x.severity >= 3 && !known.has(x.id));
    const followUp = newSignal && ev.now - (st.lastRaisedAt ?? 0) >= 60_000;
    if (open && !escalated && !followUp) return;
    if (!open && !cooled) return;
    // Follow-ups keep earlier evidence (e.g. the vehicle pick-up) even after its detection window passes.
    const carried = (open?.sos.why ?? []).filter((w) => !ev.signals.some((x) => x.id === w.id));
    const merged = { ...ev, signals: [...ev.signals, ...carried] };
    const sos = buildSos({
      profile: st.profile,
      ev: merged,
      pings: st.pings,
      voice: st.flaggedVoice[st.flaggedVoice.length - 1],
      places: this.places,
    });
    const alert: Alert = {
      id: `alert-${++this.seq}`,
      incidentId: open?.incidentId ?? `incident-${++this.incSeq}`,
      childId: st.profile.id,
      tier: ev.tier,
      raisedAt: ev.now,
      status: "open",
      sos,
    };
    if (open) open.status = "resolved";
    st.openAlert = alert;
    st.lastRaisedAt = ev.now;
    this.alerts.push(alert);
    ev.newAlert = alert;
  }

  // Each rule adds a Signal; thresholds come from Thresholds.
  // ---- Rules -------------------------------------------------------------

  private rules(st: ChildState, s: Snapshot, now: number): Signal[] {
    const out: Signal[] = [];
    const th = this.th;
    const last = s.last;
    if (!last) return out;
    const inSafe = s.zoneNow?.kind === "safe";
    const mk = (id: Signal["id"], severity: Signal["severity"], title: string, detail: string): Signal => ({
      id,
      severity,
      title,
      detail,
      ts: now,
    });

    // Silence: no pings. Dampened inside a safe zone (phone off at school is normal).
    const age = s.lastPingAgeMin ?? 0;
    // A phone being off inside a safe zone (school) is normal, so silence is tolerated longer there.
    const warnAt = inSafe ? th.silenceWarnMin * 6 : th.silenceWarnMin;
    const critAt = inSafe ? th.silenceCriticalMin * 3 : th.silenceCriticalMin;
    if (age >= critAt) {
      out.push(mk("SILENCE", 6, "Band went silent", `No signal for ${Math.round(age)} min. Last seen ${inSafe ? "inside " + s.zoneNow!.name : "outside any safe zone"}.`));
    } else if (age >= warnAt) {
      out.push(mk("SILENCE", 3, "Signal lost", `No signal for ${Math.round(age)} min.`));
    }

    // Motion rules need a fresh fix to be meaningful.
    const fresh = age < th.silenceWarnMin;

    if (fresh) {
      const series = this.speedSeries(st.pings, now - 180_000);
      const cur = series[series.length - 1];

      // Walking -> vehicle within 3 minutes, away from an expected pick-up point.
      if (cur && cur.v >= th.vehicleSpeedMs) {
        const start = series.find((x) => x.v <= th.walkMaxMs);
        if (start) {
          const startPing = st.pings.find((p) => p.ts >= start.ts) ?? last;
          const expected = st.profile.zones.some((z) => z.kind === "safe" && z.allowPickup && zoneContains(z, startPing));
          if (!expected) {
            out.push(mk("MODE_SHIFT_VEHICLE", 6, "Walking to vehicle speed", `Speed jumped from walking to ${fmtMph(cur.v * 3.6)} mph within 3 min, away from a known pick-up point.`));
          }
        }
      }

      // Abrupt deceleration (proxy for fall, crash or discard; Bee has no accelerometer).
      for (let i = 1; i < series.length; i++) {
        const a = series[i - 1]!;
        const b = series[i]!;
        const decel = (a.v - b.v) / Math.max(0.5, b.dt);
        if (a.v >= 8 && b.v < 1 && b.dt <= 15 && decel >= th.abruptDecelMs2 && now - b.ts <= 3 * 60_000) {
          out.push(mk("ABRUPT_STOP", 3, "Sudden stop", `Speed fell from ${fmtMph(a.v * 3.6)} to ${fmtMph(b.v * 3.6)} mph in ${b.dt.toFixed(0)} s.`));
          break;
        }
      }
    }

    // Heart rate: only when a source supplies it; context-aware.
    if (last.hr !== undefined && now - last.ts < 5 * 60_000) {
      if (last.hr > th.hrHigh) {
        const exertion = s.speedMs > th.walkMaxMs && s.speedMs < th.vehicleSpeedMs;
        out.push(mk("HR_ABNORMAL", exertion ? 3 : 6, "High heart rate", `${last.hr} bpm (limit ${th.hrHigh})${exertion ? ", possibly exertion" : " while not running"}.`));
      } else if (last.hr < th.hrLow) {
        out.push(mk("HR_ABNORMAL", 6, "Very low heart rate", `${last.hr} bpm (limit ${th.hrLow}).`));
      }
    }

    // Attention zone (advisory; parent-defined or from public data).
    if (s.zoneNow?.kind === "attention") {
      out.push(mk("ATTENTION_ZONE", s.zoneNow.level === "high" ? 6 : 3, `In flagged area: ${s.zoneNow.name}`, s.zoneNow.reason ?? "Parent-flagged area."));
    }

    // Stationary for hours outside a safe zone.
    if (!inSafe) {
      const since = now - th.stationaryMin * 60_000;
      const win = st.pings.filter((p) => p.ts >= since);
      const first = win[0];
      const covers = win.length > 1 && !!first && first.ts <= since + 5 * 60_000;
      if (covers && win.every((p) => haversineM(p, last) <= th.stationaryRadiusM)) {
        out.push(mk("STATIONARY_LONG", 3, "Not moving for hours", `Within ${th.stationaryRadiusM} m for ${Math.round(th.stationaryMin / 60)}+ h, outside any safe zone.`));
      }
    }

    // Leaving a safe zone during quiet hours.
    const hour = localHour(now, st.profile.tzOffsetMin);
    if (!inSafe && inQuietHours(hour, st.profile.quietHours)) {
      const wasSafe = st.pings.slice(-30, -1).some((p) => st.profile.zones.some((z) => z.kind === "safe" && zoneContains(z, p)));
      if (wasSafe) out.push(mk("SAFE_ZONE_EXIT_QUIET_HOURS", 3, "Left a safe place at night", "Moved out of a safe zone during quiet hours."));
    }

    // "Keep watch": the guardian asked us to watch a place until a time. Leaving it early is worth a look, never a verdict.
    const watched = st.plans.find((p) => p.status === "confirmed" && p.watch);
    if (watched?.watch && fresh && now <= watched.watch.until) {
      const wz = st.profile.zones.find((z) => z.id === watched.watch!.zoneId);
      const outsideM = wz ? haversineM(wz, last) - wz.radiusM : 0;
      if (wz && outsideM > WATCH_MARGIN_M) {
        out.push(
          mk(
            "WATCH_BREACH",
            3,
            `Left ${wz.name} while you asked us to keep watch`,
            `You asked us to keep watch at ${wz.name} until ${fmtClock(watched.watch.until, st.profile.tzOffsetMin)}. ${st.profile.name} is about ${Math.round((outsideM * 3.28084) / 10) * 10} ft outside it. Last update ${Math.round(age)} min ago. This does not confirm anything is wrong.`,
          ),
        );
      }
    }

    // Expected check-in from a confirmed plan (explainable: says what is expected and what is unknown).
    const plan = st.plans.find((p) => p.status === "confirmed");
    if (plan) {
      const zone = st.profile.zones.find((z) => z.id === plan.expectedZoneId);
      const arrived = !!zone && zoneContains(zone, last);
      if (arrived && now >= plan.expectedAt - 90 * 60_000) {
        plan.status = "completed";
        plan.completedAt = now;
      } else if (now >= plan.expectedAt + plan.graceMin * 60_000) {
        const lateMin = Math.round((now - plan.expectedAt) / 60000);
        const tz = st.profile.tzOffsetMin;
        let lastPlace = "no known place";
        for (let i = st.pings.length - 1; i >= 0; i--) {
          const p = st.pings[i]!;
          const z = st.profile.zones.find((zz) => zz.kind === "safe" && zoneContains(zz, p));
          if (z) {
            lastPlace = `${z.name} at ${fmtClock(p.ts, tz)}`;
            break;
          }
        }
        const unavailable = age >= th.silenceWarnMin;
        out.push(
          mk(
            "LATE_ARRIVAL",
            lateMin >= 45 ? 6 : 3,
            "Expected check-in did not happen",
            `Expected at ${zone?.name ?? "the planned place"} by ${fmtClock(plan.expectedAt, tz)} (${plan.title}); ${lateMin} min overdue. Last confirmed place: ${lastPlace}. Last update ${Math.round(age)} min ago${unavailable ? ", location currently unavailable" : ""}. This does not confirm an emergency.`,
          ),
        );
      }
    }

    // Voice distress (opt-in), held for 10 minutes.
    const v = st.flaggedVoice[st.flaggedVoice.length - 1];
    if (v && now - v.ts <= VOICE_HOLD_MS) {
      out.push(mk("VOICE_DISTRESS", 6, "Distress phrase heard", `Band picked up: "${v.snippet}"`));
    }

    if (last.battery !== undefined && last.battery <= th.lowBatteryPct) {
      out.push(mk("BATTERY_LOW", 1, "Battery low", `${last.battery}% remaining.`));
    }
    return th.disabledRules.length ? out.filter((x) => !th.disabledRules.includes(x.id)) : out;
  }
}
