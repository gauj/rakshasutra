import { ChildProfile, Plan } from "./types.js";

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
};

/** Bee's speech-to-text sometimes spells out small numbers ("six") instead of digits. */
function normalizeSpokenNumbers(text: string): string {
  return text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (w) => NUMBER_WORDS[w.toLowerCase()]!);
}

const TIME = String.raw`(\d{1,2})(?:\s*:\s*(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?`;
const PICKUP = String.raw`(?:pick(?:ing)?(?:\s+(?:him|her|them))?\s*up|pick-?up|home by|back by|be back by|get(?:ting)?\s+(?:him|her|them)\s+(?:home|back)\s+by|collect(?:ing)?(?:\s+(?:him|her|them))?)`;

/** What may sit between "pick him up" and the time: "at", or a few words such as "from the school at". */
const GAP = String.raw`(?:(?:\s+[A-Za-z'\u2019]+){0,6}?\s+(?:at|by|around)\b|(?:\s+\w+)?)\s*`;

interface Clock {
  h: number;
  m: number;
  mer?: "am" | "pm";
}

function parseClock(h: string, m: string | undefined, mer: string | undefined): Clock | undefined {
  const hour = Number(h);
  if (!(hour >= 0 && hour <= 23)) return undefined;
  return { h: hour, m: m ? Number(m) : 0, mer: mer ? (mer.toLowerCase().startsWith("a") ? "am" : "pm") : undefined };
}

function to24(c: Clock, hint?: "am" | "pm"): number {
  const mer = c.mer ?? hint;
  if (c.h > 12 || mer === undefined && c.h === 0) return c.h;
  if (mer === "pm") return c.h === 12 ? 12 : c.h + 12;
  if (mer === "am") return c.h === 12 ? 0 : c.h;
  // No am/pm anywhere: school-day heuristic.
  if (c.h >= 8 && c.h <= 11) return c.h;
  if (c.h === 12) return 12;
  return c.h + 12;
}

