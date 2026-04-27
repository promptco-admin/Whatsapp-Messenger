import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare("SELECT id, shortcut, title, body FROM quick_replies ORDER BY title ASC")
    .all();
  return NextResponse.json({ quick_replies: rows });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { shortcut, title, body } = await req.json();
  if (!title || !body) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }
  const res = db()
    .prepare("INSERT INTO quick_replies (shortcut, title, body) VALUES (?, ?, ?)")
    .run((shortcut || "").trim().replace(/^\//, "") || null, String(title).trim(), String(body));
  const id = Number(res.lastInsertRowid);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "quick_reply.create",
    entityType: "quick_reply",
    entityId: id,
    summary: `Created quick reply "${String(title).trim()}"`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ id });
}
