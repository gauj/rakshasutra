/** Builds the alert payload (SosPayload): headline, where, why, what is unknown and what the parent can do. */
import { compass, destination, haversineM } from "./geo.js";
import {
  batteryDrain,
  buildEmergencyBrief,
  buildLongText,
  buildTimeline,
  buildUnknowns,
  describePlace,
  maxSpeedKmh,
  summarizeHr,
  totalDistanceKm,
} from "./sosdetail.js";
import { ChildProfile, Evaluation, Ping, Place, SosPayload } from "./types.js";

/** Source of nearby help places. Swappable so real data can replace the demo list. */
export interface PlacesProvider {
  nearest(at: { lat: number; lon: number }, limit: number): Place[];
}

/** Demo provider. Production swaps in Amazon Location Service SearchNearby. */
export class StaticPlaces implements PlacesProvider {
  constructor(private pois: Omit<Place, "distanceM">[]) {}
  nearest(at: { lat: number; lon: number }, limit: number): Place[] {
    return this.pois
      .map((p) => ({ ...p, distanceM: Math.round(haversineM(at, p)) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit);
  }
}

// Display-only. These numbers are shown to the parent; the app never dials or messages them.
const EMERGENCY: Record<ChildProfile["region"], { label: string; number: string }[]> = {
  US: [
    { label: "Emergency", number: "911" },
    { label: "NCMEC missing child hotline", number: "1-800-843-5678" },
  ],
  IN: [
    { label: "Emergency", number: "112" },
    { label: "CHILDLINE", number: "1098" },
  ],
};

// Inputs for buildSos.
interface Args {
  profile: ChildProfile;
  ev: Evaluation;
  pings: Ping[];
  voice?: { ts: number; snippet: string };
  places: PlacesProvider;
}

/** Assemble everything a parent or responder needs from one evaluation. Pure: no sending happens here. */
export function buildSos({ profile, ev, pings, voice, places }: Args): SosPayload {
  const { snapshot: s } = ev;
  const last = s.last;
  const speedKmh = Math.round(s.speedMs * 3.6 * 10) / 10;
  const trailFrom = ev.now - 3 * 3600_000;
  const trail3h = thin(
    pings.filter((p) => p.ts >= trailFrom),
    240,
  ).map((p, i, arr) => {
    const prev = arr[i - 1];
    const v = prev ? haversineM(prev, p) / Math.max(1, (p.ts - prev.ts) / 1000) : 0;
    return { ts: p.ts, lat: p.lat, lon: p.lon, speedKmh: Math.round(v * 3.6 * 10) / 10 };
  });

  const ageMin = s.lastPingAgeMin ?? 0;
  // Under 3 minutes counts as live, under 20 as stale, anything older as lost.
  const dataFreshness: SosPayload["dataFreshness"] = ageMin < 3 ? "live" : ageMin < 20 ? "stale" : "lost";

  // A 10-minute projection is offered only with a heading, real movement and data that is not lost.
  let predicted: SosPayload["predicted10Min"];
  if (last && s.headingDeg !== undefined && s.speedMs > 1 && dataFreshness !== "lost") {
    predicted = destination(last, s.headingDeg, s.speedMs * 600);
  }

  const tz = profile.tzOffsetMin;
  const hr = summarizeHr(pings, ev.now);
  const timeline3h = buildTimeline(pings, trailFrom, ev.now, profile);
  const locationContext = last ? describePlace(profile, last) : undefined;
  const lastMovePing = s.lastMovementTs ? pings.find((p) => p.ts === s.lastMovementTs) : undefined;
  const hrAge = last?.hr !== undefined ? ageMin : undefined;
  const nearestPlaces = last ? places.nearest(last, 3) : [];
  const emergencyNumbers = EMERGENCY[profile.region];
  const titles = [...ev.signals].sort((a, b) => b.severity - a.severity).map((x) => x.title);
  const top = titles.slice(0, 2).join(" + ") || "Alert";
  const more = titles.length > 2 ? ` (+${titles.length - 2} more)` : "";
  const headline = `${profile.name}: ${top}${more}`;

  const mapUrl = last ? `https://www.google.com/maps?q=${last.lat.toFixed(5)},${last.lon.toFixed(5)}` : undefined;
  const dir = s.headingDeg !== undefined ? compass(s.headingDeg) : undefined;
  const sms = [
    `RakshaSutra ${ev.tier.toUpperCase()}: ${headline}.`,
    last ? `Last seen ${Math.round(ageMin)} min ago at ${last.lat.toFixed(4)},${last.lon.toFixed(4)}.` : "",
    s.motion === "vehicle" || s.motion === "moving" || s.motion === "walking"
      ? `Moving ${speedKmh} km/h${dir ? " " + dir : ""}.`
      : `Not moving.`,
    last?.hr !== undefined ? `HR ${last.hr} bpm.` : "",
    mapUrl ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const actions = [
    "Try calling your child, then a trusted adult nearby.",
    `If you cannot reach them, call ${emergencyNumbers[0]!.number} now and share the live link.`,
  ];
  if (predicted) actions.push("Share the predicted route with responders; it extends the current heading for 10 minutes.");
  if (ev.signals.some((x) => x.id === "VOICE_DISTRESS")) actions.push("A distress phrase was heard. Treat this as urgent.");

  const contacts = profile.contacts;
  const base: Omit<SosPayload, "longText"> = {
    childId: profile.id,
    childName: profile.name,
    tier: ev.tier,
    raisedAt: ev.now,
    headline,
    why: ev.signals,
    position: last ? { lat: last.lat, lon: last.lon, accuracyM: last.accuracyM, ageMin: Math.round(ageMin * 10) / 10 } : undefined,
    speedKmh,
    motion: s.motion,
    headingDeg: s.headingDeg,
    compass: dir,
    predicted10Min: predicted,
    trail3h,
    lastMovement: s.lastMovementTs
      ? {
          ts: s.lastMovementTs,
          ageMin: Math.round((ev.now - s.lastMovementTs) / 60000),
          position: lastMovePing ? { lat: lastMovePing.lat, lon: lastMovePing.lon } : undefined,
          place: lastMovePing ? describePlace(profile, lastMovePing) : undefined,
        }
      : undefined,
    locationContext,
    timeline3h,
    distance3hKm: totalDistanceKm(pings, trailFrom, ev.now),
    maxSpeed15mKmh: maxSpeedKmh(pings, (last?.ts ?? ev.now) - 15 * 60_000, last?.ts ?? ev.now),
    hr,
    device: {
      battery: last?.battery,
      batteryDrainPctPerHour: batteryDrain(pings, ev.now),
      accuracyM: last?.accuracyM,
      source: last?.source,
      lastFixAgeMin: last ? Math.round(ageMin * 10) / 10 : undefined,
    },
    unknowns: buildUnknowns({ last, ageMin, hr, tz, signals: ev.signals }),
    child: { age: profile.age, description: profile.description, medical: profile.medical },
    contacts,
    emergencyBrief: buildEmergencyBrief({ profile, last, ageMin, speedKmh, compassDir: dir, motion: s.motion, context: locationContext, tz, contact: contacts[0] }),
    vitals: { hr: last?.hr, hrAgeMin: hrAge, battery: last?.battery },
    lastVoiceFlag: voice && ev.now - voice.ts <= 10 * 60_000 ? voice : undefined,
    nearestPlaces,
    emergencyNumbers,
    mapUrl,
    smsText: sms,
    recommendedActions: actions,
    dataFreshness,
  };
  return { ...base, longText: buildLongText(base, tz) };
}

/** Keep at most max evenly spaced items (plus the last) so the trail stays small enough to send. */
function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]!);
  out.push(arr[arr.length - 1]!);
  return out;
}
