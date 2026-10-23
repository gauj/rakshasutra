import { createHash, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";

/** Compare secrets without leaking, through timing, how much of a guess was right. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The real client address. A tunnel (cloudflared) connects from this same computer and passes the visitor's address
 * in a header; anyone else could forge that header, so it is only believed when the connection itself is local.
 */
export function clientIp(c: Context): string {
  const socket = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress ?? "";
  const viaLocalProxy = socket === "127.0.0.1" || socket === "::1" || socket === "::ffff:127.0.0.1";
  if (viaLocalProxy) return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return socket || "local";
}

/** Slows down guessing: after too many failures from one address in a minute, it is blocked for the rest of the minute. */
export class FailureLimiter {
  private hits = new Map<string, { n: number; resetAt: number }>();
  constructor(
    private max = 10,
    private windowMs = 60_000,
  ) {}

  blocked(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h) return false;
    if (h.resetAt <= now) {
      this.hits.delete(key);
      return false;
    }
    return h.n >= this.max;
  }

  hit(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) this.hits.set(key, { n: 1, resetAt: now + this.windowMs });
    else h.n++;
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

export const isLocalOrigin = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(o);

/** Only accept a plain https origin (or localhost) from the browser, nothing with paths or odd characters. */
export function cleanOrigin(v: string | undefined): string {
  if (!v) return "";
  const s = v.trim().replace(/\/+$/, "");
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(s) || isLocalOrigin(s) ? s : "";
}
