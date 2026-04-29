import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { getCompany } from "@/lib/companies";

export const dynamic = "force-dynamic";

/** Attach a contact to this company. Body: { contact_id }. Reassigns if already on another company. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const companyId = Number(params.id);
  const company = getCompany(companyId);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  const body = await req.json();
  const contactId = Number(body.contact_id);
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const contact = db()
    .prepare("SELECT id, name, wa_id FROM contacts WHERE id = ?")
    .get(contactId) as { id: number; name: string | null; wa_id: string } | undefined;
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });

  db().prepare("UPDATE contacts SET company_id = ? WHERE id = ?").run(companyId, contactId);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "company.attach_contact",
    entityType: "company",
    entityId: companyId,
    contactId,
    summary: `Linked ${contact.name || "+" + contact.wa_id} to company "${company.name}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}

/** Detach a contact from the company. Query: ?contact_id=N */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const companyId = Number(params.id);
  const company = getCompany(companyId);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  const url = new URL(req.url);
  const contactId = Number(url.searchParams.get("contact_id"));
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const contact = db()
    .prepare("SELECT id, name, wa_id, company_id FROM contacts WHERE id = ?")
    .get(contactId) as { id: number; name: string | null; wa_id: string; company_id: number | null } | undefined;
  if (!contact || contact.company_id !== companyId) {
    return NextResponse.json({ error: "contact not in this company" }, { status: 404 });
  }

  db().prepare("UPDATE contacts SET company_id = NULL WHERE id = ?").run(contactId);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "company.detach_contact",
    entityType: "company",
    entityId: companyId,
    contactId,
    summary: `Unlinked ${contact.name || "+" + contact.wa_id} from company "${company.name}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
