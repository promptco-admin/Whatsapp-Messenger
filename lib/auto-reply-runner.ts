import { db, touchContact } from "./db";
import { sendText, sendTemplate, type TemplateSendComponent, type TemplateParameter } from "./whatsapp";
import type { VariableMapping } from "./types";
import { withinHoursConfig } from "./hours";

type AutoReplyRule = {
  id: number;
  name: string;
  trigger_keyword: string;
  match_type: "exact" | "contains" | "starts_with";
  response_kind: "text" | "template";
  response_text: string | null;
  template_name: string | null;
  template_language: string | null;
  variable_mapping: string | null;
  cooldown_minutes: number;
  active: number;
  priority: number;
  hours_json: string | null;
};

/**
 * Thin wrapper around the shared helper for backwards-compat inside this file.
 * Full logic lives in lib/hours.ts so the away-runner can reuse it.
 */
function withinHours(rule: AutoReplyRule): boolean {
  return withinHoursConfig(rule.hours_json);
}

type ContactRow = {
  id: number;
  wa_id: string;
  name: string | null;
  custom_fields: string;
};

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function matches(rule: AutoReplyRule, messageBody: string): boolean {
  const haystack = messageBody.toLowerCase().trim();
  const needle = rule.trigger_keyword.toLowerCase().trim();
  if (!needle) return false;
  switch (rule.match_type) {
    case "exact":
      return haystack === needle;
    case "starts_with":
      return haystack.startsWith(needle);
    case "contains":
    default:
      return haystack.includes(needle);
  }
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

function withinCooldown(ruleId: number, contactId: number, cooldownMinutes: number): boolean {
  if (cooldownMinutes <= 0) return false;
  const since = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
  const row = db()
    .prepare(
      "SELECT id FROM auto_reply_fires WHERE rule_id = ? AND contact_id = ? AND fired_at > ? LIMIT 1",
    )
    .get(ruleId, contactId, since);
  return !!row;
}

function logFire(ruleId: number, contactId: number) {
  const database = db();
  database
    .prepare("INSERT INTO auto_reply_fires (rule_id, contact_id) VALUES (?, ?)")
    .run(ruleId, contactId);
  database
    .prepare(
      "UPDATE auto_replies SET fire_count = fire_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run(ruleId);
}

/**
 * Called from the webhook after an inbound text-like message is stored.
 * Finds the first matching active rule (ordered by priority DESC, id ASC),
 * respects per-contact cooldown, and fires the reply.
 */
export async function runKeywordReplies(
  contactId: number,
  messageBody: string | null,
): Promise<{ fired: number | null; ruleId?: number; error?: string }> {
  if (!messageBody || !messageBody.trim()) return { fired: null };

  const database = db();
  const contact = database
    .prepare("SELECT id, wa_id, name, custom_fields FROM contacts WHERE id = ?")
    .get(contactId) as ContactRow | undefined;
  if (!contact) return { fired: null };

  const rules = database
    .prepare(
      `SELECT id, name, trigger_keyword, match_type, response_kind, response_text,
              template_name, template_language, variable_mapping, cooldown_minutes,
              active, priority, hours_json
         FROM auto_replies
        WHERE active = 1
        ORDER BY priority DESC, id ASC`,
    )
    .all() as AutoReplyRule[];

  for (const rule of rules) {
    if (!matches(rule, messageBody)) continue;
    if (!withinHours(rule)) continue;
    if (withinCooldown(rule.id, contactId, rule.cooldown_minutes)) continue;

    try {
      if (rule.response_kind === "text") {
        const body = rule.response_text || "";
        if (!body.trim()) continue;
        const { messageId } = await sendText(contact.wa_id, body);
        database
          .prepare(
            `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
             VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
          )
          .run(messageId, contactId, body);
        touchContact(contactId);
      } else if (rule.response_kind === "template") {
        if (!rule.template_name || !rule.template_language) continue;
        const mapping = safeParse<VariableMapping[]>(rule.variable_mapping, []);
        const values = mapping.map((m) => resolveVariable(m, contact));
        const components: TemplateSendComponent[] = [];
        if (values.length > 0) {
          components.push({
            type: "body",
            parameters: values.map((v) => ({ type: "text", text: v }) as TemplateParameter),
          });
        }
        const { messageId } = await sendTemplate(
          contact.wa_id,
          rule.template_name,
          rule.template_language,
          components,
        );
        database
          .prepare(
            `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, template_name, template_variables, status)
             VALUES (?, ?, 'outbound', 'template', ?, ?, ?, 'sent')`,
          )
          .run(
            messageId,
            contactId,
            values.join(" · ") || `[auto-reply: ${rule.template_name}]`,
            rule.template_name,
            rule.variable_mapping,
          );
        touchContact(contactId);
      }

      logFire(rule.id, contactId);
      return { fired: rule.id, ruleId: rule.id };
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error(`[auto-reply] rule #${rule.id} failed:`, msg);
      // Don't log a fire if the send failed — let it retry on the next inbound.
      return { fired: null, ruleId: rule.id, error: msg };
    }
  }

  return { fired: null };
}
