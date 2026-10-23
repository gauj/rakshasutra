import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isEmergencyNumber, type ChildProfile, type EngineSnapshot, type SignalId, type Thresholds, type Zone } from "@rakshasutra/core";

/** Where the real family's data lives. It is git-ignored: profile, access codes and the saved day. */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : fileURLToPath(new URL("../../../data/", import.meta.url));
const FAMILY_FILE = path.join(DATA_DIR, "family.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

/**
 * Rules that cry wolf on a real child with a real iPhone, so they are off by default:
 * a school bus looks like "walking to vehicle speed", a friend's house looks like "not moving for hours",
 * GPS jitter looks like a "sudden stop", and an iPhone has no heart rate or Bee.
 */
export const REAL_DEFAULT_DISABLED: SignalId[] = ["MODE_SHIFT_VEHICLE", "ABRUPT_STOP", "STATIONARY_LONG", "HR_ABNORMAL", "VOICE_DISTRESS"];

export interface FamilyConfig {
  child: {
    id: string;
    name: string;
    nameAliases?: string[];
    age: number;
    region: "US" | "IN";
    tzOffsetMin: number;
    description?: string;
    medical?: string;
    /** A small square picture shown on the map. A data URL, kept only in this private file. */
    photo?: string;
    quietHours?: [number, number];
  };
  contacts: { name: string; phone: string }[];
  zones: Zone[];
  rules?: { disabled?: SignalId[] };
  thresholds?: Partial<Pick<Thresholds, "silenceWarnMin" | "silenceCriticalMin" | "lowBatteryPct" | "alertCooldownMin">>;
  notify?: { ntfyTopic?: string; ntfyIncludeName?: boolean; publicUrl?: string };
  secrets: { parentToken: string; ingestUser: string; ingestToken: string };
}

const str = (v: unknown, max: number, fallback = ""): string => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "place";
const token = () => randomBytes(18).toString("base64url");

function cleanZones(v: unknown): Zone[] {
  if (!Array.isArray(v)) return [];
  const used = new Set<string>();
  const out: Zone[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!raw || typeof raw !== "object") continue;
    const z = raw as Record<string, unknown>;
    const name = str(z.name, 60);
    const lat = z.lat;
    const lon = z.lon;
    if (!name || typeof lat !== "number" || typeof lon !== "number" || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    let id = slug(str(z.id, 40) || name);
    for (let i = 2; used.has(id); i++) id = `${slug(name)}-${i}`;
    used.add(id);
    const kind = z.kind === "attention" ? "attention" : "safe";
    const zone: Zone = { id, name, kind, lat, lon, radiusM: num(z.radiusM, 30, 2000, 120) };
    if (kind === "safe" && z.allowPickup === true) zone.allowPickup = true;
    if (kind === "attention") {
      zone.level = z.level === "high" ? "high" : "elevated";
      const reason = str(z.reason, 120);
      if (reason) zone.reason = reason;
    }
    out.push(zone);
  }
  return out;
}

function cleanContacts(v: unknown): { name: string; phone: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { name: string; phone: string }[] = [];
  for (const raw of v.slice(0, 5)) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const name = str(c.name, 40);
    const phone = str(c.phone, 24);
    if (!name || !phone) continue;
    if (isEmergencyNumber(phone)) throw new Error("Emergency numbers cannot be saved as family contacts. The app never contacts them.");
    out.push({ name, phone });
  }
  return out;
}

/** Only a small, plain image data URL is kept: nothing that could carry markup. */
const cleanPhoto = (v: unknown) => (typeof v === "string" && v.length <= 90_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : "");
const cleanTopic = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v.trim()) ? v.trim() : "");
const cleanUrl = (v: unknown) => {
  const s = str(v, 200).replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+$/i.test(s) ? s : "";
};

