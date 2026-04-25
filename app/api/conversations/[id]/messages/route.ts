import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const contact = db().prepare("SELECT * FROM contacts WHERE id = ?").get(id);
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  const messages = db()
    .prepare("SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at ASC")
    .all(id);
  db()
    .prepare("UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE contact_id = ? AND direction = 'inbound' AND read_at IS NULL")
    .run(id);
  return NextResponse.json({ contact, messages });
}
