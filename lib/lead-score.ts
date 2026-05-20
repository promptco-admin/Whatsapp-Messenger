/**
 * Lead scoring — incrementally update `contacts.lead_score` based on engagement
 * events. Each event also lands in `lead_score_events` for an audit trail.
 *
 * Score ranges (rough):
 *   0–24   cold
 *  25–49   warm
 *  50–74   hot
 *  75+     🔥 super-hot
 *
 * Deltas are deliberately small + additive so a single event can't dominate.
 * Scores decay slowly via `decayStaleScores` (call from scheduler tick).
 */

import { db } from "./db";

export const HOT_LEAD_THRESHOLD = 50;

export type LeadScoreEvent =
  | "fast_reply"
  | "short_link_click"
  | "from_ad_first_touch"
  | "catalog_view"
  | "catalog_inquiry"
  | "deal_quoted"
  | "manual_adjust"
  | "decay";

const DELTAS: Record<LeadScoreEvent, number> = {
  fast_reply: 10,
  short_link_click: 20,
  from_ad_first_touch: 15,
  catalog_view: 5,
  catalog_inquiry: 25,
  deal_quoted: 15,
  manual_adjust: 0,
  decay: 0,
};

export function recordLeadScoreEvent(
  contactId: number,
  kind: LeadScoreEvent,
  reason?: string,
  customDelta?: number,
): number {
  const delta = customDelta != null ? customDelta : DELTAS[kind] || 0;
  if (delta === 0 && kind !== "manual_adjust") return getScore(contactId);

  db()
    .prepare(
      "INSERT INTO lead_score_events (contact_id, kind, delta, reason) VALUES (?, ?, ?, ?)",
    )
    .run(contactId, kind, delta, reason || null);

  const now = new Date().toISOString();
  // Clamp 0..200 so a runaway counter can't go negative or unbounded.
  db()
    .prepare(
      `UPDATE contacts
          SET lead_score = MAX(0, MIN(200, COALESCE(lead_score, 0) + ?)),
              lead_score_updated_at = ?
        WHERE id = ?`,
    )
    .run(delta, now, contactId);

  return getScore(contactId);
}

export function getScore(contactId: number): number {
  const row = db()
    .prepare("SELECT lead_score FROM contacts WHERE id = ?")
    .get(contactId) as { lead_score: number | null } | undefined;
  return row?.lead_score || 0;
}

/**
 * Decay any score that hasn't been touched in 7+ days by 5 points per week.
 * Called from the scheduler tick once per hour (cheap, just an UPDATE).
 */
export function decayStaleScores(): number {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = db()
    .prepare(
      `UPDATE contacts
          SET lead_score = MAX(0, lead_score - 5),
              lead_score_updated_at = CURRENT_TIMESTAMP
        WHERE lead_score > 0
          AND (lead_score_updated_at IS NULL OR lead_score_updated_at < ?)`,
    )
    .run(sevenDaysAgo);
  return res.changes;
}

/**
 * Score a fast inbound reply: if the contact's most recent outbound was within
 * the last 5 minutes (and we haven't already credited the fast_reply for that
 * outbound), award the +10.
 */
export function maybeCreditFastReply(contactId: number): void {
  const lastOut = db()
    .prepare(
      `SELECT id, created_at FROM messages
        WHERE contact_id = ? AND direction = 'outbound'
        ORDER BY id DESC LIMIT 1`,
    )
    .get(contactId) as { id: number; created_at: string } | undefined;
  if (!lastOut) return;
  const iso = lastOut.created_at.includes("T")
    ? lastOut.created_at
    : lastOut.created_at.replace(" ", "T") + "Z";
  const sentAt = new Date(iso).getTime();
  if (isNaN(sentAt)) return;
  const ageMs = Date.now() - sentAt;
  if (ageMs > 5 * 60 * 1000) return;

  // De-dupe: don't credit the same outbound twice
  const dupe = db()
    .prepare(
      `SELECT id FROM lead_score_events
        WHERE contact_id = ? AND kind = 'fast_reply'
          AND reason = ? LIMIT 1`,
    )
    .get(contactId, `msg:${lastOut.id}`);
  if (dupe) return;

  recordLeadScoreEvent(contactId, "fast_reply", `msg:${lastOut.id}`);
}
