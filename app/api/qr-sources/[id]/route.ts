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
  const body = await req.json();
  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ["label", "kind", "prefill_text", "auto_tag", "auto_assign_user_id", "product_id"]) {
    if (k in body) {
      fields.push(`${k} = ?`);
      vals.push(body[k]);
    }
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  vals.push(id);
  db()
    .prepare(`UPDATE qr_sources SET ${fields.join(", ")} WHERE id = ?`)
    .run(...vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  db().prepare("DELETE FROM qr_sources WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
