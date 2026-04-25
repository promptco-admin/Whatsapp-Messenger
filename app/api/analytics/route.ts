import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics?days=30
 * Returns aggregate stats for the last N days. Default 30.
 */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = Math.max(1, Math.min(365, Number(daysParam) || 30));
  // SQLite stores mixed timestamp formats (CURRENT_TIMESTAMP space-separated,
  // JS toISOString Z-suffix). Use a space-separated threshold — string
  // comparison works for both formats since "2026-04-23 ..." < "2026-04-23T..."
  // sorts correctly lexicographically when compared to ISO too.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const database = db();

  // Overview KPIs from messages
  const out = database
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('sent','delivered','read') THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status IN ('delivered','read') THEN 1 ELSE 0 END) AS delivered,
         SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS read_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM messages
       WHERE direction = 'outbound' AND created_at >= ?`,
    )
    .get(since) as any;

  const inbound = database
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
        WHERE direction = 'inbound' AND created_at >= ?`,
    )
    .get(since) as any;

  const uniqueCustomers = database
    .prepare(
      `SELECT COUNT(DISTINCT contact_id) AS n FROM messages WHERE created_at >= ?`,
    )
    .get(since) as any;

  // Per-template performance
  const templates = database
    .prepare(
      `SELECT template_name,
              COUNT(*) AS sent,
              SUM(CASE WHEN status IN ('delivered','read') THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS read_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM messages
        WHERE direction = 'outbound'
          AND template_name IS NOT NULL
          AND created_at >= ?
        GROUP BY template_name
        ORDER BY sent DESC`,
    )
    .all(since) as any[];

  // Per-agent performance
  const agents = database
    .prepare(
      `SELECT u.id, u.name, u.role,
              (SELECT COUNT(*) FROM messages m
                WHERE m.direction = 'outbound'
                  AND m.sent_by_user_id = u.id
                  AND m.created_at >= ?) AS messages_sent,
              (SELECT COUNT(*) FROM contacts c
                WHERE c.assigned_user_id = u.id) AS conversations_assigned,
              (SELECT COUNT(*) FROM contact_notes n
                WHERE n.user_id = u.id
                  AND n.created_at >= ?) AS notes_written,
              (SELECT COUNT(*) FROM broadcasts b
                WHERE b.created_by_user_id = u.id
                  AND b.created_at >= ?) AS broadcasts_created
         FROM users u
        WHERE u.active = 1
        ORDER BY messages_sent DESC, u.name ASC`,
    )
    .all(since, since, since) as any[];

  // Auto-reply firings
  const autoReplies = database
    .prepare(
      `SELECT COUNT(*) AS fires FROM auto_reply_fires WHERE fired_at >= ?`,
    )
    .get(since) as any;

  // Phase 6a: click-to-WhatsApp ad attribution.
  // Contacts whose first-touch source is set (regardless of when) that had
  // activity within the period (defined as any message in range). We still
  // count new ad-sourced contacts (first_seen_at in range) separately.
  const adSourcedAll = database
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts WHERE source_json IS NOT NULL`,
    )
    .get() as any;
  const adSourcedRecent = database
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts
        WHERE source_json IS NOT NULL
          AND COALESCE(last_message_at, created_at) >= ?`,
    )
    .get(since) as any;

  // Top ads by conversation count — group by headline (falling back to source_id),
  // counting contacts whose first-touch attribution is from that ad.
  const topAdsRaw = database
    .prepare(
      `SELECT source_json FROM contacts
        WHERE source_json IS NOT NULL
          AND COALESCE(last_message_at, created_at) >= ?`,
    )
    .all(since) as Array<{ source_json: string }>;
  const adBuckets = new Map<string, { label: string; count: number }>();
  for (const row of topAdsRaw) {
    try {
      const s = JSON.parse(row.source_json);
      const key = s.headline || s.source_id || "(unknown ad)";
      const bucket = adBuckets.get(key) || { label: key, count: 0 };
      bucket.count += 1;
      adBuckets.set(key, bucket);
    } catch {
      // skip malformed rows
    }
  }
  const topAds = Array.from(adBuckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Daily activity for the full selected range (capped at 60 days for chart density).
  const sparkDays = Math.min(days, 60);
  const sparkSince = new Date(Date.now() - sparkDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const spark = database
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day,
              SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS outbound,
              SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS inbound,
              SUM(CASE WHEN direction = 'outbound' AND status IN ('sent','delivered','read') THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN direction = 'outbound' AND status IN ('delivered','read') THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN direction = 'outbound' AND status = 'read' THEN 1 ELSE 0 END) AS read_count
         FROM messages
        WHERE created_at >= ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC`,
    )
    .all(sparkSince) as any[];

  // Hour-of-day heatmap of inbound messages (when do customers reach us).
  // 24-hour buckets in server local timezone — fine for a single-region team.
  const hourlyRows = database
    .prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hr,
              CAST(strftime('%w', created_at) AS INTEGER) AS dow,
              COUNT(*) AS n
         FROM messages
        WHERE direction = 'inbound' AND created_at >= ?
        GROUP BY hr, dow`,
    )
    .all(since) as Array<{ hr: number; dow: number; n: number }>;
  // Build a 7x24 matrix; dow=0 (Sun)..6 (Sat).
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of hourlyRows) {
    if (r.dow >= 0 && r.dow < 7 && r.hr >= 0 && r.hr < 24) {
      heatmap[r.dow][r.hr] = Number(r.n) || 0;
    }
  }

  // Pipeline distribution — current contacts per stage (NOT date-scoped — this is
  // a snapshot of "where my leads are right now").
  const pipelineRows = database
    .prepare(
      `SELECT s.id, s.name, s.color, s.is_won, s.is_lost,
              (SELECT COUNT(*) FROM contacts c
                 WHERE c.pipeline_stage_id = s.id
                   AND c.unsubscribed_at IS NULL) AS contact_count
         FROM pipeline_stages s
         ORDER BY s.order_index ASC, s.id ASC`,
    )
    .all() as any[];
  const unstagedCount = (
    database
      .prepare(
        "SELECT COUNT(*) AS n FROM contacts WHERE pipeline_stage_id IS NULL AND unsubscribed_at IS NULL",
      )
      .get() as { n: number }
  ).n;

  // Follow-up status snapshot.
  const fuStatus = database
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' AND due_at < datetime('now') THEN 1 ELSE 0 END) AS overdue,
         SUM(CASE WHEN status = 'pending' AND due_at >= datetime('now') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM followups`,
    )
    .get() as any;

  // New contacts created per day in range — adoption / lead-gen trend.
  const newContacts = database
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
         FROM contacts
        WHERE created_at >= ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC`,
    )
    .all(sparkSince) as any[];

  // Opted-out vs subscribed snapshot.
  const optStatus = database
    .prepare(
      `SELECT
         SUM(CASE WHEN unsubscribed_at IS NULL THEN 1 ELSE 0 END) AS subscribed,
         SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS opted_out
       FROM contacts`,
    )
    .get() as any;

  const sent = Number(out.sent || 0);
  const delivered = Number(out.delivered || 0);
  const readCount = Number(out.read_count || 0);
  const failed = Number(out.failed || 0);
  const inboundCount = Number(inbound.n || 0);

  return NextResponse.json({
    days,
    overview: {
      sent,
      delivered,
      read: readCount,
      failed,
      inbound: inboundCount,
      unique_customers: Number(uniqueCustomers.n || 0),
      auto_reply_fires: Number(autoReplies.fires || 0),
      ad_sourced_total: Number(adSourcedAll.n || 0),
      ad_sourced_recent: Number(adSourcedRecent.n || 0),
      delivered_rate: sent > 0 ? delivered / sent : 0,
      read_rate: sent > 0 ? readCount / sent : 0,
      // Simple reply rate: inbound / outbound sent in the period
      reply_rate: sent > 0 ? Math.min(1, inboundCount / sent) : 0,
    },
    templates: templates.map((t) => ({
      template_name: t.template_name,
      sent: Number(t.sent),
      delivered: Number(t.delivered),
      read: Number(t.read_count),
      failed: Number(t.failed),
      delivered_rate: t.sent > 0 ? t.delivered / t.sent : 0,
      read_rate: t.sent > 0 ? t.read_count / t.sent : 0,
    })),
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      messages_sent: Number(a.messages_sent),
      conversations_assigned: Number(a.conversations_assigned),
      notes_written: Number(a.notes_written),
      broadcasts_created: Number(a.broadcasts_created),
    })),
    daily: spark.map((d) => ({
      day: d.day,
      outbound: Number(d.outbound),
      inbound: Number(d.inbound),
      sent: Number(d.sent || 0),
      delivered: Number(d.delivered || 0),
      read: Number(d.read_count || 0),
      delivered_rate: d.sent > 0 ? Number(d.delivered) / Number(d.sent) : 0,
      read_rate: d.sent > 0 ? Number(d.read_count) / Number(d.sent) : 0,
    })),
    top_ads: topAds,
    heatmap, // 7x24 grid of inbound counts
    pipeline: {
      stages: pipelineRows.map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        is_won: !!s.is_won,
        is_lost: !!s.is_lost,
        count: Number(s.contact_count || 0),
      })),
      unstaged: unstagedCount,
    },
    followups: {
      overdue: Number(fuStatus.overdue || 0),
      pending: Number(fuStatus.pending || 0),
      done: Number(fuStatus.done || 0),
      cancelled: Number(fuStatus.cancelled || 0),
      failed: Number(fuStatus.failed || 0),
    },
    new_contacts: newContacts.map((d) => ({
      day: d.day,
      count: Number(d.n || 0),
    })),
    opt_status: {
      subscribed: Number(optStatus.subscribed || 0),
      opted_out: Number(optStatus.opted_out || 0),
    },
  });
}
