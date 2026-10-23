import { Ping, Utterance } from "./types.js";

/**
 * Anything that can feed the engine: the Bee developer API, the simulator, or a phone.
 * Heart rate and motion are not part of Bee's documented API, so a second source
 * (or the simulator) must supply them.
 */
export interface SensorSource {
  start(onPing: (p: Ping) => void, onUtterance: (u: Utterance) => void): Promise<void>;
  stop(): void;
}

export interface BeeSourceOptions {
  childId: string;
  token: string;
  baseUrl?: string; // default: public Bee developer endpoint
  /** Log raw events so the field mapping can be verified against real payloads. */
  logRaw?: boolean;
  fetchImpl?: typeof fetch;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Map a Bee stream event to our types. Bee documents the event names
 * (`update-location`, `new-utterance`) but not the payload fields, so this
 * accepts the likely shapes. Verify with `logRaw` against a real device.
 */
export function mapBeeEvent(childId: string, type: string, data: any): { ping?: Ping; utterance?: Utterance } {
  const body = data?.data ?? data ?? {};
  if (type === "update-location" || type === "new-location") {
    const loc = body.location ?? body;
    const lat = num(loc.latitude) ?? num(loc.lat);
    const lon = num(loc.longitude) ?? num(loc.lng) ?? num(loc.lon);
    if (lat === undefined || lon === undefined) return {};
    const t = loc.timestamp ?? loc.ts ?? body.timestamp ?? Date.now();
    const ts = typeof t === "number" ? t : Date.parse(String(t));
    return { ping: { childId, ts: Number.isFinite(ts) ? ts : Date.now(), lat, lon, accuracyM: num(loc.accuracy), source: "bee" } };
  }
  if (type === "new-utterance") {
    const text = body.text ?? body.utterance?.text ?? body.transcript;
    if (typeof text !== "string" || !text) return {};
    const t = body.spoken_at ?? body.timestamp ?? Date.now();
    const ts = typeof t === "number" ? t : Date.parse(String(t));
    return { utterance: { childId, ts: Number.isFinite(ts) ? ts : Date.now(), text } };
  }
  return {};
}

/** Minimal Server-Sent-Events reader (no EventSource, so it can send a Bearer header). */
export class BeeSource implements SensorSource {
  private abort?: AbortController;
  constructor(private o: BeeSourceOptions) {}

  async start(onPing: (p: Ping) => void, onUtterance: (u: Utterance) => void): Promise<void> {
    const base = this.o.baseUrl ?? "https://api.developer.bee.amazon.dev";
    const f = this.o.fetchImpl ?? fetch;
    this.abort = new AbortController();
    let backoff = 1000;
    while (!this.abort.signal.aborted) {
      try {
        const res = await f(`${base}/v1/stream?types=update-location,new-utterance`, {
          headers: { Authorization: `Bearer ${this.o.token}`, Accept: "text/event-stream" },
          signal: this.abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Bee stream HTTP ${res.status}`);
        backoff = 1000;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            this.handle(frame, onPing, onUtterance);
          }
        }
      } catch (e) {
        if (this.abort.signal.aborted) return;
        console.warn("[bee] stream error, retrying:", (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }

  private handle(frame: string, onPing: (p: Ping) => void, onUtterance: (u: Utterance) => void) {
    let type = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let json: unknown;
    try {
      json = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    if (this.o.logRaw) console.log("[bee:raw]", type, JSON.stringify(json));
    const { ping, utterance } = mapBeeEvent(this.o.childId, type, json);
    if (ping) onPing(ping);
    if (utterance) onUtterance(utterance);
  }

  stop() {
    this.abort?.abort();
  }
}