/** Check and tidy a family config, whether it came from disk or from the setup screen. */
export function validateFamily(x: unknown): FamilyConfig {
  if (!x || typeof x !== "object") throw new Error("Family settings must be an object.");
  const f = x as Record<string, any>;
  const c = (f.child ?? {}) as Record<string, any>;
  const name = str(c.name, 40);
  if (!name) throw new Error("The child needs a name.");
  const q = Array.isArray(c.quietHours) && c.quietHours.length === 2 ? ([Math.round(num(c.quietHours[0], 0, 23, 21)), Math.round(num(c.quietHours[1], 0, 23, 6))] as [number, number]) : ([21, 6] as [number, number]);
  const s = (f.secrets ?? {}) as Record<string, unknown>;
  if (typeof s.parentToken !== "string" || s.parentToken.length < 16 || typeof s.ingestToken !== "string" || s.ingestToken.length < 16 || typeof s.ingestUser !== "string" || !s.ingestUser) {
    throw new Error("Access codes are missing or too short. Run the setup command to create them.");
  }
  const disabled = Array.isArray(f.rules?.disabled) ? (f.rules.disabled.filter((r: unknown) => typeof r === "string") as SignalId[]) : undefined;
  const t = (f.thresholds ?? {}) as Record<string, unknown>;
  const n = (f.notify ?? {}) as Record<string, unknown>;
  return {
    child: {
      id: slug(str(c.id, 40) || name),
      name,
      nameAliases: Array.isArray(c.nameAliases) ? c.nameAliases.filter((a: unknown) => typeof a === "string" && a.trim()).map((a: string) => a.trim().slice(0, 30)).slice(0, 8) : [],
      age: Math.round(num(c.age, 4, 17, 12)),
      region: c.region === "IN" ? "IN" : "US",
      tzOffsetMin: Math.round(num(c.tzOffsetMin, -840, 840, -300)),
      description: str(c.description, 200),
      medical: str(c.medical, 200),
      photo: cleanPhoto(c.photo),
      quietHours: q,
    },
    contacts: cleanContacts(f.contacts),
    zones: cleanZones(f.zones),
    rules: { disabled: disabled ?? REAL_DEFAULT_DISABLED },
    thresholds: {
      silenceWarnMin: Math.round(num(t.silenceWarnMin, 10, 1440, 180)),
      silenceCriticalMin: Math.round(num(t.silenceCriticalMin, 30, 2880, 480)),
      lowBatteryPct: Math.round(num(t.lowBatteryPct, 3, 50, 10)),
      alertCooldownMin: Math.round(num(t.alertCooldownMin, 1, 240, 10)),
    },
    notify: { ntfyTopic: cleanTopic(n.ntfyTopic), ntfyIncludeName: n.ntfyIncludeName === true, publicUrl: cleanUrl(n.publicUrl) },
    secrets: { parentToken: s.parentToken, ingestUser: str(s.ingestUser, 40), ingestToken: s.ingestToken },
  };
}

export function profileFromFamily(f: FamilyConfig): ChildProfile {
  return {
    id: f.child.id,
    name: f.child.name,
    nameAliases: f.child.nameAliases,
    age: f.child.age,
    region: f.child.region,
    tzOffsetMin: f.child.tzOffsetMin,
    parentIds: ["parent"],
    // A phone gives location. It does not give heart rate, and the child does not wear a Bee.
    consent: { location: true, voice: false, heartRate: false },
    quietHours: f.child.quietHours ?? [21, 6],
    description: f.child.description,
    medical: f.child.medical,
    zones: f.zones,
    contacts: f.contacts,
  };
}

export function newFamily(name: string, age: number): FamilyConfig {
  return validateFamily({
    child: { name, age },
    contacts: [],
    zones: [],
    secrets: { parentToken: token(), ingestUser: slug(name).slice(0, 16), ingestToken: token() },
  });
}

function writePrivate(file: string, text: string) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* not supported on every filesystem */
  }
}

export function familyExists(): boolean {
  return existsSync(FAMILY_FILE);
}

export function loadFamily(): FamilyConfig | undefined {
  if (!existsSync(FAMILY_FILE)) return undefined;
  return validateFamily(JSON.parse(readFileSync(FAMILY_FILE, "utf8")));
}

export function saveFamily(f: FamilyConfig) {
  writePrivate(FAMILY_FILE, JSON.stringify(f, null, 2));
}

export function loadState(): EngineSnapshot | undefined {
  try {
    if (!existsSync(STATE_FILE)) return undefined;
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as EngineSnapshot;
  } catch (e) {
    console.warn("[state] could not read the saved day, starting fresh:", (e as Error).message);
    return undefined;
  }
}

export function saveState(s: EngineSnapshot) {
  writePrivate(STATE_FILE, JSON.stringify(s));
}
