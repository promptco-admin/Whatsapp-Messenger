import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { shortcut, title, body } = await req.json();
  db()
    .prepare(
      "UPDATE quick_replies SET shortcut = ?, title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run((shortcut || "").trim().replace(/^\//, "") || null, String(title).trim(), String(body), id);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "quick_reply.update",
    entityType: "quick_reply",
    entityId: id,
    summary: `Edited quick reply "${String(title).trim()}"`,
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
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const snap = db().prepare("SELECT title FROM quick_replies WHERE id = ?").get(id) as
    | { title: string }
    | undefined;
  db().prepare("DELETE FROM quick_replies WHERE id = ?").run(id);
  if (snap) {
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "quick_reply.delete",
      entityType: "quick_reply",
      entityId: id,
      summary: `Deleted quick reply "${snap.title}"`,
      ipAddress: clientIp(req),
    });
  }
  return NextResponse.json({ ok: true });
}
