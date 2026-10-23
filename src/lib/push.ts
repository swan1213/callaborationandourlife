// Web push: desktop notifications that arrive even when TailorBid is closed (the browser shows them through
// public/sw.js). Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT; without them push is off and
// notifications still show in the app.
import webpush from "web-push";
import { PushSubscription } from "./models/PushSubscription";

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

let configured: boolean | null = null;
function ready() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(subject || "mailto:admin@localhost", pub!, priv!);
  return configured;
}

/** The public key browsers subscribe with, or null when push isn't set up. */
export const pushPublicKey = () => (ready() ? process.env.VAPID_PUBLIC_KEY! : null);

/**
 * Sends to every browser these people turned Desktop alerts on in. Subscriptions the browser has dropped
 * (404 / 410) are removed. Never throws: a notification must not fail the event that caused it.
 */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!ready() || !userIds.length) return;
  try {
    const subs = await PushSubscription.find({ user: { $in: userIds } }).lean();
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        if (!s.keys) return;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, body, { TTL: 60 * 60, urgency: "high" });
          await PushSubscription.updateOne({ _id: s._id }, { $set: { lastSuccessAt: new Date() } });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await PushSubscription.deleteOne({ _id: s._id });
          else console.error("web push failed", status, (e as Error).message);
        }
      })
    );
  } catch (e) {
    console.error("web push failed", e);
  }
}
