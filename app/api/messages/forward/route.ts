import { NextResponse } from "next/server";
import { db, touchContact } from "@/lib/db";
import { sendText } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";
import { logActivity, logError, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ForwardResult = {
  contact_id: number;
  wa_id: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

function within24h(iso: string | null): boolean {
  if (!iso) return false;
  const s = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const body = await req.json();
  const messageId = Number(body.message_id);
  const customText: string | undefined =
    typeof body.text === "string" && body.text.trim() ? String(body.text).trim() : undefined;
  const contactIds: number[] = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(Number).filter(Boolean)
    : [];

  if (!customText && !messageId) {
    return NextResponse.json({ error: "message_id or text required" }, { status: 400 });
  }
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contact_ids required" }, { status: 400 });
  }

  let textToSend = customText || "";
  if (!textToSend && messageId) {
    const src = db()
      .prepare("SELECT body FROM messages WHERE id = ?")
      .get(messageId) as { body: string | null } | undefined;
    if (!src || !src.body) {
      return NextResponse.json({ error: "source message has no text body" }, { status: 400 });
    }
    textToSend = src.body;
  }
  if (!textToSend.trim()) {
    return NextResponse.json({ error: "nothing to forward" }, { status: 400 });
  }

  const placeholders = contactIds.map(() => "?").join(",");
  const rows = db()
    .prepare(
      `SELECT id, wa_id, last_inbound_at, unsubscribed_at
         FROM contacts WHERE id IN (${placeholders})`,
    )
    .all(...contactIds) as Array<{
    id: number;
    wa_id: string;
    last_inbound_at: string | null;
    unsubscribed_at: string | null;
  }>;

  const results: ForwardResult[] = [];

  for (const c of rows) {
    if (c.unsubscribed_at) {
      results.push({
        contact_id: c.id,
        wa_id: c.wa_id,
        status: "skipped",
        reason: "contact unsubscribed",
      });
      continue;
    }
    if (!within24h(c.last_inbound_at)) {
      results.push({
        contact_id: c.id,
        wa_id: c.wa_id,
        status: "skipped",
        reason: "outside 24h window",
      });
      continue;
    }
    try {
      const { messageId: waMsgId } = await sendText(c.wa_id, textToSend);
      const ins = db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status, sent_by_user_id)
           VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?)`,
        )
        .run(waMsgId, c.id, textToSend, user.id);
      touchContact(c.id);
      logActivity({
        user: { id: user.id, name: user.name, role: user.role },
        action: "message.forward",
        entityType: "message",
        entityId: Number(ins.lastInsertRowid),
        contactId: c.id,
        summary: `Forwarded message to +${c.wa_id}`,
        metadata: { source_message_id: messageId || null, length: textToSend.length },
        ipAddress: clientIp(req),
      });
      results.push({ contact_id: c.id, wa_id: c.wa_id, status: "sent" });
      // small spacing to be polite with WhatsApp rate limits
      await new Promise((r) => setTimeout(r, 150));
    } catch (e: any) {
      const err = e?.message || String(e);
      db()
        .prepare(
          `INSERT INTO messages (contact_id, direction, type, body, status, error, sent_by_user_id)
           VALUES (?, 'outbound', 'text', ?, 'failed', ?, ?)`,
        )
        .run(c.id, textToSend, err, user.id);
      logError({
        source: "messages.forward",
        message: err,
        context: { wa_id: c.wa_id, source_message_id: messageId || null },
        contactId: c.id,
      });
      results.push({ contact_id: c.id, wa_id: c.wa_id, status: "failed", reason: err });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({ sent, skipped, failed, results });
}
