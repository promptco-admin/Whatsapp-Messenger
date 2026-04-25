import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const contactId = Number(params.id);
  const rows = db()
    .prepare(
      `SELECT n.id, n.body, n.created_at, u.name AS author_name, u.id AS user_id
       FROM contact_notes n JOIN users u ON n.user_id = u.id
       WHERE n.contact_id = ?
       ORDER BY n.created_at DESC`,
    )
    .all(contactId);
  return NextResponse.json({ notes: rows });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const contactId = Number(params.id);
  const { body } = await req.json().catch(() => ({}));
  if (!body || !String(body).trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  const res = db()
    .prepare("INSERT INTO contact_notes (contact_id, user_id, body) VALUES (?, ?, ?)")
    .run(contactId, user.id, String(body).trim());
  return NextResponse.json({ id: res.lastInsertRowid });
}
