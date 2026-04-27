/**
 * GET /api/logs/errors
 *   Admin-only feed of system errors. Filters: source, contact_id, q,
 *   since/until, limit, offset.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);

  const where: string[] = ["1=1"];
  const params: any[] = [];

  const source = url.searchParams.get("source");
  if (source) {
    where.push("source = ?");
    params.push(source);
  }
  const contactId = url.searchParams.get("contact_id");
  if (contactId) {
    where.push("contact_id = ?");
    params.push(Number(contactId));
  }
  const q = url.searchParams.get("q");
  if (q && q.trim()) {
    where.push("message LIKE ?");
    params.push(`%${q.trim()}%`);
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
      `SELECT id, source, message, context_json, contact_id, created_at
         FROM error_log
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as any[];

  const total = (db()
    .prepare(`SELECT COUNT(*) AS n FROM error_log WHERE ${where.join(" AND ")}`)
    .get(...params) as { n: number }).n;

  const sources = (db()
    .prepare("SELECT DISTINCT source FROM error_log ORDER BY source ASC")
    .all() as Array<{ source: string }>).map((r) => r.source);

  return NextResponse.json({
    errors: rows.map((r) => ({
      ...r,
      context: r.context_json ? safeParse(r.context_json) : null,
    })),
    total,
    sources,
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
