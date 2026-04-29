import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { getCompany } from "@/lib/companies";
import { listDeals } from "@/lib/deals";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const company = getCompany(id);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });

  const contacts = db()
    .prepare(
      `SELECT id, wa_id, name, wa_profile_name, last_inbound_at, last_message_at,
              pipeline_stage_id, unsubscribed_at
         FROM contacts WHERE company_id = ? ORDER BY name ASC`,
    )
    .all(id);

  const contactIds = (contacts as any[]).map((c) => c.id);
  const deals = contactIds.length === 0
    ? []
    : db()
        .prepare(
          `SELECT d.id, d.title, d.value_paise, d.status, d.stage_id, d.expected_close_date,
                  d.contact_id, c.name AS contact_name, c.wa_profile_name AS contact_wa_profile_name,
                  c.wa_id AS contact_wa_id, s.name AS stage_name, s.color AS stage_color,
                  u.name AS owner_name
             FROM deals d
             JOIN contacts c ON c.id = d.contact_id
             LEFT JOIN deal_stages s ON s.id = d.stage_id
             LEFT JOIN users u ON u.id = d.owner_user_id
             WHERE c.company_id = ?
             ORDER BY d.updated_at DESC`,
        )
        .all(id);

  return NextResponse.json({ company, contacts, deals });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const existing = getCompany(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const fields: string[] = [];
  const values: any[] = [];
  for (const k of ["name", "website", "phone", "address", "industry", "notes"]) {
    if (body[k] !== undefined) {
      if (k === "name" && (!body[k] || !String(body[k]).trim())) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      fields.push(`${k} = ?`);
      values.push(body[k] === "" ? null : body[k]);
    }
  }
  if (body.owner_user_id !== undefined) {
    fields.push("owner_user_id = ?");
    values.push(body.owner_user_id == null ? null : Number(body.owner_user_id));
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db().prepare(`UPDATE companies SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "company.update",
    entityType: "company",
    entityId: id,
    summary: `Updated company "${existing.name}"`,
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
  const existing = getCompany(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Detach contacts (don't delete them — they may have history of their own)
  db().prepare("UPDATE contacts SET company_id = NULL WHERE company_id = ?").run(id);
  db().prepare("DELETE FROM companies WHERE id = ?").run(id);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "company.delete",
    entityType: "company",
    entityId: id,
    summary: `Deleted company "${existing.name}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
