import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhook/status
 *
 * Returns webhook health metrics for the Settings page:
 *   - configured: are env vars present?
 *   - last event time + kind
 *   - last successful verify handshake
 *   - last signature-failure (security alarm)
 *   - counts of events received in last 1h / 24h / 7d
 *   - recent events (last 20) for the activity feed
 *   - public_url: best-effort guess of the URL Meta should be hitting
 */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const database = db();
  const env = {
    has_phone_id: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    has_token: !!process.env.WHATSAPP_ACCESS_TOKEN,
    has_app_secret: !!process.env.WHATSAPP_APP_SECRET,
    has_verify_token: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    has_waba_id: !!process.env.WHATSAPP_WABA_ID,
  };

  const last = database
    .prepare(
      "SELECT id, received_at, kind, signature_ok, message_count, status_count, error FROM webhook_events ORDER BY id DESC LIMIT 1",
    )
    .get() as any;
  const lastVerify = database
    .prepare(
      "SELECT received_at FROM webhook_events WHERE kind = 'verify_ok' ORDER BY id DESC LIMIT 1",
    )
    .get() as { received_at: string } | undefined;
  const lastSigFail = database
    .prepare(
      "SELECT received_at FROM webhook_events WHERE signature_ok = 0 ORDER BY id DESC LIMIT 1",
    )
    .get() as { received_at: string } | undefined;

  const since = (n: number) =>
    new Date(Date.now() - n).toISOString().replace("T", " ").slice(0, 19);
  const HOUR = 60 * 60 * 1000;

  const cnt = (q: string, ...args: any[]) =>
    Number(((database.prepare(q).get(...args) as any) || {}).n || 0);

  const counts = {
    last_1h: cnt(
      "SELECT COUNT(*) AS n FROM webhook_events WHERE received_at >= ?",
      since(HOUR),
    ),
    last_24h: cnt(
      "SELECT COUNT(*) AS n FROM webhook_events WHERE received_at >= ?",
      since(24 * HOUR),
    ),
    last_7d: cnt(
      "SELECT COUNT(*) AS n FROM webhook_events WHERE received_at >= ?",
      since(7 * 24 * HOUR),
    ),
    sig_failures_24h: cnt(
      "SELECT COUNT(*) AS n FROM webhook_events WHERE signature_ok = 0 AND received_at >= ?",
      since(24 * HOUR),
    ),
  };

  const recent = database
    .prepare(
      "SELECT id, received_at, kind, signature_ok, message_count, status_count, error FROM webhook_events ORDER BY id DESC LIMIT 20",
    )
    .all() as any[];

  // Best-effort public URL — uses request host. If running behind ngrok this
  // gives the right answer when you hit Settings from the ngrok tunnel.
  let publicUrl: string | null = null;
  try {
    const u = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") || u.host;
    publicUrl = `${proto}://${host}/api/webhook`;
  } catch {
    publicUrl = null;
  }

  // Health verdict
  let health: "healthy" | "stale" | "warning" | "down" = "down";
  if (last && last.received_at) {
    const ageMs = Date.now() - new Date(last.received_at.replace(" ", "T") + "Z").getTime();
    if (counts.sig_failures_24h > 0) health = "warning";
    else if (ageMs < 6 * HOUR) health = "healthy";
    else if (ageMs < 48 * HOUR) health = "stale";
    else health = "down";
  }

  return NextResponse.json({
    env,
    health,
    last_event: last || null,
    last_verify_at: lastVerify?.received_at || null,
    last_signature_failure_at: lastSigFail?.received_at || null,
    counts,
    recent,
    public_url: publicUrl,
  });
}
