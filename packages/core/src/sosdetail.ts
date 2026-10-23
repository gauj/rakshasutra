import { fmtMi, fmtMph } from "./units.js";
/** Text and summaries that fill an alert: place names, the recent timeline, heart-rate and battery trends, unknowns and messages. */
import { bearingDeg, compass, haversineM } from "./geo.js";
import { fmtClock } from "./schedule.js";
import { ChildProfile, DEFAULT_THRESHOLDS, HrSummary, Ping, SosPayload, TimelineSegment } from "./types.js";

type LatLon = { lat: number; lon: number };

/** Short distance for people, in US units: feet (to the nearest 50) under 1,000 ft, otherwise miles. */
export function fmtDist(m: number): string {
  const ft = m * 3.28084;
  if (ft < 1000) return `${Math.max(50, Math.round(ft / 50) * 50)} ft`;
  return `${(m / 1609.344).toFixed(1)} mi`;
}

/** "Inside Home" or "2.1 km E of Home": a place name a parent understands, not coordinates. */
export function describePlace(profile: ChildProfile, p: LatLon): string {
  const inside = profile.zones.find((z) => haversineM(z, p) <= z.radiusM);
  if (inside) return inside.name;
  let best: { name: string; d: number; z: LatLon } | undefined;
  for (const z of profile.zones) {
    const d = haversineM(z, p);
    if (!best || d < best.d) best = { name: z.name, d, z };
  }
  if (!best) return `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
  return `${fmtDist(best.d)} ${compass(bearingDeg(best.z, p))} of ${best.name}`;
}

// A timeline segment before merging and rounding.
interface Raw {
  from: number;
  to: number;
  kind: TimelineSegment["kind"];
  distanceM: number;
  start: LatLon;
  end: LatLon;
}

/** Condense recent pings into a short story: walked, stopped, in a vehicle, no signal. */
export function buildTimeline(pings: Ping[], from: number, to: number, profile: ChildProfile): TimelineSegment[] {
  const th = DEFAULT_THRESHOLDS;
  const win = pings.filter((p) => p.ts >= from && p.ts <= to);
  if (win.length < 2) return [];
  const raw: Raw[] = [];
  const push = (r: Raw) => {
    const prev = raw[raw.length - 1];
    if (prev && prev.kind === r.kind) {
      prev.to = r.to;
      prev.distanceM += r.distanceM;
      prev.end = r.end;
    } else raw.push({ ...r });
  };
  for (let i = 1; i < win.length; i++) {
    const a = win[i - 1]!;
    const b = win[i]!;
    const dt = (b.ts - a.ts) / 1000;
    if (dt <= 0) continue;
    // More than 10 minutes between pings counts as no signal rather than movement.
    if (dt > 600) {
      push({ from: a.ts, to: b.ts, kind: "no-signal", distanceM: 0, start: a, end: b });
      continue;
    }
    const d = haversineM(a, b);
    const noise = Math.max(5, (b.accuracyM ?? 10) * 0.5);
    const moved = d >= noise;
    const v = moved ? d / dt : 0;
    const kind: Raw["kind"] = v < 0.5 ? "still" : v <= th.walkMaxMs ? "walking" : v < th.vehicleSpeedMs ? "moving" : "vehicle";
    push({ from: a.ts, to: b.ts, kind, distanceM: moved ? d : 0, start: a, end: b });
  }
  const last = win[win.length - 1]!;
  if (to - last.ts > 600_000) push({ from: last.ts, to, kind: "no-signal", distanceM: 0, start: last, end: last });

  // Absorb blips shorter than 90 s into the previous segment so the story stays readable.
  const merged: Raw[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    const blip = r.to - r.from < 90_000 && r.kind !== "vehicle" && r.kind !== "no-signal";
    if (prev && blip) {
      prev.to = r.to;
      prev.distanceM += r.distanceM;
      prev.end = r.end;
    } else if (prev && prev.kind === r.kind) {
      prev.to = r.to;
      prev.distanceM += r.distanceM;
      prev.end = r.end;
    } else merged.push({ ...r });
  }
  // Keep only the 14 most recent segments.
  return merged.slice(-14).map((r) => {
    const secs = Math.max(1, (r.to - r.from) / 1000);
    return {
      from: r.from,
      to: r.to,
      kind: r.kind,
      distanceM: Math.round(r.distanceM),
      avgKmh: Math.round(((r.distanceM / secs) * 3.6) * 10) / 10,
      headingDeg: r.distanceM > 25 ? Math.round(bearingDeg(r.start, r.end)) : undefined,
      startPlace: describePlace(profile, r.start),
      endPlace: describePlace(profile, r.end),
    };
  });
}

/** One timeline segment as a plain sentence for the long alert text. */
export function describeSegment(s: TimelineSegment, tz: number): string {
  const span = `${fmtClock(s.from, tz)} to ${fmtClock(s.to, tz)}`;
  const dir = s.headingDeg !== undefined ? ` heading ${compass(s.headingDeg)}` : "";
  switch (s.kind) {
    case "still":
      return /^\d.* of /.test(s.endPlace) ? `${span}: stopped, ${s.endPlace}` : `${span}: stayed at ${s.endPlace}`;
    case "walking":
      return `${span}: walked ${fmtDist(s.distanceM)} (${fmtMph(s.avgKmh)} mph)${dir}, ${s.startPlace} to ${s.endPlace}`;
    case "moving":
      return `${span}: moved ${fmtDist(s.distanceM)} (${fmtMph(s.avgKmh)} mph, running or cycling pace)${dir}`;
    case "vehicle":
      return `${span}: travelled ${fmtDist(s.distanceM)} at vehicle speed (${fmtMph(s.avgKmh)} mph avg)${dir}, ${s.startPlace} to ${s.endPlace}`;
    case "no-signal":
      return `${span}: no signal (last seen ${s.startPlace})`;
  }
}

/** Heart-rate picture for the 30 minutes up to the last reading. The trend compares the first and second half (a 10 bpm difference). */
export function summarizeHr(pings: Ping[], now: number): HrSummary | undefined {
  // Anchor on the last reading, not on "now": after the band goes silent the useful picture is
  // the 30 minutes before it did.
  const withHr = pings.filter((p) => p.hr !== undefined && p.ts <= now);
  const anchor = withHr[withHr.length - 1]?.ts;
  if (anchor === undefined || now - anchor > 3 * 3600_000) return undefined;
  const pts = withHr.filter((p) => anchor - p.ts <= 30 * 60_000).map((p) => ({ ts: p.ts, hr: p.hr! }));
  if (!pts.length) return undefined;
  const vals = pts.map((p) => p.hr);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const half = Math.floor(pts.length / 2);
  let trend: HrSummary["trend"] = "steady";
  if (pts.length >= 4) {
    const a = pts.slice(0, half).reduce((s, p) => s + p.hr, 0) / half;
    const b = pts.slice(half).reduce((s, p) => s + p.hr, 0) / (pts.length - half);
    trend = b - a > 10 ? "rising" : a - b > 10 ? "falling" : "steady";
  }
  const step = Math.max(1, Math.floor(pts.length / 60));
  return {
    min: Math.min(...vals),
    max: Math.max(...vals),
    avg,
    latest: pts[pts.length - 1]!.hr,
    samples: pts.length,
    trend,
    series: pts.filter((_, i) => i % step === 0 || i === pts.length - 1),
  };
}

/** Battery percentage lost per hour over the last hour, or undefined if there is too little data (under 10 minutes apart). */
export function batteryDrain(pings: Ping[], now: number): number | undefined {
  const pts = pings.filter((p) => p.battery !== undefined && now - p.ts <= 60 * 60_000);
  if (pts.length < 2) return undefined;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const hours = (b.ts - a.ts) / 3600_000;
  if (hours < 10 / 60) return undefined;
  return Math.round(((a.battery! - b.battery!) / hours) * 10) / 10;
}

/** Fastest speed between consecutive pings in the window; gaps over 10 minutes and tiny moves are ignored. */
export function maxSpeedKmh(pings: Ping[], from: number, to: number): number {
  const w = pings.filter((p) => p.ts >= from && p.ts <= to);
  let m = 0;
  for (let i = 1; i < w.length; i++) {
    const dt = (w[i]!.ts - w[i - 1]!.ts) / 1000;
    const d = haversineM(w[i - 1]!, w[i]!);
    if (dt > 0 && dt < 600 && d > 5) m = Math.max(m, (d / dt) * 3.6);
  }
  return Math.round(m);
}

/** Distance travelled in the window, ignoring gaps over 10 minutes and moves under 5 m (GPS jitter). */
export function totalDistanceKm(pings: Ping[], from: number, to: number): number {
  const w = pings.filter((p) => p.ts >= from && p.ts <= to);
  let m = 0;
  for (let i = 1; i < w.length; i++) {
    const dt = (w[i]!.ts - w[i - 1]!.ts) / 1000;
    const d = haversineM(w[i - 1]!, w[i]!);
    if (dt > 0 && dt < 600 && d > 5) m += d;
  }
  return Math.round(m / 100) / 10;
}

/** What the alert cannot tell the parent, so missing data is never read as safety or danger. */
export function buildUnknowns(args: { last?: Ping; ageMin: number; hr?: HrSummary; tz: number; signals: SosPayload["why"] }): string[] {
  const { last, ageMin, hr, tz, signals } = args;
  const out: string[] = [];
  if (!last) {
    out.push("No location has been received yet.");
  } else if (ageMin >= 3) {
    out.push(`No location since ${fmtClock(last.ts, tz)}. The position shown is the last known one, not live.`);
  }
  if (last?.accuracyM !== undefined && last.accuracyM > 50) out.push(`Location accuracy is low (about ${Math.round(last.accuracyM)} m).`);
  if (!hr) out.push("No heart-rate reading is available.");
  if (last?.source === "sim") out.push("The location and heart rate come from a demo feed, not a real tracker.");
  if (signals.some((s) => s.id === "SILENCE" || s.id === "LATE_ARRIVAL")) {
    out.push("A missing signal can mean a dead battery, no coverage or a switched-off phone, not only danger.");
  }
  out.push("This alert is based on movement and signal patterns. It cannot confirm what is actually happening.");
  return out;
}

/** A short script the parent can read aloud to an emergency dispatcher. The app itself never makes the call. */
export function buildEmergencyBrief(p: {
  profile: ChildProfile;
  last?: Ping;
  ageMin: number;
  speedKmh: number;
  compassDir?: string;
  motion: string;
  context?: string;
  tz: number;
  contact?: { name: string; phone: string };
}): string {
  const { profile, last, ageMin, speedKmh, compassDir, motion, context, tz, contact } = p;
  const lines = [`I am reporting a child who may need help: ${profile.name}, age ${profile.age}.`];
  const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
  if (profile.description) lines.push(`Description: ${sentence(profile.description)}`);
  if (profile.medical) lines.push(`Medical: ${sentence(profile.medical)}`);
  if (last) {
    lines.push(`Last known location: ${last.lat.toFixed(5)}, ${last.lon.toFixed(5)}${last.accuracyM ? ` (accuracy about ${Math.round(last.accuracyM * 3.28084)} ft)` : ""}, ${context ?? ""}. Seen at ${fmtClock(last.ts, tz)}, ${Math.round(ageMin)} minutes ago.`);
    lines.push(motion === "still" || motion === "unknown" ? "The child was not moving at the last reading." : `The child was moving at ${fmtMph(speedKmh)} mph${compassDir ? ` heading ${compassDir}` : ""}.`);
  } else {
    lines.push("No location is available.");
  }
  lines.push("The child carries a location band. Alerts come from a safety app and may not be confirmed.");
  if (contact) lines.push(`Parent contact: ${contact.name}, ${contact.phone}.`);
  return lines.join(" ");
}

/** The full plain-text alert for push, email or Bee, in fixed sections from WHY to WHAT TO DO. */
export function buildLongText(s: Omit<SosPayload, "longText">, tz: number): string {
  const L: string[] = [];
  L.push(`${s.tier.toUpperCase()} ALERT: ${s.headline}`);
  L.push("");
  L.push("WHY");
  s.why.forEach((w) => L.push(`- ${w.title}. ${w.detail}`));
  L.push("");
  L.push("WHERE");
  if (s.position) {
    L.push(`- ${s.locationContext ?? ""}`.trimEnd());
    L.push(`- ${s.position.lat.toFixed(5)}, ${s.position.lon.toFixed(5)}${s.position.accuracyM ? ` (about ${Math.round(s.position.accuracyM)} m)` : ""}, last fix ${s.position.ageMin} min ago (${s.dataFreshness})`);
    if (s.mapUrl) L.push(`- Map: ${s.mapUrl}`);
  } else L.push("- No location available.");
  L.push("");
  L.push("MOVEMENT");
  L.push(s.motion === "still" || s.motion === "unknown" ? "- Not moving." : `- ${fmtMph(s.speedKmh)} mph${s.compass ? ` heading ${s.compass}` : ""}. Top speed in the 15 min up to the last fix: ${fmtMph(s.maxSpeed15mKmh)} mph.`);
  if (s.predicted10Min) L.push(`- If the same heading and speed continue, about ${s.predicted10Min.lat.toFixed(4)}, ${s.predicted10Min.lon.toFixed(4)} in 10 min.`);
  if (s.lastMovement) L.push(`- Last movement ${s.lastMovement.ageMin} min ago${s.lastMovement.place ? ` near ${s.lastMovement.place}` : ""}.`);
  if (s.hr) {
    L.push("");
    L.push("HEART RATE");
    L.push(`- Last reading ${s.hr.latest} bpm. In the 30 min before it: ${s.hr.min} to ${s.hr.max}, average ${s.hr.avg}, ${s.hr.trend}.`);
  }
  if (s.lastVoiceFlag) {
    L.push("");
    L.push(`HEARD: "${s.lastVoiceFlag.snippet}"`);
  }
  L.push("");
  L.push(`LAST 3 HOURS (${fmtMi(s.distance3hKm)} mi travelled)`);
  s.timeline3h.forEach((seg) => L.push(`- ${describeSegment(seg, tz)}`));
  L.push("");
  L.push("DEVICE");
  L.push(`- Battery ${s.device.battery ?? "unknown"}%${s.device.batteryDrainPctPerHour ? `, draining ${s.device.batteryDrainPctPerHour}% per hour` : ""}.`);
  if (s.nearestPlaces.length) {
    L.push("");
    L.push("NEAREST HELP");
    s.nearestPlaces.forEach((p) => L.push(`- ${p.name}, ${fmtDist(p.distanceM)}${p.phone ? `, ${p.phone}` : ""}`));
  }
  L.push("");
  L.push("WHAT WE DO NOT KNOW");
  s.unknowns.forEach((u) => L.push(`- ${u}`));
  L.push("");
  L.push("WHAT TO DO");
  s.recommendedActions.forEach((a) => L.push(`- ${a}`));
  L.push(`- Emergency: ${s.emergencyNumbers.map((e) => `${e.label} ${e.number}`).join("; ")}`);
  return L.join("\n");
}
