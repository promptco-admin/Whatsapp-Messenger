import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare(
      `SELECT id, name, order_index, color, is_won, is_lost, created_at
         FROM deal_stages ORDER BY order_index ASC, id ASC`,
    )
    .all();
  return NextResponse.json({ stages: rows });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const max = db()
    .prepare("SELECT COALESCE(MAX(order_index), -1) as n FROM deal_stages")
    .get() as { n: number };
  const order = body.order_index != null ? Number(body.order_index) : max.n + 1;

  const res = db()
    .prepare(
      `INSERT INTO deal_stages (name, order_index, color, is_won, is_lost)
         VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      order,
      body.color || "#94a3b8",
      body.is_won ? 1 : 0,
      body.is_lost ? 1 : 0,
    );
  const id = Number(res.lastInsertRowid);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal_stage.create",
    entityType: "deal_stage",
    entityId: id,
    summary: `Created deal stage "${name}"`,
    metadata: { name, color: body.color, is_won: !!body.is_won, is_lost: !!body.is_lost },
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ id });
}
