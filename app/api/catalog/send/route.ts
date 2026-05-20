import { NextResponse } from "next/server";
import { db, touchContact } from "@/lib/db";
import { sendText } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { recordLeadScoreEvent } from "@/lib/lead-score";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Send a numbered product catalog as a free-form text message.
 *
 * Each line carries a `[PROD-<id>]` marker so we can map a customer's reply
 * (e.g. "I want #2" or "interested in [PROD-7]") back to the actual product.
 *
 * Requires the 24h window (free-form text). If Sid later sets up a Meta
 * Catalog (catalog_id + retailer_ids), we'll add a `mode=interactive` branch
 * here that uses the WhatsApp `interactive { type: "product_list" }` payload.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const contactId = Number(body.contact_id);
  const productIds: number[] = Array.isArray(body.product_ids)
    ? body.product_ids.map(Number).filter(Boolean)
    : [];
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const contact = db()
    .prepare("SELECT id, wa_id, last_inbound_at FROM contacts WHERE id = ?")
    .get(contactId) as { id: number; wa_id: string; last_inbound_at: string | null } | undefined;
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });

  // 24h window check
  const iso = contact.last_inbound_at
    ? contact.last_inbound_at.includes("T")
      ? contact.last_inbound_at
      : contact.last_inbound_at.replace(" ", "T") + "Z"
    : null;
  const inWindow = iso ? Date.now() - new Date(iso).getTime() < 86_400_000 : false;
  if (!inWindow) {
    return NextResponse.json(
      { error: "24h window closed — send a template instead" },
      { status: 400 },
    );
  }

  // Resolve product rows. If no ids given, send all active products.
  const placeholders = productIds.length ? productIds.map(() => "?").join(",") : "";
  const rows = productIds.length
    ? (db()
        .prepare(
          `SELECT id, sku, name, description, price_paise, currency
             FROM products WHERE id IN (${placeholders}) AND active = 1 ORDER BY order_index ASC`,
        )
        .all(...productIds) as Array<any>)
    : (db()
        .prepare(
          `SELECT id, sku, name, description, price_paise, currency
             FROM products WHERE active = 1 ORDER BY order_index ASC`,
        )
        .all() as Array<any>);

  if (rows.length === 0) {
    return NextResponse.json({ error: "no active products to send" }, { status: 400 });
  }

  const lines: string[] = ["*Our products & services*", ""];
  rows.forEach((p, i) => {
    const price = p.price_paise > 0 ? ` — ${formatPaise(p.price_paise)}` : "";
    lines.push(`${i + 1}. *${p.name}*${price}  [PROD-${p.id}]`);
    if (p.description) {
      // Keep each item compact — a short blurb only.
      const blurb = String(p.description).slice(0, 140);
      lines.push(`   ${blurb}`);
    }
  });
  lines.push("");
  lines.push(`Reply with the number (e.g. *2*) for any of the above.`);

  const text = lines.join("\n");

  try {
    const { messageId } = await sendText(contact.wa_id, text);
    const ins = db()
      .prepare(
        `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status, sent_by_user_id)
         VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?)`,
      )
      .run(messageId, contactId, text, user.id);
    db()
      .prepare(
        "INSERT INTO catalog_sends (contact_id, sent_by_user_id, product_ids) VALUES (?, ?, ?)",
      )
      .run(contactId, user.id, JSON.stringify(rows.map((r) => r.id)));
    touchContact(contactId);
    try {
      recordLeadScoreEvent(contactId, "catalog_view");
    } catch {}
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "catalog.send",
      contactId,
      summary: `Sent catalog (${rows.length} products) to +${contact.wa_id}`,
      metadata: { product_ids: rows.map((r) => r.id) },
      ipAddress: clientIp(req),
    });
    return NextResponse.json({ message_id: ins.lastInsertRowid, product_count: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
