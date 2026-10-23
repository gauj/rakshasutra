/**
 * Shared data shapes: pings, zones, the child's profile, thresholds, signals, plans and the alert payload.
 * Times are epoch milliseconds unless a name says otherwise.
 */
/** How serious the situation is, from the sum of signal severities (see GuardianEngine). */
export type Tier = "safe" | "watch" | "warning" | "critical";
export type Severity = 1 | 3 | 6; // watch | warning | critical weights

/** One location report. Comes from an iPhone (OwnTracks, source "phone") or the simulator ("sim"), not from Bee. */
export interface Ping {
  childId: string;
  ts: number; // epoch ms
  lat: number;
  lon: number;
  accuracyM?: number;
  hr?: number; // bpm; only when a heart-rate source is attached (Bee does not document one)
  /** Speed and heading as reported by the phone itself, when it reports them. */
  speedKmh?: number;
  headingDeg?: number;
  /** Names of the places the phone says it is inside (iOS region monitoring). More reliable than GPS near an edge. */
  regions?: string[];
  /** iOS motion state, e.g. "walking", "automotive", "stationary". */
  activity?: string[];
  /** What triggered the report: a region event, a timer, a manual refresh. */
  trigger?: string;
  battery?: number; // 0-100
  source: "bee" | "sim" | "phone";
}

/** A piece of speech, used only for the opt-in distress-phrase check. */
export interface Utterance {
  childId: string;
  ts: number;
  text: string;
}

/** A named circle on the map: a safe place (home, school) or an area the parent wants flagged. */
export interface Zone {
  id: string;
  name: string;
  kind: "safe" | "attention";
  lat: number;
  lon: number;
  radiusM: number;
  /** attention zones: why it is flagged. Advisory only. */
  reason?: string;
  level?: "elevated" | "high";
  /** safe zones: a vehicle pick-up here is expected (school gate, home). */
  allowPickup?: boolean;
}

/** Everything the engine needs to know about one child. Consent flags gate what is stored and used. */
export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  region: "US" | "IN";
  tzOffsetMin: number; // minutes east of UTC
  parentIds: string[];
  consent: { location: boolean; voice: boolean; heartRate: boolean };
  quietHours: [number, number]; // local hours, e.g. [22, 5]
  /** For responders: appearance and clothing. Optional. */
  description?: string;
  /** For responders: allergies, conditions, medication. Optional. */
  medical?: string;
  /** Spellings speech-to-text may produce for the name, e.g. "Arab" for "Aarav". */
  nameAliases?: string[];
  homeZoneId?: string;
  zones: Zone[];
  contacts: { name: string; phone: string }[];
}

/** Tunable limits for the rules. A Min suffix means minutes, Ms metres per second (Ms2 per second squared), M metres, Pct percent. */
export interface Thresholds {
  hrHigh: number;
  hrLow: number;
  stationaryMin: number; // minutes
  stationaryRadiusM: number;
  silenceWarnMin: number;
  silenceCriticalMin: number;
  vehicleSpeedMs: number;
  walkMaxMs: number;
  abruptDecelMs2: number;
  lowBatteryPct: number;
  alertCooldownMin: number;
  /** Rules to switch off entirely, for feeds where they would raise false alarms. */
  disabledRules: SignalId[];
}

/** Defaults used by the demo; real mode can override them from the family file. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  hrHigh: 180,
  hrLow: 30,
  stationaryMin: 180,
  stationaryRadiusM: 75,
  silenceWarnMin: 10,
  silenceCriticalMin: 30,
  vehicleSpeedMs: 6,
  walkMaxMs: 2.2,
  abruptDecelMs2: 5,
  lowBatteryPct: 10,
  alertCooldownMin: 10,
  disabledRules: [],
};

/** The rules that can fire. Each one maps to a Signal with a severity of 1, 3 or 6. */
export type SignalId =
  | "STATIONARY_LONG"
  | "SILENCE"
  | "ABRUPT_STOP"
  | "MODE_SHIFT_VEHICLE"
  | "HR_ABNORMAL"
  | "ATTENTION_ZONE"
  | "SAFE_ZONE_EXIT_QUIET_HOURS"
  | "VOICE_DISTRESS"
  | "BATTERY_LOW"
  | "LATE_ARRIVAL";

/** One reason for concern, with a plain-language title and detail the parent can read. */
export interface Signal {
  id: SignalId;
  severity: Severity;
  title: string;
  detail: string;
  ts: number;
}

