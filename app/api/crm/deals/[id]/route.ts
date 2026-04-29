import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { getDeal, getDealLineItems } from "@/lib/deals";
import { parseRupeesToPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const deal = getDeal(id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const line_items = getDealLineItems(id);
  return NextResponse.json({ deal, line_items });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const existing = getDeal(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const fields: string[] = [];
  const values: any[] = [];

  if (typeof body.title === "string" && body.title.trim()) {
    fields.push("title = ?");
    values.push(body.title.trim());
  }
  if (body.stage_id !== undefined) {
    const newStageId = body.stage_id == null ? null : Number(body.stage_id);
    fields.push("stage_id = ?");
    values.push(newStageId);
    // Auto-update status + closed_at based on the new stage's terminal flag.
    if (newStageId) {
      const stage = db()
        .prepare("SELECT is_won, is_lost FROM deal_stages WHERE id = ?")
        .get(newStageId) as { is_won: number; is_lost: number } | undefined;
      if (stage) {
        if (stage.is_won) {
          fields.push("status = ?", "closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)");
          values.push("won");
        } else if (stage.is_lost) {
          fields.push("status = ?", "closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)");
          values.push("lost");
        } else {
          fields.push("status = ?", "closed_at = NULL");
          values.push("open");
        }
      }
    }
  }
  if (body.owner_user_id !== undefined) {
    fields.push("owner_user_id = ?");
    values.push(body.owner_user_id == null ? null : Number(body.owner_user_id));
  }
  if (body.value !== undefined) {
    fields.push("value_paise = ?");
    values.push(parseRupeesToPaise(body.value));
  }
  if (body.expected_close_date !== undefined) {
    fields.push("expected_close_date = ?");
    values.push(body.expected_close_date || null);
  }
  if (body.notes !== undefined) {
    fields.push("notes = ?");
    values.push(body.notes || null);
  }
  if (body.won_lost_reason !== undefined) {
    fields.push("won_lost_reason = ?");
    values.push(body.won_lost_reason || null);
  }

  if (fields.length === 0) return NextResponse.json({ ok: true });
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  db().prepare(`UPDATE deals SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal.update",
    entityType: "deal",
    entityId: id,
    contactId: existing.contact_id,
    summary: `Updated deal "${existing.title}"`,
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
  const existing = getDeal(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  db().prepare("DELETE FROM deals WHERE id = ?").run(id);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal.delete",
    entityType: "deal",
    entityId: id,
    contactId: existing.contact_id,
    summary: `Deleted deal "${existing.title}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
