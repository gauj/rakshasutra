import { Alert, Tier } from "./types.js";

/**
 * Emergency numbers are display-only. The app never dials them and never sends them messages;
 * every channel must refuse these as a destination, including during tests and demos.
 */
const EMERGENCY_NUMBERS = new Set(["911", "112", "999", "100", "101", "102", "108", "1098", "988", "18008435678"]);
export function isEmergencyNumber(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "").replace(/^1(?=\d{10}$)/, "");
  return EMERGENCY_NUMBERS.has(digits) || EMERGENCY_NUMBERS.has("1" + digits);
}

export interface OutboundMessage {
  alertId: string;
  incidentId: string;
  childId: string;
  tier: Tier;
  kind: "new" | "update" | "reminder";
  subject: string;
  /** SMS-length text. */
  short: string;
  /** Full-detail text for push, email or a notes app. */
  long: string;
  emergencyBrief: string;
  at: number;
}

export interface ChannelResult {
  ok: boolean;
  detail?: string;
}

export interface Channel {
  id: string;
  label: string;
  /** The lowest tier this channel is used for. A warning goes quietly to the app; a critical goes everywhere. */
  minTier: "warning" | "critical";
  send(m: OutboundMessage): Promise<ChannelResult>;
}

export interface DeliveryRecord {
  id: string;
  alertId: string;
  incidentId: string;
  channel: string;
  channelLabel: string;
  kind: OutboundMessage["kind"];
  tier: Tier;
  at: number;
  ok: boolean;
  detail?: string;
  preview: string;
}

export interface DispatchPolicy {
  /** Re-send an unacknowledged critical alert this often (in the engine's clock). */
  reminderEveryMin: number;
  maxReminders: number;
}

const rank: Record<Tier, number> = { safe: 0, watch: 1, warning: 2, critical: 3 };

/**
 * Turns alerts into messages on the parent's channels, so the parent is told without opening the app.
 * It is clock-agnostic (uses the timestamp it is given) so the demo's fast clock behaves like real time.
 */
export class AlertDispatcher {
  readonly records: DeliveryRecord[] = [];
  private handled = new Set<string>();
  private incidents = new Map<string, { at: number; reminders: number }>();
  private busy = false;
  private seq = 0;

  constructor(
    private channels: Channel[],
    private policy: DispatchPolicy = { reminderEveryMin: 5, maxReminders: 3 },
  ) {}

  /** Forget everything, for example when a demo restarts. */
  reset() {
    this.records.length = 0;
    this.handled.clear();
    this.incidents.clear();
  }

  async sync(alerts: Alert[], now: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const a of alerts) {
        if (this.handled.has(a.id)) continue;
        this.handled.add(a.id);
        // An alert that was already replaced by a follow-up before we saw it is not sent again.
        if (a.status !== "open") continue;
        const known = this.incidents.get(a.incidentId);
        await this.deliver(a, known ? "update" : "new", now);
        this.incidents.set(a.incidentId, { at: now, reminders: known?.reminders ?? 0 });
      }
      // Reminders: an open critical alert that nobody has acknowledged.
      const latest = new Map<string, Alert>();
      for (const a of alerts) latest.set(a.incidentId, a);
      for (const [incidentId, a] of latest) {
        const st = this.incidents.get(incidentId);
        if (!st || a.status !== "open" || a.tier !== "critical") continue;
        if (st.reminders >= this.policy.maxReminders) continue;
        if (now - st.at < this.policy.reminderEveryMin * 60_000) continue;
        st.reminders++;
        st.at = now;
        await this.deliver(a, "reminder", now);
      }
    } finally {
      this.busy = false;
    }
  }

  private async deliver(a: Alert, kind: OutboundMessage["kind"], now: number) {
    const prefix = kind === "reminder" ? "REMINDER, not yet acknowledged: " : kind === "update" ? "UPDATE: " : "";
    const msg: OutboundMessage = {
      alertId: a.id,
      incidentId: a.incidentId,
      childId: a.childId,
      tier: a.tier,
      kind,
      subject: `${prefix}RakshaSutra ${a.tier.toUpperCase()}: ${a.sos.headline}`,
      short: `${prefix}${a.sos.smsText}`,
      long: `${prefix}${a.sos.longText}`,
      emergencyBrief: a.sos.emergencyBrief,
      at: now,
    };
    const targets = this.channels.filter((c) => rank[a.tier] >= rank[c.minTier]);
    await Promise.all(
      targets.map(async (c) => {
        let res: ChannelResult;
        try {
          res = await c.send(msg);
        } catch (e) {
          res = { ok: false, detail: (e as Error).message };
        }
        this.records.push({
          id: `delivery-${++this.seq}`,
          alertId: a.id,
          incidentId: a.incidentId,
          channel: c.id,
          channelLabel: c.label,
          kind,
          tier: a.tier,
          at: now,
          ok: res.ok,
          detail: res.detail,
          preview: msg.short.slice(0, 160),
        });
      }),
    );
  }
}
