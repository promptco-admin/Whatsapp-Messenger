import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
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
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db().prepare("DELETE FROM quick_replies WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
