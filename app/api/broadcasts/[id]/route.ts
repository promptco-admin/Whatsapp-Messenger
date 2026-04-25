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
  const broadcast = db().prepare("SELECT * FROM broadcasts WHERE id = ?").get(id);
  if (!broadcast) return NextResponse.json({ error: "not found" }, { status: 404 });
  const recipients = db()
    .prepare(
      `SELECT br.id, br.status, br.wa_message_id, br.error, br.sent_at, c.wa_id, c.name
         FROM broadcast_recipients br
         JOIN contacts c ON c.id = br.contact_id
        WHERE br.broadcast_id = ?
        ORDER BY br.id ASC`,
    )
    .all(id);
  return NextResponse.json({ broadcast, recipients });
}
