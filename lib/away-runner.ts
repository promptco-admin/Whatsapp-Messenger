/**
 * Phase 8: away-message runner.
 *
 * When a customer messages us OUTSIDE the configured working hours, send a
 * single polite ack ("We're closed — will reply tomorrow at 9am"). Once per
 * `cooldown_minutes` per contact to avoid spam.
 *
 * Config shape (settings_kv key 'away_message'):
 *   {
 *     enabled: boolean,
 *     text: string,                 // e.g. "Hi {{name}} 👋 we're closed..."
 *     cooldown_minutes: number,     // default 360 (6h)
 *     hours: HoursConfig            // WHEN TO NOT FIRE (i.e., business hours)
 *   }
 *
 * We fire when `withinHoursConfig(hours)` is FALSE.
 */
import { db, getSetting, touchContact } from "./db";
import { sendText } from "./whatsapp";
import { withinHoursConfig, type HoursConfig } from "./hours";

export type AwayMessageConfig = {
  enabled?: boolean;
  text?: string;
  cooldown_minutes?: number;
  hours?: HoursConfig;
};

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
}

export async function runAwayMessage(
  contactId: number,
  messageBody: string | null,
): Promise<{ fired: boolean; reason?: string }> {
  if (!messageBody || !messageBody.trim()) return { fired: false, reason: "empty" };

  const cfg = getSetting<AwayMessageConfig>("away_message", {});
  if (!cfg.enabled) return { fired: false, reason: "disabled" };
  if (!cfg.text || !cfg.text.trim()) return { fired: false, reason: "no text" };

  // If we're INSIDE business hours, don't fire.
  if (withinHoursConfig(cfg.hours ?? null)) return { fired: false, reason: "in-hours" };

  const cooldown = Math.max(1, Number(cfg.cooldown_minutes ?? 360));
  const since = new Date(Date.now() - cooldown * 60_000).toISOString();
  const recent = db()
    .prepare(
      "SELECT id FROM away_message_fires WHERE contact_id = ? AND fired_at > ? LIMIT 1",
    )
    .get(contactId, since);
  if (recent) return { fired: false, reason: "cooldown" };

  const contact = db()
    .prepare("SELECT id, wa_id, name FROM contacts WHERE id = ?")
    .get(contactId) as { id: number; wa_id: string; name: string | null } | undefined;
  if (!contact) return { fired: false, reason: "no contact" };

  const text = interpolate(cfg.text, {
    name: contact.name || "",
    phone: `+${contact.wa_id}`,
    wa_id: contact.wa_id,
  });

  try {
    const { messageId } = await sendText(contact.wa_id, text);
    db()
      .prepare(
        `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
         VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
      )
      .run(messageId, contactId, text);
    db()
      .prepare("INSERT INTO away_message_fires (contact_id) VALUES (?)")
      .run(contactId);
    touchContact(contactId);
    return { fired: true };
  } catch (e: any) {
    console.error("[away] send failed", e);
    return { fired: false, reason: e?.message || "send failed" };
  }
}
