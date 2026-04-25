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
  const rows = db()
    .prepare(
      `SELECT f.id, f.name, f.description, f.active, f.trigger_type, f.trigger_config,
              f.created_at, f.updated_at,
              (SELECT COUNT(*) FROM flow_runs r WHERE r.flow_id = f.id) AS run_count,
              (SELECT COUNT(*) FROM flow_runs r WHERE r.flow_id = f.id AND r.status IN ('active','waiting','waiting_for_reply')) AS active_runs
         FROM flows f
        ORDER BY f.id DESC`,
    )
    .all();
  return NextResponse.json({ flows: rows });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim() || "Untitled flow";
  const description = String(body.description || "");
  const trigger_type = String(body.trigger_type || "manual");
  const trigger_config = JSON.stringify(body.trigger_config || {});
  const res = db()
    .prepare(
      `INSERT INTO flows (name, description, trigger_type, trigger_config, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(name, description, trigger_type, trigger_config, user.id);
  return NextResponse.json({ id: Number(res.lastInsertRowid) });
}
