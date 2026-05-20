import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("all") === "1";
  const where = includeInactive ? "" : "WHERE active = 1";
  const rows = db()
    .prepare(
      `SELECT id, sku, name, description, category, image_url, price_paise, currency, active,
              order_index, meta_retailer_id, meta_catalog_synced_at, created_at, updated_at
         FROM products ${where} ORDER BY order_index ASC, name ASC`,
    )
    .all();
  return NextResponse.json({ products: rows });
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const b = await req.json();
  const name = String(b.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const price_paise = Math.max(0, Math.round(Number(b.price_paise || 0)));
  const sku = b.sku ? String(b.sku).trim() : null;
  const description = b.description ? String(b.description) : null;
  const category = b.category ? String(b.category).trim() : null;
  const image_url = b.image_url ? String(b.image_url).trim() : null;
  const currency = String(b.currency || "INR");
  const order_index = Number(b.order_index || 0);
  const meta_retailer_id = b.meta_retailer_id ? String(b.meta_retailer_id).trim() : null;
  const res = db()
    .prepare(
      `INSERT INTO products (sku, name, description, category, image_url, price_paise, currency, order_index, meta_retailer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sku, name, description, category, image_url, price_paise, currency, order_index, meta_retailer_id);
  return NextResponse.json({ id: res.lastInsertRowid });
}