/** Coarse movement class derived from speed (see Thresholds.walkMaxMs and vehicleSpeedMs). */
export type Motion = "unknown" | "still" | "walking" | "moving" | "vehicle";

/** The engine's current view of a child: latest ping, speed, motion class and the zone they are in. */
export interface Snapshot {
  childId: string;
  now: number;
  last?: Ping;
  lastPingAgeMin?: number;
  speedMs: number;
  headingDeg?: number;
  motion: Motion;
  zoneNow?: Zone;
  lastMovementTs?: number;
}

/** Result of judging a child at one moment. newAlert is set only when this evaluation raised an alert. */
export interface Evaluation {
  childId: string;
  now: number;
  tier: Tier;
  score: number;
  signals: Signal[];
  snapshot: Snapshot;
  newAlert?: Alert;
}

/** "Child should be at <zone> by <time>", usually derived from a guardian's Bee note. */
export interface Plan {
  id: string;
  childId: string;
  title: string;
  expectedZoneId: string;
  expectedAt: number;
  graceMin: number;
  status: "proposed" | "confirmed" | "superseded" | "rejected" | "completed";
  source: "bee" | "typed";
  sourceText: string;
  sourceTs: number;
  previousExpectedAt?: number;
  /** Plain-language reading of the note, shown to the guardian for confirmation. */
  interpretation: string;
  confidence: number;
}

/** A nearby place that could help (police, hospital and so on). Shown for information only; nobody is contacted. */
export interface Place {
  name: string;
  kind: "police" | "hospital" | "fire" | "school" | "open-24h";
  lat: number;
  lon: number;
  distanceM: number;
  phone?: string;
}

/** One stretch of the recent story, such as "walked 400 m" or "no signal". */
export interface TimelineSegment {
  from: number;
  to: number;
  kind: "still" | "walking" | "moving" | "vehicle" | "no-signal";
  distanceM: number;
  avgKmh: number;
  headingDeg?: number;
  startPlace: string;
  endPlace: string;
}

/** Heart-rate summary, present only when a heart-rate source and the child's consent exist. */
export interface HrSummary {
  min: number;
  max: number;
  avg: number;
  latest: number;
  samples: number;
  trend: "rising" | "falling" | "steady";
  series: { ts: number; hr: number }[];
}

/**
 * Everything shown or sent when an alert is raised. emergencyNumbers are for display only:
 * the app never dials or messages them; the parent decides.
 */
export interface SosPayload {
  childId: string;
  childName: string;
  tier: Tier;
  raisedAt: number;
  headline: string;
  why: Signal[];
  position?: { lat: number; lon: number; accuracyM?: number; ageMin: number };
  speedKmh: number;
  motion: Motion;
  headingDeg?: number;
  compass?: string;
  predicted10Min?: { lat: number; lon: number };
  trail3h: { ts: number; lat: number; lon: number; speedKmh: number }[];
  lastMovement?: { ts: number; ageMin: number; position?: { lat: number; lon: number }; place?: string };
  /** Plain-language "where": inside a known place, or distance and direction from the nearest one. */
  locationContext?: string;
  timeline3h: TimelineSegment[];
  distance3hKm: number;
  maxSpeed15mKmh: number;
  hr?: HrSummary;
  device: { battery?: number; batteryDrainPctPerHour?: number; accuracyM?: number; source?: string; lastFixAgeMin?: number };
  /** What the alert cannot tell the parent. Shown so missing data is never read as safety or danger. */
  unknowns: string[];
  child: { age: number; description?: string; medical?: string };
  contacts: { name: string; phone: string }[];
  /** Short script a parent can read to an emergency dispatcher. */
  emergencyBrief: string;
  /** Full-detail message body for push, email or Bee. */
  longText: string;
  vitals: { hr?: number; hrAgeMin?: number; battery?: number };
  lastVoiceFlag?: { ts: number; snippet: string };
  nearestPlaces: Place[];
  emergencyNumbers: { label: string; number: string }[];
  mapUrl?: string;
  smsText: string;
  recommendedActions: string[];
  dataFreshness: "live" | "stale" | "lost";
}

/** A raised alert. Follow-ups for the same emergency are separate alerts sharing an incidentId. */
export interface Alert {
  id: string;
  /** Follow-ups of the same emergency share an incident. */
  incidentId: string;
  childId: string;
  tier: Tier;
  raisedAt: number;
  status: "open" | "acknowledged" | "false-alarm" | "resolved";
  sos: SosPayload;
}
