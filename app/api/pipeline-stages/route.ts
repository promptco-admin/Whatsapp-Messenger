import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const stages = db()
    .prepare(
      `SELECT s.id, s.name, s.order_index, s.color, s.is_won, s.is_lost,
              s.auto_followup_days,
              (SELECT COUNT(*) FROM contacts c WHERE c.pipeline_stage_id = s.id
                 AND c.unsubscribed_at IS NULL) AS contact_count
         FROM pipeline_stages s
         ORDER BY s.order_index ASC, s.id ASC`,
    )
    .all();
  return NextResponse.json({ stages });
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const max = db()
    .prepare("SELECT COALESCE(MAX(order_index), -1) as m FROM pipeline_stages")
    .get() as { m: number };
  const res = db()
    .prepare(
      `INSERT INTO pipeline_stages (name, order_index, color, is_won, is_lost, auto_followup_days)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      Number.isFinite(body.order_index) ? Number(body.order_index) : max.m + 1,
      String(body.color || "#94a3b8"),
      body.is_won ? 1 : 0,
      body.is_lost ? 1 : 0,
      body.auto_followup_days != null ? Number(body.auto_followup_days) : null,
    );
  return NextResponse.json({ id: Number(res.lastInsertRowid) });
}
