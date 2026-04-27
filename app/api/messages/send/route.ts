import { NextResponse } from "next/server";
import { db, upsertContact, touchContact } from "@/lib/db";
import { sendText, sendTemplate, type TemplateSendComponent } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";
import { logActivity, logError, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { wa_id, kind } = body;
  if (!wa_id || typeof wa_id !== "string") {
    return NextResponse.json({ error: "wa_id required" }, { status: 400 });
  }
  const normalized = wa_id.replace(/[^0-9]/g, "");
  const contactId = upsertContact(normalized, body.name ?? null);

  try {
    if (kind === "text") {
      const text = String(body.text || "").trim();
      if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
      const { messageId } = await sendText(normalized, text);
      const res = db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status, sent_by_user_id)
           VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?)`,
        )
        .run(messageId, contactId, text, user.id);
      touchContact(contactId);
      logActivity({
        user: { id: user.id, name: user.name, role: user.role },
        action: "message.send",
        entityType: "message",
        entityId: Number(res.lastInsertRowid),
        contactId,
        summary: `Sent text to +${normalized}: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`,
        metadata: { kind: "text", length: text.length },
        ipAddress: clientIp(req),
      });
      return NextResponse.json({ id: res.lastInsertRowid, messageId });
    }

    if (kind === "template") {
      const name = String(body.template_name || "").trim();
      const language = String(body.language || "en_US");
      const variables: string[] = Array.isArray(body.variables) ? body.variables.map(String) : [];
      const header = body.header as
        | { type: "image" | "video" | "document"; media_id?: string; link?: string; filename?: string }
        | undefined;
      const buttons = (Array.isArray(body.buttons) ? body.buttons : []) as Array<{
        index: number;
        sub_type: "flow" | "url" | "quick_reply" | "copy_code";
        flow_token?: string;
        payload?: string;
        text?: string;
      }>;
      if (!name) return NextResponse.json({ error: "template_name required" }, { status: 400 });

      const components: TemplateSendComponent[] = [];
      if (header && (header.media_id || header.link)) {
        const mediaRef: any = header.media_id ? { id: header.media_id } : { link: header.link };
        if (header.type === "document" && header.filename) mediaRef.filename = header.filename;
        components.push({
          type: "header",
          parameters: [{ type: header.type, [header.type]: mediaRef } as any],
        });
      }
      if (variables.length > 0) {
        components.push({
          type: "body",
          parameters: variables.map((v) => ({ type: "text", text: v })),
        });
      }
      for (const btn of buttons) {
        if (btn.sub_type === "flow") {
          components.push({
            type: "button",
            sub_type: "flow",
            index: String(btn.index ?? 0),
            parameters: [
              {
                type: "action",
                action: { flow_token: btn.flow_token || `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
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
      const { messageId } = await sendTemplate(normalized, name, language, components);
      const renderedBody = body.rendered_body || `[template: ${name}]`;
      // Preserve header media so it can render later in chat history.
      const headerMediaId = header?.media_id || null;
      const headerMediaUrl = header?.link || null;
      const headerMime =
        header?.type === "image"
          ? "image/*"
          : header?.type === "video"
            ? "video/*"
            : header?.type === "document"
              ? "application/octet-stream"
              : null;
      const res = db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, template_name, template_variables, status, sent_by_user_id, media_id, media_url, media_mime, media_filename)
           VALUES (?, ?, 'outbound', 'template', ?, ?, ?, 'sent', ?, ?, ?, ?, ?)`,
        )
        .run(
          messageId,
          contactId,
          renderedBody,
          name,
          JSON.stringify(variables),
          user.id,
          headerMediaId,
          headerMediaUrl,
          headerMime,
          header?.filename || null,
        );
      touchContact(contactId);
      logActivity({
        user: { id: user.id, name: user.name, role: user.role },
        action: "message.send",
        entityType: "message",
        entityId: Number(res.lastInsertRowid),
        contactId,
        summary: `Sent template "${name}" to +${normalized}`,
        metadata: { kind: "template", template: name, language, variables },
        ipAddress: clientIp(req),
      });
      return NextResponse.json({ id: res.lastInsertRowid, messageId });
    }

    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  } catch (e: any) {
    const err = e?.message || String(e);
    db()
      .prepare(
        `INSERT INTO messages (contact_id, direction, type, body, template_name, status, error, sent_by_user_id)
         VALUES (?, 'outbound', ?, ?, ?, 'failed', ?, ?)`,
      )
      .run(
        contactId,
        kind === "template" ? "template" : "text",
        kind === "template" ? body.rendered_body || `[template: ${body.template_name}]` : body.text || "",
        kind === "template" ? body.template_name || null : null,
        err,
        user.id,
      );
    logError({
      source: "messages.send",
      message: err,
      context: { kind, wa_id: normalized, template: body.template_name || null },
      contactId,
    });
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
