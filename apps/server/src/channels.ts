import { isEmergencyNumber, type Channel, type OutboundMessage } from "@rakshasutra/core";
import type { BeeBridge } from "./bee-bridge.js";

/** The parent app itself. Always on. The message is shown in the app's "sent to you" list. */
export const appChannel: Channel = {
  id: "app",
  label: "In the app",
  minTier: "warning",
  async send() {
    return { ok: true, detail: "Shown in the app" };
  },
};

/**
 * A reminder on the guardian's Bee, so the alert reaches them even with the app closed.
 * Opt-in (BEE_ALERTS=1) because it writes into the guardian's real Bee account.
 */
export function beeChannel(bridge: BeeBridge, demo: () => boolean): Channel {
  return {
    id: "bee",
    label: "Your Bee reminder",
    minTier: "critical",
    async send(m: OutboundMessage) {
      const text = `${demo() ? "(demo) " : ""}${m.short}`.slice(0, 280);
      const ok = await bridge.addReminder(text, new Date(Date.now() + 5_000));
      return ok ? { ok: true, detail: "Reminder added to Bee todos" } : { ok: false, detail: "Bee is not connected" };
    },
  };
}

/**
 * Text message through Amazon SNS to the PARENT's own phone. Opt-in (SNS_TO_PHONE).
 * Emergency numbers are refused as a destination: this app never contacts them.
 */
export function smsChannel(toPhone: string): Channel {
  return {
    id: "sms",
    label: "Text message",
    minTier: "critical",
    async send(m: OutboundMessage) {
      if (isEmergencyNumber(toPhone)) return { ok: false, detail: "Refused: emergency numbers are never a destination" };
      try {
        const pkg = "@aws-sdk/client-sns";
        const sdk: any = await import(/* @vite-ignore */ pkg);
        const client = new sdk.SNSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
        await client.send(new sdk.PublishCommand({ PhoneNumber: toPhone, Message: m.short.slice(0, 600) }));
        return { ok: true, detail: "Sent through Amazon SNS" };
      } catch (e) {
        return { ok: false, detail: `SNS unavailable: ${(e as Error).message}` };
      }
    },
  };
}

/**
 * A push notification to the parent's phone through ntfy.sh (free, no account; install the ntfy app and
 * subscribe to your private topic). The message never contains a location, a name (unless the parent
 * opts in) or any detail: only "open the app". ntfy is a public service, so nothing sensitive goes through it.
 */
export function ntfyChannel(opts: { topic: () => string | undefined; publicUrl: () => string | undefined; includeName: () => boolean; childName: () => string }): Channel {
  const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "").trim();
  return {
    id: "push",
    label: "Phone notification",
    minTier: "warning",
    async send(m: OutboundMessage) {
      const topic = opts.topic();
      if (!topic) return { ok: false, detail: "No notification topic set yet" };
      const who = opts.includeName() ? ascii(opts.childName()) || "Your child" : "Your child";
      const urgent = m.tier === "critical";
      const headers: Record<string, string> = {
        Title: urgent ? `${who} may need help` : "Something is worth a look",
        Priority: urgent ? "urgent" : "high",
        Tags: urgent ? "rotating_light" : "eyes",
      };
      const url = opts.publicUrl();
      if (url) headers.Click = url;
      try {
        const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
          method: "POST",
          headers,
          body: `${m.kind === "reminder" ? "Reminder, not yet answered. " : ""}Open RakshaSutra for details. This message has no location in it.`,
          signal: AbortSignal.timeout(8000),
        });
        return res.ok ? { ok: true, detail: "Sent through ntfy" } : { ok: false, detail: `ntfy answered ${res.status}` };
      } catch (e) {
        return { ok: false, detail: `ntfy unreachable: ${(e as Error).message}` };
      }
    },
  };
}
