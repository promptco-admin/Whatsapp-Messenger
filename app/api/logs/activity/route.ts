/**
 * GET /api/logs/activity
 *   Admin-only feed of audit activity. Filters:
 *     - user_id     pin to one user (or 0 for system-driven events)
 *     - action      exact action match (e.g. "contact.update")
 *     - action_prefix  prefix match (e.g. "followup." for all follow-up events)
 *     - contact_id  scoped per-conversation timeline (also used by ChatView)
 *     - q           full-text-ish search across summary
 *     - since/until ISO date bounds
 *     - limit (default 100, max 500)
 *     - offset
 *   Also returns distinct user/action lists for the filter dropdowns.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contactScope = url.searchParams.get("contact_id");

  // Per-conversation queries are allowed for any logged-in user — they only
  // see logs for the contact they're already chatting with. Everything else
  // is admin-only.
  let user;
  try {
    user = contactScope ? await requireUser() : await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  void user;

  const where: string[] = ["1=1"];
  const params: any[] = [];

  if (contactScope) {
    where.push("contact_id = ?");
    params.push(Number(contactScope));
  }
  const userIdParam = url.searchParams.get("user_id");
  if (userIdParam !== null && userIdParam !== "") {
    if (userIdParam === "0") {
      where.push("user_id IS NULL");
    } else {
      where.push("user_id = ?");
      params.push(Number(userIdParam));
    }
  }
  const action = url.searchParams.get("action");
  if (action) {
    where.push("action = ?");
    params.push(action);
  }
  const actionPrefix = url.searchParams.get("action_prefix");
  if (actionPrefix) {
    where.push("action LIKE ?");
    params.push(`${actionPrefix}%`);
  }
  const q = url.searchParams.get("q");
  if (q && q.trim()) {
    where.push("(summary LIKE ? OR user_name LIKE ?)");
    const wild = `%${q.trim()}%`;
    params.push(wild, wild);
  }
  const since = url.searchParams.get("since");
  if (since) {
    where.push("created_at >= ?");
    params.push(since);
  }
  const until = url.searchParams.get("until");
  if (until) {
    where.push("created_at <= ?");
    params.push(until);
  }

  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

  const rows = db()
    .prepare(
      `SELECT id, user_id, user_name, user_role, action, entity_type, entity_id,
              contact_id, summary, metadata_json, ip_address, created_at
         FROM activity_log
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as any[];

  const total = (db()
    .prepare(`SELECT COUNT(*) AS n FROM activity_log WHERE ${where.join(" AND ")}`)
    .get(...params) as { n: number }).n;

  // For the filter dropdowns. Only computed on the unscoped admin view —
  // skipped on per-contact requests to keep them snappy.
  let users: Array<{ id: number | null; name: string | null }> = [];
  let actions: string[] = [];
  if (!contactScope) {
    users = db()
      .prepare(
        `SELECT DISTINCT user_id AS id, user_name AS name
           FROM activity_log
          WHERE user_id IS NOT NULL
          ORDER BY user_name ASC`,
      )
      .all() as any[];
    actions = (db()
      .prepare("SELECT DISTINCT action FROM activity_log ORDER BY action ASC")
      .all() as Array<{ action: string }>).map((r) => r.action);
  }

  return NextResponse.json({
    activity: rows.map((r) => ({
      ...r,
      metadata: r.metadata_json ? safeParse(r.metadata_json) : null,
    })),
    total,
    users,
    actions,
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
