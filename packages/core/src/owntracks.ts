/**
 * OwnTracks (the iPhone app that reports the child's location) support: turning its messages into pings,
 * and building the one-tap setup link. Nothing here comes from the Bee wearable.
 */
import { Ping } from "./types.js";

const MAX_FUTURE_MS = 10 * 60_000; // a clock that is a little ahead is fine; a wild one is not
const MAX_AGE_MS = 48 * 3600_000; // queued reports can arrive late, but not days late

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strList = (v: unknown, max = 16): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 80).slice(0, max) : undefined;

/**
 * Turn one OwnTracks HTTP message into a Ping. Only `location` messages are used; everything else
 * (transitions, cards, waypoints) is ignored, because region events also arrive as locations.
 * The input comes from the internet, so every field is validated and unknown fields are dropped.
 */
export function ownTracksToPing(msg: unknown, childId: string, now = Date.now()): Ping | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const m = msg as Record<string, unknown>;
  if (m._type !== "location") return undefined;

  const lat = num(m.lat);
  const lon = num(m.lon);
  const tst = num(m.tst);
  if (lat === undefined || lon === undefined || tst === undefined) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  const ts = Math.round(tst * 1000);
  if (ts > now + MAX_FUTURE_MS || ts < now - MAX_AGE_MS) return undefined;

  const ping: Ping = { childId, ts, lat, lon, source: "phone" };
  const acc = num(m.acc);
  if (acc !== undefined && acc >= 0 && acc < 100_000) ping.accuracyM = acc;
  const batt = num(m.batt);
  if (batt !== undefined && batt >= 0 && batt <= 100) ping.battery = Math.round(batt);
  const vel = num(m.vel);
  if (vel !== undefined && vel >= 0 && vel <= 400) ping.speedKmh = vel;
  const cog = num(m.cog);
  if (cog !== undefined && cog >= 0 && cog <= 360) ping.headingDeg = cog % 360;
  const regions = strList(m.inregions);
  if (regions) ping.regions = regions;
  const activity = strList(m.motionactivities, 6);
  if (activity?.length) ping.activity = activity;
  if (typeof m.t === "string" && m.t.length <= 2) ping.trigger = m.t;
  return ping;
}

/** What the one-tap OwnTracks setup link needs to know. */
export interface OwnTracksConfigInput {
  /** Public HTTPS address of this server, without a trailing slash. */
  baseUrl: string;
  username: string;
  password: string;
  /** Two letters shown in the app. */
  tid: string;
  /** Places the phone should watch for arrivals and departures. */
  places: { name: string; lat: number; lon: number; radiusM: number }[];
  /** 1 = significant changes (low battery), 2 = move (precise, heavy on battery). */
  monitoring?: 1 | 2;
}

/**
 * The link that sets OwnTracks up in one tap: owntracks:///config?inline=<base64 of the settings>.
 * HTTP mode, the places as regions, low-battery monitoring, and nothing that lets anyone else command the phone.
 */
export function ownTracksConfigLink(c: OwnTracksConfigInput): string {
  const now = Math.floor(Date.now() / 1000);
  // Settings are deliberately conservative: no remote commands, no remote location requests, no retained messages,
  // and a report every 100 m or 5 minutes.
  const config = {
    _type: "configuration",
    mode: 3,
    url: `${c.baseUrl}/ingest/owntracks`,
    auth: true,
    username: c.username,
    password: c.password,
    tid: c.tid.slice(0, 2).toUpperCase(),
    monitoring: c.monitoring ?? 1,
    locatorDisplacement: 100,
    locatorInterval: 300,
    ranging: false,
    cmd: false,
    allowRemoteLocation: false,
    pubRetain: false,
    // Places become regions on the phone, never smaller than 50 m.
    waypoints: c.places.map((p) => ({ _type: "waypoint", desc: p.name, lat: p.lat, lon: p.lon, rad: Math.max(50, Math.round(p.radiusM)), tst: now })),
  };
  return `owntracks:///config?inline=${Buffer.from(JSON.stringify(config), "utf8").toString("base64")}`;
}
