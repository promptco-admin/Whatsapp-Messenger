import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function generateShortCode(): string {
  // 5-char base36 — short enough to type, unique within the small business scale
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare(
      `SELECT q.*, u.name AS assignee_name, p.name AS product_name
         FROM qr_sources q
         LEFT JOIN users u ON u.id = q.auto_assign_user_id
         LEFT JOIN products p ON p.id = q.product_id
        ORDER BY q.id DESC`,
    )
    .all();
  return NextResponse.json({ sources: rows });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const label = String(body.label || "").trim();
  const kind = ["product", "technician", "generic"].includes(body.kind) ? body.kind : "generic";
  const prefill_text = String(body.prefill_text || "").trim();
  const auto_tag = body.auto_tag ? String(body.auto_tag).trim() : null;
  const auto_assign_user_id = body.auto_assign_user_id ? Number(body.auto_assign_user_id) : null;
  const product_id = body.product_id ? Number(body.product_id) : null;

  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!prefill_text) return NextResponse.json({ error: "prefill_text required" }, { status: 400 });

  // Retry on rare collisions.
  let short_code = "";
  for (let i = 0; i < 5; i++) {
    short_code = generateShortCode();
    const dupe = db()
      .prepare("SELECT id FROM qr_sources WHERE short_code = ?")
      .get(short_code);
    if (!dupe) break;
  }

  const res = db()
    .prepare(
      `INSERT INTO qr_sources (label, kind, short_code, prefill_text, auto_tag, auto_assign_user_id, product_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(label, kind, short_code, prefill_text, auto_tag, auto_assign_user_id, product_id, user.id);

  return NextResponse.json({ id: res.lastInsertRowid, short_code });
}