function dayStart(ts: number, tzOffsetMin: number): number {
  const d = new Date(ts + tzOffsetMin * 60000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - tzOffsetMin * 60000;
}

export const fmtClock = (ts: number, tzOffsetMin: number) => {
  const d = new Date(ts + tzOffsetMin * 60000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/**
 * Repair what speech-to-text does to times. Real Bee transcripts split "5:30" into
 * "...at 5." and "30.from his school", so a bare hour after at/by/around followed by
 * two-digit minutes is rejoined as H:MM.
 */
export function normalizeSpeech(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b([ap])\.\s?m\b\.?/gi, "$1m") // "5 p. m." -> "5 pm"
    .replace(
      /\b(at|by|around)\s+(\d{1,2})\s*[.,]\s*([0-5]\d)\b(?!\s*(?:min|hour|hr|kid|people|student|am\b|pm\b|a\.m|p\.m))/gi,
      "$1 $2:$3",
    )
    .trim();
}

const SCHEDULE_WORDS = /\b(pick(ing)?\s+(\w+\s+)?up|pick-?up|practice|class|lesson|rehearsal|training|game|home by|back by|running (late|behind)|runs? late|dropped? off|collect)\b/i;

function mentionsName(t: string, profile: ChildProfile): boolean {
  const names = [profile.name, ...(profile.nameAliases ?? [])].join("|");
  return new RegExp(String.raw`\b(?:${names})\b`, "i").test(t);
}

/**
 * Is this speech about the child at all? Used to decide whether the app may show it.
 * A guardian's Bee hears everything nearby, so anything that is not about the child
 * (his name, a pick-up or schedule) must never reach the screen.
 */
export function isRelevantNote(text: string, profile: ChildProfile): boolean {
  const t = normalizeSpeech(normalizeSpokenNumbers(text));
  return mentionsName(t, profile) || SCHEDULE_WORDS.test(t);
}

/** "Where is Aarav?", "Is he okay?", "How is Aarav doing?" */
export function isQuestionAboutChild(text: string, profile: ChildProfile): boolean {
  const t = normalizeSpeech(normalizeSpokenNumbers(text));
  if (/\bwhere('?s| is| are)\s+(he|she|they)\b/i.test(t)) return true;
  const asks = /\?|^\s*(where|how|what|when|is|has|did|does|any)\b/i.test(t);
  return asks && mentionsName(t, profile);
}

export interface ParseContext {
  profile: ChildProfile;
  ts: number; // when the note was spoken
  /** The plan currently in force, used to interpret "running late" shifts. */
  current?: Plan;
}

/**
 * Turn a guardian's spoken note into a proposed plan. Deterministic and offline, so the demo
 * does not depend on an LLM. Notes that are not about the child's schedule return undefined.
 */
export function parseScheduleNote(text: string, ctx: ParseContext): Omit<Plan, "id" | "status" | "source"> | undefined {
  const { profile, ts, current } = ctx;
  // Words to digits first ("six" -> 6), then rejoin times the speech-to-text split ("5." + "30" -> 5:30).
  const t = normalizeSpeech(normalizeSpokenNumbers(text));
  const mentionsChild = mentionsName(t, profile);
  const scheduleWords = SCHEDULE_WORDS.test(t);
  if (!mentionsChild && !scheduleWords) return undefined;

  const day0 = dayStart(ts, profile.tzOffsetMin);
  const at = (c: Clock, hint?: "am" | "pm") => day0 + to24(c, hint) * 3600_000 + c.m * 60_000;

  // "pick him up at 6 instead of 5"
  const instead = new RegExp(String.raw`${PICKUP}${GAP}${TIME}\s+instead of\s+${TIME}`, "i").exec(t) ??
    new RegExp(String.raw`${TIME}\s+instead of\s+${TIME}`, "i").exec(t);
  let expectedAt: number | undefined;
  let previous: number | undefined;
  let reason = "";
  if (instead) {
    const g = instead.slice(1);
    const nw = parseClock(g[0]!, g[1], g[2]);
    const old = parseClock(g[3]!, g[4], g[5]);
    if (nw) {
      const hint = nw.mer ?? old?.mer;
      expectedAt = at(nw, hint);
      if (old) previous = at(old, old.mer ?? nw.mer);
      reason = "time changed";
    }
  }
  if (expectedAt === undefined) {
    const m = new RegExp(String.raw`${PICKUP}${GAP}${TIME}`, "i").exec(t);
    if (m) {
      const c = parseClock(m[1]!, m[2], m[3]);
      if (c) expectedAt = at(c);
    }
  }
  // "practice is running 30 minutes late" / "running late": shift the current plan.
  if (expectedAt === undefined && current && /\b(running (late|behind)|runs? late|delayed|\d+\s*min(ute)?s? late)\b/i.test(t)) {
    const mins = Number(/(\d+)\s*min(?:ute)?s?\s*(?:late|behind)/i.exec(t)?.[1] ?? 30);
    expectedAt = current.expectedAt + mins * 60_000;
    previous = current.expectedAt;
    reason = `shifted ${mins} min because "running late" gave no new time`;
  }
  if (expectedAt === undefined) return undefined;

  const kind = /practice|lesson|class|training|game|rehearsal/i.exec(t)?.[0];
  const title = /robotics/i.test(t) ? "Robotics practice" : /school/i.test(t) ? "School" : kind ? kind[0]!.toUpperCase() + kind.slice(1).toLowerCase() : "Pick-up";
  const home = profile.zones.find((z) => z.id === (profile.homeZoneId ?? "home"));
  const interpretation =
    `Expected back at ${home?.name ?? "home"} by ${fmtClock(expectedAt, profile.tzOffsetMin)}` +
    (previous ? ` (was ${fmtClock(previous, profile.tzOffsetMin)}${reason ? "; " + reason : ""})` : "") +
    `. No late-arrival alert until 15 min after that.`;
  return {
    childId: profile.id,
    title,
    expectedZoneId: home?.id ?? "home",
    expectedAt,
    graceMin: 15,
    sourceText: t,
    sourceTs: ts,
    previousExpectedAt: previous,
    interpretation,
    confidence: instead || previous === undefined ? (mentionsChild ? 0.9 : 0.75) : 0.6,
  };
}
