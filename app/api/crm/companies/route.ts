import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { listCompanies } from "@/lib/companies";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  return NextResponse.json({ companies: listCompanies() });
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

  const res = db()
    .prepare(
      `INSERT INTO companies (name, website, phone, address, industry, notes,
                               owner_user_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      body.website || null,
      body.phone || null,
      body.address || null,
      body.industry || null,
      body.notes || null,
      body.owner_user_id != null ? Number(body.owner_user_id) : user.id,
      user.id,
    );
  const id = Number(res.lastInsertRowid);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "company.create",
    entityType: "company",
    entityId: id,
    summary: `Created company "${name}"`,
    metadata: { name },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ id });
}
