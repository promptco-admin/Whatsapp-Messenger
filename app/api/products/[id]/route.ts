import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FIELDS = [
  "sku",
  "name",
  "description",
  "category",
  "image_url",
  "price_paise",
  "currency",
  "active",
  "order_index",
  "meta_retailer_id",
];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const b = await req.json();
  const set: string[] = [];
  const vals: any[] = [];
  for (const f of FIELDS) {
    if (f in b) {
      set.push(`${f} = ?`);
      vals.push(b[f]);
    }
  }
  if (set.length === 0) return NextResponse.json({ ok: true });
  set.push("updated_at = CURRENT_TIMESTAMP");
  vals.push(id);
  db().prepare(`UPDATE products SET ${set.join(", ")} WHERE id = ?`).run(...vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  db().prepare("DELETE FROM products WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
