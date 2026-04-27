import { db, touchContact } from "./db";
import { sendTemplate, type TemplateSendComponent, type TemplateParameter } from "./whatsapp";
import type { VariableMapping } from "./types";
import { logActivity, logError } from "./audit";

export type BroadcastHeader = {
  type: "image" | "video" | "document";
  media_id?: string;
  link?: string;
  filename?: string;
};

export type BroadcastButton = {
  index: number;
  sub_type: "flow" | "url" | "quick_reply" | "copy_code";
  text?: string;
  payload?: string;
};

export type BroadcastConfig = {
  variable_mapping: VariableMapping[];
  header?: BroadcastHeader;
  buttons?: BroadcastButton[];
};

const SEND_DELAY_MS = 150;

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function resolveVariable(m: VariableMapping, contact: any): string {
  if (m.source === "static") return m.value;
  if (m.source === "name") return contact.name || "";
  if (m.source === "wa_id") return `+${contact.wa_id}`;
  if (m.source === "custom_field") {
    const fields = safeParse<Record<string, string>>(contact.custom_fields, {});
    return fields[m.value] || "";
  }
  return "";
}

function buildComponents(
  config: BroadcastConfig,
  contact: any,
): { components: TemplateSendComponent[]; renderedBody: string } {
  const components: TemplateSendComponent[] = [];
  const values = (config.variable_mapping || []).map((m) => resolveVariable(m, contact));

  if (config.header && (config.header.media_id || config.header.link)) {
    const mediaRef: any = config.header.media_id
      ? { id: config.header.media_id }
      : { link: config.header.link };
    if (config.header.type === "document" && config.header.filename) {
      mediaRef.filename = config.header.filename;
    }
    const param = { type: config.header.type, [config.header.type]: mediaRef } as TemplateParameter;
    components.push({ type: "header", parameters: [param] });
  }

  if (values.length > 0) {
    components.push({
      type: "body",
      parameters: values.map((v) => ({ type: "text", text: v })),
    });
  }

  for (const btn of config.buttons || []) {
    if (btn.sub_type === "flow") {
      components.push({
        type: "button",
        sub_type: "flow",
        index: String(btn.index ?? 0),
        parameters: [
          {
            type: "action",
            action: {
              flow_token: `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            },
          },
        ],
      });
    } else if (btn.sub_type === "url") {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(btn.index ?? 0),
        parameters: [{ type: "text", text: btn.text || "" }],
      });
    } else if (btn.sub_type === "quick_reply") {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(btn.index ?? 0),
        parameters: [{ type: "payload", payload: btn.payload || "" }],
      });
    } else if (btn.sub_type === "copy_code") {
      components.push({
        type: "button",
        sub_type: "copy_code",
        index: String(btn.index ?? 0),
        parameters: [{ type: "text", text: btn.text || "" }],
      });
    }
  }

  return { components, renderedBody: values.join(" · ") };
}

export async function runBroadcast(broadcastId: number) {
  const database = db();
  const broadcast = database.prepare("SELECT * FROM broadcasts WHERE id = ?").get(broadcastId) as
    | any
    | undefined;
  if (!broadcast) return;
  if (broadcast.status !== "pending") return;

  const config: BroadcastConfig = {
    variable_mapping: safeParse(broadcast.variable_mapping, []),
    header: safeParse(broadcast.header_json, undefined),
  };

  database
    .prepare("UPDATE broadcasts SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(broadcastId);

  // Phase 7a: skip contacts who've opted out (STOP). We still fetch them so we
  // can mark their recipient row as skipped, which keeps the broadcast counts honest.
  const recipients = database
    .prepare(
      `SELECT br.id AS recipient_id, br.contact_id, c.wa_id, c.name, c.custom_fields, c.unsubscribed_at
         FROM broadcast_recipients br
         JOIN contacts c ON c.id = br.contact_id
        WHERE br.broadcast_id = ? AND br.status = 'pending'`,
    )
    .all(broadcastId) as any[];

  for (const r of recipients) {
    if (r.unsubscribed_at) {
      database
        .prepare(
          "UPDATE broadcast_recipients SET status = 'failed', error = 'contact unsubscribed' WHERE id = ?",
        )
        .run(r.recipient_id);
      database.prepare("UPDATE broadcasts SET failed = failed + 1 WHERE id = ?").run(broadcastId);
      continue;
    }
    try {
      const { components, renderedBody } = buildComponents(config, r);
      const { messageId } = await sendTemplate(
        r.wa_id,
        broadcast.template_name,
        broadcast.language,
        components,
      );

      database
        .prepare(
          "UPDATE broadcast_recipients SET status = 'sent', wa_message_id = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .run(messageId, r.recipient_id);

      database
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, template_name, template_variables, status)
           VALUES (?, ?, 'outbound', 'template', ?, ?, ?, 'sent')`,
        )
        .run(
          messageId,
          r.contact_id,
          renderedBody || `[broadcast: ${broadcast.template_name}]`,
          broadcast.template_name,
          JSON.stringify(config.variable_mapping),
        );
      touchContact(r.contact_id);

      database.prepare("UPDATE broadcasts SET sent = sent + 1 WHERE id = ?").run(broadcastId);
    } catch (e: any) {
      const msg = e?.message || String(e);
      database
        .prepare("UPDATE broadcast_recipients SET status = 'failed', error = ? WHERE id = ?")
        .run(msg, r.recipient_id);
      database.prepare("UPDATE broadcasts SET failed = failed + 1 WHERE id = ?").run(broadcastId);
      logError({
        source: "broadcast.send",
        message: msg,
        context: {
          broadcast_id: broadcastId,
          recipient_id: r.recipient_id,
          template: broadcast.template_name,
        },
        contactId: r.contact_id,
      });
    }

    await new Promise((res) => setTimeout(res, SEND_DELAY_MS));
  }

  database
    .prepare("UPDATE broadcasts SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(broadcastId);
  // Final summary so admins see the broadcast finish in the activity log.
  const totals = database
    .prepare("SELECT total, sent, delivered, failed, name FROM broadcasts WHERE id = ?")
    .get(broadcastId) as
    | { total: number; sent: number; delivered: number; failed: number; name: string }
    | undefined;
  if (totals) {
    logActivity({
      user: null,
      action: "broadcast.complete",
      entityType: "broadcast",
      entityId: broadcastId,
      summary: `Broadcast "${totals.name}" complete: ${totals.sent}/${totals.total} sent${
        totals.failed ? `, ${totals.failed} failed` : ""
      }`,
      metadata: totals,
    });
  }
}
