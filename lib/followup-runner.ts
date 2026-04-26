/**
 * Phase 9 — follow-up runner.
 *
 * Two responsibilities:
 *   1. `runFollowupTick()` — called from the scheduler. Picks up any pending
 *      follow-ups whose `due_at` has passed AND `auto_send = 1`, sends the
 *      configured message, marks done. Pending without auto_send just stays
 *      pending → surfaced in the dashboard as "Overdue" so an agent does it.
 *
 *   2. `summarizeFollowups()` — counts for the nav badge.
 */
import { db, touchContact } from "./db";
import { sendText, sendTemplate, type TemplateSendComponent, type TemplateParameter } from "./whatsapp";
import type { VariableMapping } from "./types";

type FollowupRow = {
  id: number;
  contact_id: number;
  title: string;
  note: string | null;
  due_at: string;
  status: string;
  auto_send: number;
  message_kind: string | null;
  message_body: string | null;
  template_name: string | null;
  template_language: string | null;
  variable_mapping: string | null;
  header_json: string | null;
};

type FollowupHeader = {
  type: "image" | "video" | "document";
  media_id?: string;
  link?: string;
  filename?: string;
};

type ContactRow = {
  id: number;
  wa_id: string;
  name: string | null;
  custom_fields: string | null;
  unsubscribed_at: string | null;
  last_inbound_at: string | null;
};

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function interpolate(template: string, contact: ContactRow): string {
  const fields = safeParse<Record<string, string>>(contact.custom_fields, {});
  const pool: Record<string, string> = {
    ...fields,
    name: contact.name || "",
    wa_id: contact.wa_id,
    phone: `+${contact.wa_id}`,
  };
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) => pool[k] ?? "");
}

function withinWindow(lastInbound: string | null): boolean {
  if (!lastInbound) return false;
  const s = lastInbound.includes("T") ? lastInbound : lastInbound.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

function resolveVariable(m: VariableMapping, contact: ContactRow): string {
  if (m.source === "static") return m.value;
  if (m.source === "name") return contact.name || "";
  if (m.source === "wa_id") return `+${contact.wa_id}`;
  if (m.source === "custom_field") {
    const fields = safeParse<Record<string, string>>(contact.custom_fields, {});
    return fields[m.value] || "";
  }
  return "";
}

/**
 * Send the configured message for a follow-up. Returns null on success or an
 * error string.
 */
async function sendFollowupMessage(
  fu: FollowupRow,
  contact: ContactRow,
): Promise<string | null> {
  if (contact.unsubscribed_at) return "contact unsubscribed";
  const kind = fu.message_kind || "text";
  try {
    if (kind === "text") {
      const body = interpolate(fu.message_body || "", contact);
      if (!body.trim()) return "empty message body";
      if (!withinWindow(contact.last_inbound_at)) {
        return "skipped: 24h window closed (use a template instead)";
      }
      const { messageId } = await sendText(contact.wa_id, body);
      db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
           VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
        )
        .run(messageId, contact.id, body);
      touchContact(contact.id);
      return null;
    }
    if (kind === "template") {
      if (!fu.template_name || !fu.template_language) return "template missing name/lang";
      const mapping = safeParse<VariableMapping[]>(fu.variable_mapping, []);
      const values = mapping.map((m) => resolveVariable(m, contact));
      const components: TemplateSendComponent[] = [];
      // Media header (IMAGE/VIDEO/DOCUMENT). Required when the template was
      // approved with a media header — Meta returns #132012 if it's missing.
      const header = safeParse<FollowupHeader | null>(fu.header_json, null);
      if (header && (header.media_id || header.link)) {
        const mediaRef: any = header.media_id
          ? { id: header.media_id }
          : { link: header.link };
        if (header.type === "document" && header.filename) {
          mediaRef.filename = header.filename;
        }
        const param = {
          type: header.type,
          [header.type]: mediaRef,
        } as TemplateParameter;
        components.push({ type: "header", parameters: [param] });
      }
      if (values.length > 0) {
        components.push({
          type: "body",
          parameters: values.map(
            (v) => ({ type: "text", text: v }) as TemplateParameter,
          ),
        });
      }
      const { messageId } = await sendTemplate(
        contact.wa_id,
        fu.template_name,
        fu.template_language,
        components,
      );
      db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, template_name, template_variables, status)
           VALUES (?, ?, 'outbound', 'template', ?, ?, ?, 'sent')`,
        )
        .run(
          messageId,
          contact.id,
          values.join(" · ") || `[follow-up template: ${fu.template_name}]`,
          fu.template_name,
          fu.variable_mapping,
        );
      touchContact(contact.id);
      return null;
    }
    return `unknown message_kind: ${kind}`;
  } catch (e: any) {
    return e?.message || String(e);
  }
}

/**
 * Public: send the message for a single follow-up by id, regardless of due_at.
 * Used by the "Send now" button in the dashboard.
 */
export async function sendFollowupNow(
  followupId: number,
  via: "auto" | "manual" = "manual",
): Promise<{ ok: boolean; error?: string }> {
  const fu = db()
    .prepare("SELECT * FROM followups WHERE id = ?")
    .get(followupId) as FollowupRow | undefined;
  if (!fu) return { ok: false, error: "follow-up not found" };
  if (fu.status !== "pending") return { ok: false, error: `status is ${fu.status}` };

  const contact = db()
    .prepare(
      "SELECT id, wa_id, name, custom_fields, unsubscribed_at, last_inbound_at FROM contacts WHERE id = ?",
    )
    .get(fu.contact_id) as ContactRow | undefined;
  if (!contact) return { ok: false, error: "contact not found" };

  const err = await sendFollowupMessage(fu, contact);
  if (err) {
    db()
      .prepare(
        "UPDATE followups SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .run(err, followupId);
    return { ok: false, error: err };
  }
  db()
    .prepare(
      `UPDATE followups
          SET status = 'done', completed_at = CURRENT_TIMESTAMP,
              completed_via = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    )
    .run(via, followupId);
  return { ok: true };
}

