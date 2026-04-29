import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { getDeal, recomputeDealValue } from "@/lib/deals";
import { parseRupeesToPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const dealId = Number(params.id);
  const existing = getDeal(dealId);
  if (!existing) return NextResponse.json({ error: "deal not found" }, { status: 404 });

  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const max = db()
    .prepare("SELECT COALESCE(MAX(order_index), -1) as n FROM deal_line_items WHERE deal_id = ?")
    .get(dealId) as { n: number };

  const quantity = body.quantity != null ? Number(body.quantity) : 1;
  const unitPricePaise = parseRupeesToPaise(body.unit_price);
  const kind = body.kind === "service" ? "service" : "product";

  const res = db()
    .prepare(
      `INSERT INTO deal_line_items (deal_id, name, description, kind, quantity, unit_price_paise, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(dealId, name, body.description || null, kind, quantity, unitPricePaise, max.n + 1);
  const id = Number(res.lastInsertRowid);

  recomputeDealValue(dealId);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal.line_item.create",
    entityType: "deal",
    entityId: dealId,
    contactId: existing.contact_id,
    summary: `Added line item "${name}" to deal "${existing.title}"`,
    metadata: { name, quantity, unit_price_paise: unitPricePaise, kind },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ id });
}
