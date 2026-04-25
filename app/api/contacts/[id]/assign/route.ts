import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/contacts/:id/assign  body: { user_id: number|null } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const contactId = Number(params.id);
  const { user_id } = await req.json().catch(() => ({}));
  if (user_id !== null && typeof user_id !== "number") {
    return NextResponse.json({ error: "user_id must be number or null" }, { status: 400 });
  }
  if (user_id !== null) {
    const u = db().prepare("SELECT id FROM users WHERE id = ? AND active = 1").get(user_id);
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  db().prepare("UPDATE contacts SET assigned_user_id = ? WHERE id = ?").run(user_id, contactId);
  return NextResponse.json({ ok: true });
}
