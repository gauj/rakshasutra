import type { Alert, DeliveryRecord, Ping, Plan, Signal, Tier, TimelineSegment, WellbeingReport, Zone } from "@rakshasutra/core";

const KEY = "rakshasutra.code";
/** The family code is kept only in this browser. The demo uses a built-in code; a real server asks for its own. */
export const getCode = (): string => {
  try {
    return localStorage.getItem(KEY) ?? "demo-parent";
  } catch {
    return "demo-parent";
  }
};
export const setCode = (c: string) => {
  try {
    localStorage.setItem(KEY, c.trim());
  } catch {
    /* private browsing: the code lasts until the page closes */
  }
};
export const clearCode = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
};

export class AuthError extends Error {}

export interface State {
  mode: "demo" | "real";
  device: { connected: boolean; lastAt: number | null; battery: number | null; count: number } | null;
  now: number;
  bee: { state: string; detail: string; scriptedNotes: boolean; utterancesSeen: number; remindersWritten: number };
  plans: Plan[];
  /** What the guardian just said about the child (only speech that is about him). */
  voice: { id: number; at: number; said: string; status: "listening" | "done"; kind?: "plan" | "question" | "note"; planId?: string; source: "bee" | "typed" } | null;
  deliveries: DeliveryRecord[];
  channels: { id: string; label: string; minTier: string }[];
  day: { from: number; timeline: TimelineSegment[] };
  run: { name: string; title: string; speed: number; progress: number } | null;
  child: { id: string; name: string; age: number; zones: Zone[]; tzOffsetMin: number; photo?: string; consent: { location: boolean; voice: boolean; heartRate: boolean } };
  tier: Tier;
  score: number;
  signals: Signal[];
  now_state: { last?: Ping; speedKmh: number; headingDeg?: number; motion: string; zone?: string; lastPingAgeMin?: number } | null;
  trail: Ping[];
  alerts: Alert[];
}

export type Report = WellbeingReport & { narrativeEngine: string };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "x-parent-token": getCode(), "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (r.status === 401 || r.status === 429) throw new AuthError(String(r.status));
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

/** 12-hour clock in the child's timezone, e.g. "5:30 PM". */
export function clock12(ts: number, tzOffsetMin: number): string {
  const d = new Date(ts + tzOffsetMin * 60000);
  const h = d.getUTCHours();
  return `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export type Mood = "calm" | "look" | "urgent";

export function moodOf(tier: Tier): Mood {
  return tier === "critical" ? "urgent" : tier === "warning" ? "look" : "calm";
}

export function agoText(min: number | undefined): string {
  if (min === undefined) return "";
  if (min < 1) return "just now";
  if (min < 90) return `${Math.round(min)} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

export type ClockTone = "calm" | "look" | "urgent";

/** How long until Aarav is expected home (or how late he is), in plain words. */
export function planClock(st: State): { text: string; tone: ClockTone } | undefined {
  const plan = st.plans.find((p) => p.status === "confirmed");
  if (!plan) return undefined;
  const fmt = (m: number) => (m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
  const diff = Math.round((plan.expectedAt - st.now) / 60000);
  if (diff > 0) return { text: `Home in ${fmt(diff)}`, tone: "calm" };
  const late = -diff;
  if (late < 1) return { text: "Due home now", tone: "calm" };
  return { text: `${fmt(late)} overdue`, tone: late >= plan.graceMin + 30 ? "urgent" : late >= plan.graceMin ? "look" : "calm" };
}
