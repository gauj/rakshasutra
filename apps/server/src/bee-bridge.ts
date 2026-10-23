/**
 * The link to the guardian's Bee: listens to what they say and writes reminders back.
 * Bee supplies spoken notes and reminders only; the child's location never comes from here.
 */
import { createBeeClient, type BeeClient } from "@beeai/cli/lib";

/** Where the Bee connection stands, with a plain-language reason in BridgeStatus.detail. */
export type BridgeState = "off" | "starting" | "unauthenticated" | "live" | "error";

/** Current health of the Bee link, plus simple counters. Reported to the app so problems are visible. */
export interface BridgeStatus {
  state: BridgeState;
  detail: string;
  lastEventAt?: number;
  utterancesSeen: number;
  remindersWritten: number;
}

interface Options {
  /** Path to the `bee` binary; defaults to `bee` on PATH. */
  command?: string;
  logRaw?: boolean;
  /** Called for every utterance the guardian's Bee hears. Callers decide what is relevant. */
  onUtterance: (u: BeeUtterance) => void;
}

export interface BeeUtterance {
  text: string;
  id?: number | string;
  /** Epoch ms when it was spoken (Bee sends an ISO string in the stream, an integer in `bee now`). */
  spokenAt: number;
}

// Accepts epoch seconds, epoch milliseconds or an ISO string; anything unreadable falls back to now.
function toMs(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

/** Collect every utterance found under an `utterance`/`utterances` key, whatever the exact envelope is. */
export function extractUtterances(payload: unknown): BeeUtterance[] {
  const out: BeeUtterance[] = [];
  const walk = (v: unknown, underUtterance: boolean) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, underUtterance));
    const o = v as Record<string, unknown>;
    if (underUtterance && typeof o.text === "string" && o.text.trim()) {
      const id = typeof o.id === "number" || typeof o.id === "string" ? o.id : undefined;
      out.push({ text: o.text.trim(), id, spokenAt: toMs(o.spoken_at ?? o.spokenAt) });
    }
    for (const [k, val] of Object.entries(o)) walk(val, underUtterance || k === "utterance" || k === "utterances");
  };
  walk(payload, false);
  return out;
}

/**
 * The only place that talks to Bee. It uses the official `@beeai/cli` library, which drives
 * the `bee` CLI: `bee stream` for what the guardian says, and `bee todos create` to write a
 * reminder back once a plan is confirmed.
 */
export class BeeBridge {
  private client?: BeeClient;
  private stream?: { close: () => void };
  private stopped = false;
  status: BridgeStatus = { state: "off", detail: "Bee bridge not started", utterancesSeen: 0, remindersWritten: 0 };

  constructor(private o: Options) {}

  /** Check the CLI runs and is logged in, then start listening. Never throws: problems are reported in status. */
  async start(): Promise<void> {
    this.stopped = false;
    this.status = { ...this.status, state: "starting", detail: "Starting Bee CLI" };
    try {
      const command = this.o.command ?? "bee";
      this.client = createBeeClient({ command });
      // Tell "the CLI cannot run" apart from "not logged in": both make isAuthenticated() false.
      let runnable = false;
      try {
        runnable = (await this.client.run(["version"])).exitCode === 0;
      } catch {
        runnable = false;
      }
      if (!runnable) {
        this.status = { ...this.status, state: "error", detail: `Bee CLI not found or not runnable (${command}). Install it or set BEE_CLI_BINARY to the full path of bee.exe` };
        return;
      }
      const authed = await this.client.auth.isAuthenticated();
      if (!authed) {
        this.status = { ...this.status, state: "unauthenticated", detail: "Run `bee login` (enable Developer Mode in the Bee app first), then restart the server" };
        return;
      }
    } catch (e) {
      this.status = { ...this.status, state: "error", detail: `Bee CLI unavailable: ${(e as Error).message}` };
      return;
    }
    void this.consume();
  }

  // Reads the live stream for as long as the bridge runs, reconnecting with a growing delay (1 s up to 30 s).
  private async consume() {
    let backoff = 1000;
    while (!this.stopped && this.client) {
      try {
        const s = this.client.sse.streamJson({ types: ["new-utterance"] });
        this.stream = s;
        this.status = { ...this.status, state: "live", detail: "Listening to your Bee" };
        backoff = 1000;
        for await (const ev of s.events) {
          if (this.o.logRaw) console.log("[bee:raw]", ev.raw);
          const found = extractUtterances(ev.data);
          if (!found.length) continue;
          this.status.lastEventAt = Date.now();
          for (const u of found) {
            this.status.utterancesSeen++;
            this.o.onUtterance(u);
          }
        }
        await s.process.exited;
      } catch (e) {
        if (this.stopped) return;
        this.status = { ...this.status, state: "error", detail: `Stream error, retrying: ${(e as Error).message}` };
      }
      if (this.stopped) return;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }

  /** Write a reminder into the guardian's Bee todos (best effort). */
  async addReminder(text: string, alarmAt: Date): Promise<boolean> {
    if (!this.client || this.status.state !== "live") return false;
    try {
      await this.client.api.todos.create({ text, alarmAt: alarmAt.toISOString() });
      this.status.remindersWritten++;
      return true;
    } catch (e) {
      console.warn("[bee] could not write reminder:", (e as Error).message);
      return false;
    }
  }

  /** Stop listening and close the stream. */
  stop() {
    this.stopped = true;
    this.stream?.close();
  }
}
