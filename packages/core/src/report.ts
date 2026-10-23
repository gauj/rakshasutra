import { fmtMi, fmtMph } from "./units.js";
/** Summarises a time window (distance, stays, alerts, coverage) and writes a plain-language narrative of it. */
import { haversineM } from "./geo.js";
import { Alert, ChildProfile, Ping } from "./types.js";

/** A stop of at least 10 minutes within about 100 m. */
export interface Stay {
  from: number;
  to: number;
  minutes: number;
  lat: number;
  lon: number;
  place: string;
}

/** All alerts of one emergency folded into a single line item. */
export interface Incident {
  id: string;
  firstRaisedAt: number;
  peakTier: string;
  updates: number;
  signals: string[];
  status: string;
}

/** The summary for a window. coveragePct says how much of it had location data, so gaps are visible. */
export interface WellbeingReport {
  childId: string;
  childName: string;
  from: number;
  to: number;
  distanceKm: number;
  maxSpeedKmh: number;
  stays: Stay[];
  hr?: { min: number; max: number; avg: number; samples: number };
  alerts: { id: string; tier: string; raisedAt: number; headline: string; status: string }[];
  incidents: Incident[];
  coveragePct: number;
  wellbeing: "all-clear" | "attention" | "concern";
  headline: string;
  narrative: string;
}

/** Name of the zone containing the point, or a neutral phrase; coordinates are never shown here. */
function placeName(profile: ChildProfile, p: { lat: number; lon: number }): string {
  const z = profile.zones.find((zz) => haversineM(zz, p) <= zz.radiusM);
  return z ? z.name : "an unmarked place";
}

/** Build the report for [from, to]. False alarms do not count towards the wellbeing verdict. */
export function buildReport(profile: ChildProfile, pings: Ping[], alerts: Alert[], from: number, to: number): WellbeingReport {
  const win = pings.filter((p) => p.ts >= from && p.ts <= to);
  // Gaps over 10 minutes and moves under 5 m are ignored so GPS jitter and missing data do not inflate distance or speed.
  let dist = 0;
  let maxV = 0;
  for (let i = 1; i < win.length; i++) {
    const a = win[i - 1]!;
    const b = win[i]!;
    const d = haversineM(a, b);
    const dt = (b.ts - a.ts) / 1000;
    if (d > 5 && dt > 0 && dt < 600) {
      dist += d;
      maxV = Math.max(maxV, d / dt);
    }
  }

  // Stay detection: consecutive pings within 100 m, lasting at least 10 minutes.
  const stays: Stay[] = [];
  let i = 0;
  while (i < win.length) {
    let j = i;
    while (j + 1 < win.length && haversineM(win[i]!, win[j + 1]!) <= 100) j++;
    const a = win[i]!;
    const b = win[j]!;
    if (b.ts - a.ts >= 10 * 60_000) {
      stays.push({ from: a.ts, to: b.ts, minutes: Math.round((b.ts - a.ts) / 60000), lat: a.lat, lon: a.lon, place: placeName(profile, a) });
    }
    i = j + 1;
  }

  const hrs = win.map((p) => p.hr).filter((h): h is number => h !== undefined);
  const hr = hrs.length
    ? { min: Math.min(...hrs), max: Math.max(...hrs), avg: Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length), samples: hrs.length }
    : undefined;

  const spanMin = Math.max(1, (to - from) / 60000);
  const minutesWithData = new Set(win.map((p) => Math.floor(p.ts / 60000))).size;
  // Coverage counts distinct minutes that have at least one ping.
  const coveragePct = Math.min(100, Math.round((minutesWithData / spanMin) * 100));

  const inRange = alerts.filter((a) => a.childId === profile.id && a.raisedAt >= from && a.raisedAt <= to);
  const real = inRange.filter((a) => a.status !== "false-alarm");
  const wellbeing = real.some((a) => a.tier === "critical") ? "concern" : real.length ? "attention" : "all-clear";

  const rank: Record<string, number> = { watch: 1, warning: 2, critical: 3 };
  const byInc = new Map<string, Alert[]>();
  for (const a of inRange) byInc.set(a.incidentId, [...(byInc.get(a.incidentId) ?? []), a]);
  const incidents: Incident[] = [...byInc.entries()].map(([id, list]) => {
    const latest = list[list.length - 1]!;
    return {
      id,
      firstRaisedAt: list[0]!.raisedAt,
      peakTier: list.reduce((p, a) => (rank[a.tier]! > rank[p]! ? a.tier : p), list[0]!.tier),
      updates: list.length,
      signals: [...new Set(list.flatMap((a) => a.sos.why.map((w) => w.title)))],
      status: latest.status,
    };
  });

  const base = {
    childId: profile.id,
    childName: profile.name,
    from,
    to,
    distanceKm: Math.round(dist / 100) / 10,
    maxSpeedKmh: Math.round(maxV * 3.6),
    stays,
    hr,
    alerts: inRange.map((a) => ({ id: a.id, tier: a.tier, raisedAt: a.raisedAt, headline: a.sos.headline, status: a.status })),
    incidents,
    coveragePct,
    wellbeing,
  } as const;
  const headline =
    wellbeing === "all-clear"
      ? `${profile.name} had a normal period`
      : wellbeing === "attention"
        ? `${profile.name}: something needed your attention`
        : `${profile.name}: critical alert in this period`;
  return { ...base, headline, narrative: templateNarrative(base) };
}

const fmtT = (ts: number, tz: number) => new Date(ts + tz * 60000).toISOString().slice(11, 16);

/** Deterministic narrative. The server upgrades it with Amazon Bedrock when configured. */
export function templateNarrative(r: Omit<WellbeingReport, "headline" | "narrative">, tzOffsetMin = 0): string {
  const parts: string[] = [];
  parts.push(`Between ${fmtT(r.from, tzOffsetMin)} and ${fmtT(r.to, tzOffsetMin)}, ${r.childName} travelled about ${fmtMi(r.distanceKm)} mi (top speed ${fmtMph(r.maxSpeedKmh)} mph).`);
  if (r.stays.length) {
    parts.push("Time spent: " + r.stays.map((s) => `${s.place} for ${s.minutes} min (${fmtT(s.from, tzOffsetMin)})`).join("; ") + ".");
  }
  if (r.hr) parts.push(`Heart rate averaged ${r.hr.avg} bpm (range ${r.hr.min}-${r.hr.max}).`);
  if (r.incidents.length) {
    parts.push(
      r.incidents
        .map(
          (i) =>
            `${i.peakTier === "critical" ? "Critical" : "Warning"} incident at ${fmtT(i.firstRaisedAt, tzOffsetMin)} (${i.signals.slice(0, 4).join(", ")}${i.signals.length > 4 ? ", and more" : ""}); ${i.updates} update(s); ${i.status === "open" ? "still open" : i.status}.`,
        )
        .join(" "),
    );
  } else {
    parts.push("No alerts were raised.");
  }
  parts.push(`Signal coverage was ${r.coveragePct}%; gaps lower our confidence in this summary.`);
  return parts.join(" ");
}
