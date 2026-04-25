import type { Template } from "./types";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${API_VERSION}/${path}`;
}

async function graphFetch(path: string, init: RequestInit = {}) {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const res = await fetch(graphUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.raw || `HTTP ${res.status}`;
    throw new Error(`WhatsApp API error: ${msg}`);
  }
  return json;
}

export async function sendText(to: string, body: string): Promise<{ messageId: string }> {
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const json = await graphFetch(`${phoneId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body, preview_url: false },
    }),
  });
  return { messageId: json?.messages?.[0]?.id };
}

export type TemplateParameter =
  | { type: "text"; text: string }
  | { type: "image"; image: { link?: string; id?: string } }
  | { type: "video"; video: { link?: string; id?: string } }
  | { type: "document"; document: { link?: string; id?: string; filename?: string } }
  | { type: "payload"; payload: string }
  | { type: "action"; action: { flow_token?: string; flow_action_data?: Record<string, unknown> } };

export type TemplateSendComponent = {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url" | "flow" | "copy_code";
  index?: string;
  parameters: TemplateParameter[];
};

export async function uploadMedia(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  form.append("file", blob, filename);
  const res = await fetch(graphUrl(`${phoneId}/media`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Media upload failed: ${json?.error?.message || json?.raw || res.status}`);
  }
  return json.id;
}

/**
 * Look up a media download URL by media_id. Meta returns a short-lived URL
 * (~5 min) that must be fetched with the same bearer token.
 */
export async function getMediaUrl(
  mediaId: string,
): Promise<{ url: string; mime_type: string | null; file_size: number | null }> {
  const json: any = await graphFetch(mediaId);
  return {
    url: json?.url,
    mime_type: json?.mime_type || null,
    file_size: json?.file_size || null,
  };
}

/**
 * Fetch the raw bytes of a media file by media_id. Returns the binary buffer,
 * content-type, and filename hint. Used by the /api/media/[id] proxy.
 */
export async function downloadMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mime: string; size: number }> {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const meta = await getMediaUrl(mediaId);
  if (!meta.url) throw new Error("no media url");
  const res = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Media download failed: HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const mime = meta.mime_type || res.headers.get("content-type") || "application/octet-stream";
  return { buffer: buf, mime, size: buf.length };
}

export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components?: TemplateSendComponent[],
): Promise<{ messageId: string }> {
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };
  if (components && components.length > 0) payload.template.components = components;
  const json = await graphFetch(`${phoneId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { messageId: json?.messages?.[0]?.id };
}

export async function markRead(messageId: string): Promise<void> {
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  await graphFetch(`${phoneId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

export async function listTemplates(): Promise<Template[]> {
  const wabaId = env("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const all: Template[] = [];
  let url = `${wabaId}/message_templates?limit=200&fields=name,language,status,category,components`;
  while (url) {
    const json: any = await graphFetch(url);
    for (const t of json?.data || []) all.push(t as Template);
    url = json?.paging?.next ? json.paging.next.replace(`https://graph.facebook.com/${API_VERSION}/`, "") : "";
    if (url.startsWith("http")) break;
  }
  return all;
}

export function extractBodyVariableCount(tpl: Template): number {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

export function renderTemplateBody(tpl: Template, vars: string[]): string {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return "";
  return body.text.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] ?? `{{${n}}}`);
}
