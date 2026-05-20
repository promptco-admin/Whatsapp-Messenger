/**
 * Web push notifications using VAPID + the `web-push` library.
 *
 * Subscriptions are stored in `push_subscriptions`, keyed by user_id. On every
 * new inbound, we fan out a push to every subscribed user. If a push fails
 * with a 410 (Gone) we prune the dead subscription.
 */
import webpush from "web-push";
import { db } from "./db";

let configured = false;

function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) {
    console.warn("[push] VAPID keys missing — push disabled");
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export function isPushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  configure();
  if (!configured) return { sent: 0, pruned: 0 };
  const rows = db()
    .prepare(
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions",
    )
    .all() as Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;
  let sent = 0;
  let pruned = 0;
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 },
        );
        sent++;
      } catch (e: any) {
        const statusCode = e?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          db().prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
          pruned++;
        } else {
          console.error("[push] send error", statusCode, e?.body || e?.message);
        }
      }
    }),
  );
  return { sent, pruned };
}