/** Scheduler tick — auto-fire any pending auto-send follow-ups whose time has come. */
export async function runFollowupTick(): Promise<void> {
  const nowIso = new Date().toISOString();
  const due = db()
    .prepare(
      `SELECT id FROM followups
        WHERE status = 'pending' AND auto_send = 1 AND due_at <= ?
        ORDER BY due_at ASC
        LIMIT 50`,
    )
    .all(nowIso) as Array<{ id: number }>;
  for (const row of due) {
    try {
      const r = await sendFollowupNow(row.id, "auto");
      if (!r.ok) {
        // Don't loop-spam: mark as failed so a human can review.
        db()
          .prepare(
            `UPDATE followups
                SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
          )
          .run(r.error || "send failed", row.id);
      }
    } catch (e: any) {
      console.error(`[followup] tick error for #${row.id}`, e);
      db()
        .prepare(
          `UPDATE followups
              SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        )
        .run(e?.message || "tick error", row.id);
    }
  }
}

/** Counts for the nav badge. Cheap query — runs on every page poll. */
export function summarizeFollowups() {
  const nowIso = new Date().toISOString();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndIso = todayEnd.toISOString();

  const overdue = db()
    .prepare(
      "SELECT COUNT(*) as n FROM followups WHERE status = 'pending' AND due_at < ?",
    )
    .get(nowIso) as { n: number };
  const dueToday = db()
    .prepare(
      "SELECT COUNT(*) as n FROM followups WHERE status = 'pending' AND due_at >= ? AND due_at <= ?",
    )
    .get(nowIso, todayEndIso) as { n: number };
  const upcoming = db()
    .prepare(
      "SELECT COUNT(*) as n FROM followups WHERE status = 'pending' AND due_at > ?",
    )
    .get(todayEndIso) as { n: number };

  return {
    overdue: overdue.n,
    due_today: dueToday.n,
    upcoming: upcoming.n,
    badge: overdue.n + dueToday.n,
  };
}
