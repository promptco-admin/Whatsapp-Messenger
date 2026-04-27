import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** POST /api/contacts/:id/assign  body: { user_id: number|null } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const contactId = Number(params.id);
  const { user_id } = await req.json().catch(() => ({}));
  if (user_id !== null && typeof user_id !== "number") {
    return NextResponse.json({ error: "user_id must be number or null" }, { status: 400 });
  }
  let assigneeName: string | null = null;
  if (user_id !== null) {
    const u = db()
      .prepare("SELECT id, name FROM users WHERE id = ? AND active = 1")
      .get(user_id) as { id: number; name: string } | undefined;
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    assigneeName = u.name;
  }
  db().prepare("UPDATE contacts SET assigned_user_id = ? WHERE id = ?").run(user_id, contactId);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "contact.assign",
    entityType: "contact",
    entityId: contactId,
    contactId,
    summary: assigneeName
      ? `Assigned contact to ${assigneeName}`
      : `Unassigned contact`,
    metadata: { assigned_user_id: user_id, assignee_name: assigneeName },
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
