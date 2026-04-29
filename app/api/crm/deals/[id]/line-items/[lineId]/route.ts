import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { getDeal, recomputeDealValue } from "@/lib/deals";
import { parseRupeesToPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; lineId: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const dealId = Number(params.id);
  const lineId = Number(params.lineId);
  const deal = getDeal(dealId);
  if (!deal) return NextResponse.json({ error: "deal not found" }, { status: 404 });

  const existing = db()
    .prepare("SELECT * FROM deal_line_items WHERE id = ? AND deal_id = ?")
    .get(lineId, dealId) as any;
  if (!existing) return NextResponse.json({ error: "line item not found" }, { status: 404 });

  const body = await req.json();
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof body.name === "string" && body.name.trim()) {
    fields.push("name = ?");
    values.push(body.name.trim());
  }
  if (body.description !== undefined) {
    fields.push("description = ?");
    values.push(body.description || null);
  }
  if (body.kind !== undefined) {
    fields.push("kind = ?");
    values.push(body.kind === "service" ? "service" : "product");
  }
  if (body.quantity !== undefined) {
    fields.push("quantity = ?");
    values.push(Number(body.quantity));
  }
  if (body.unit_price !== undefined) {
    fields.push("unit_price_paise = ?");
    values.push(parseRupeesToPaise(body.unit_price));
  }
  if (typeof body.order_index === "number") {
    fields.push("order_index = ?");
    values.push(body.order_index);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(lineId);

  db().prepare(`UPDATE deal_line_items SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  recomputeDealValue(dealId);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal.line_item.update",
    entityType: "deal",
    entityId: dealId,
    contactId: deal.contact_id,
    summary: `Updated line item on deal "${deal.title}"`,
    metadata: body,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; lineId: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const dealId = Number(params.id);
  const lineId = Number(params.lineId);
  const deal = getDeal(dealId);
  if (!deal) return NextResponse.json({ error: "deal not found" }, { status: 404 });

  const existing = db()
    .prepare("SELECT name FROM deal_line_items WHERE id = ? AND deal_id = ?")
    .get(lineId, dealId) as { name: string } | undefined;
  if (!existing) return NextResponse.json({ error: "line item not found" }, { status: 404 });

  db().prepare("DELETE FROM deal_line_items WHERE id = ?").run(lineId);
  recomputeDealValue(dealId);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal.line_item.delete",
    entityType: "deal",
    entityId: dealId,
    contactId: deal.contact_id,
    summary: `Removed line item "${existing.name}" from deal "${deal.title}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
