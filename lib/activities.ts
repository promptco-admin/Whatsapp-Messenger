/**
 * Unified activity feed for the CRM.
 *
 * The CRM's "activity timeline" is a chronological merge of three sources we
 * already write to from the rest of the app:
 *  - `messages` — inbound + outbound WhatsApp messages
 *  - `activity_log` — audit rows (deal moved, follow-up created, contact edited…)
 *  - `contact_notes` — internal notes from the team-inbox sidebar
 *
 * Each source is normalised into a `ActivityItem` so the UI can render one
 * scrolling feed. We pull a generous limit per source then sort + slice in JS,
 * which is fast enough at the volumes we expect (single-tenant, hundreds of
 * messages per contact).
 */
import { db } from "./db";

export type ActivityKind =
  | "message_in"
  | "message_out"
  | "note"
  | "audit";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  contact_id: number;
  contact_name: string | null;
  // Body / summary
  title: string;
  body: string | null;
  // Optional structured detail
  user_name: string | null;
  meta: Record<string, unknown> | null;
};

/**
 * Build a feed for one or more contacts. Most callers pass a single contact
 * (deal timeline) or a small list (company timeline = all the company's
 * contacts). Returns latest first, capped at `limit` (default 200).
 */
export function buildActivityFeed(
  contactIds: number[],
  opts: { limit?: number } = {},
): ActivityItem[] {
  if (contactIds.length === 0) return [];
  const limit = opts.limit ?? 200;
  const placeholders = contactIds.map(() => "?").join(",");
  const PER_SOURCE = Math.max(50, limit);

  const messages = db()
    .prepare(
      `SELECT m.id, m.contact_id, m.direction, m.type, m.body, m.template_name,
              m.status, m.created_at, c.name AS contact_name
         FROM messages m
         LEFT JOIN contacts c ON c.id = m.contact_id
         WHERE m.contact_id IN (${placeholders})
         ORDER BY m.created_at DESC LIMIT ?`,
    )
    .all(...contactIds, PER_SOURCE) as Array<{
    id: number;
    contact_id: number;
    direction: "inbound" | "outbound";
    type: string;
    body: string | null;
    template_name: string | null;
    status: string;
    created_at: string;
    contact_name: string | null;
  }>;

  const audits = db()
    .prepare(
      `SELECT a.id, a.contact_id, a.user_name, a.action, a.summary,
              a.entity_type, a.entity_id, a.metadata_json, a.created_at,
              c.name AS contact_name
         FROM activity_log a
         LEFT JOIN contacts c ON c.id = a.contact_id
         WHERE a.contact_id IN (${placeholders})
         ORDER BY a.created_at DESC LIMIT ?`,
    )
    .all(...contactIds, PER_SOURCE) as Array<{
    id: number;
    contact_id: number;
    user_name: string | null;
    action: string;
    summary: string | null;
    entity_type: string | null;
    entity_id: number | null;
    metadata_json: string | null;
    created_at: string;
    contact_name: string | null;
  }>;

  const notes = db()
    .prepare(
      `SELECT n.id, n.contact_id, n.body, n.created_at,
              u.name AS user_name, c.name AS contact_name
         FROM contact_notes n
         LEFT JOIN users u ON u.id = n.user_id
         LEFT JOIN contacts c ON c.id = n.contact_id
         WHERE n.contact_id IN (${placeholders})
         ORDER BY n.created_at DESC LIMIT ?`,
    )
    .all(...contactIds, PER_SOURCE) as Array<{
    id: number;
    contact_id: number;
    body: string;
    user_name: string | null;
    created_at: string;
    contact_name: string | null;
  }>;

  const items: ActivityItem[] = [];

  for (const m of messages) {
    const isIn = m.direction === "inbound";
    const title = m.template_name
      ? `Sent template: ${m.template_name}`
      : isIn
        ? "Received message"
        : "Sent message";
    items.push({
      id: `m${m.id}`,
      kind: isIn ? "message_in" : "message_out",
      at: m.created_at,
      contact_id: m.contact_id,
      contact_name: m.contact_name,
      title,
      body: m.body || (m.type !== "text" ? `[${m.type}]` : null),
      user_name: null,
      meta: { type: m.type, status: m.status },
    });
  }

  for (const a of audits) {
    let meta: Record<string, unknown> | null = null;
    if (a.metadata_json) {
      try {
        meta = JSON.parse(a.metadata_json);
      } catch {}
    }
    items.push({
      id: `a${a.id}`,
      kind: "audit",
      at: a.created_at,
      contact_id: a.contact_id,
      contact_name: a.contact_name,
      title: a.summary || a.action,
      body: null,
      user_name: a.user_name,
      meta: { action: a.action, entity_type: a.entity_type, entity_id: a.entity_id, ...meta },
    });
  }

  for (const n of notes) {
    items.push({
      id: `n${n.id}`,
      kind: "note",
      at: n.created_at,
      contact_id: n.contact_id,
      contact_name: n.contact_name,
      title: "Internal note",
      body: n.body,
      user_name: n.user_name,
      meta: null,
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, limit);
}
