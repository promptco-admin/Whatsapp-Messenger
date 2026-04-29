import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const existing = db().prepare("SELECT * FROM deal_stages WHERE id = ?").get(id) as any;
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof body.name === "string" && body.name.trim()) {
    fields.push("name = ?");
    values.push(body.name.trim());
  }
  if (typeof body.color === "string") {
    fields.push("color = ?");
    values.push(body.color);
  }
  if (typeof body.order_index === "number") {
    fields.push("order_index = ?");
    values.push(body.order_index);
  }
  if (typeof body.is_won !== "undefined") {
    fields.push("is_won = ?");
    values.push(body.is_won ? 1 : 0);
  }
  if (typeof body.is_lost !== "undefined") {
    fields.push("is_lost = ?");
    values.push(body.is_lost ? 1 : 0);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });

  values.push(id);
  db().prepare(`UPDATE deal_stages SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal_stage.update",
    entityType: "deal_stage",
    entityId: id,
    summary: `Updated deal stage "${existing.name}"`,
    metadata: body,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const existing = db().prepare("SELECT name FROM deal_stages WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dealCount = db()
    .prepare("SELECT COUNT(*) as n FROM deals WHERE stage_id = ?")
    .get(id) as { n: number };
  if (dealCount.n > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${dealCount.n} deal(s) still in this stage. Move them first.` },
      { status: 400 },
    );
  }
  db().prepare("DELETE FROM deal_stages WHERE id = ?").run(id);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal_stage.delete",
    entityType: "deal_stage",
    entityId: id,
    summary: `Deleted deal stage "${existing.name}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
