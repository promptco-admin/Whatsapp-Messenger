/**
 * CSAT (customer satisfaction) — send a 1–5 score request 7 days after a
 * deal moves to Won, then capture the numeric reply.
 *
 * - Trigger: deals with status='won', closed_at <= now - 7d, no existing
 *   csat_requests row, and a contact in 24h window (free-form text only).
 *   Contacts outside the window are skipped (we don't fall back to template
 *   here — Sid can add a CSAT template later if needed).
 * - Capture: webhook calls `captureCsatReply(contactId, body)` for every
 *   text-like inbound. If the body parses to 1–5 and there's a pending
 *   request from the last 14 days, we record the score.
 */

import { db, touchContact } from "./db";
import { sendText } from "./whatsapp";

const CSAT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const CSAT_VALID_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function within24h(iso: string | null): boolean {
  if (!iso) return false;
  const s = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

const CSAT_PROMPT = (name: string | null) =>
  `Hi${name ? " " + name : ""}, thanks for choosing Prompt Group! ` +
  `How would you rate your experience on a scale of 1 to 5? ` +
  `(1 = very poor, 5 = excellent). Reply with a number — and any comment you'd like to share.`;

export async function runCsatTick(): Promise<{ sent: number; skipped: number }> {
  const cutoff = new Date(Date.now() - CSAT_DELAY_MS).toISOString();
  // Won deals 7+ days old with no existing csat request.
  const eligible = db()
    .prepare(
      `SELECT d.id AS deal_id, d.contact_id, c.wa_id, c.name, c.last_inbound_at, c.unsubscribed_at
         FROM deals d
         JOIN contacts c ON c.id = d.contact_id
        WHERE d.status = 'won'
          AND d.closed_at IS NOT NULL
          AND d.closed_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM csat_requests r
             WHERE r.deal_id = d.id
          )
        LIMIT 25`,
    )
    .all(cutoff) as Array<{
    deal_id: number;
    contact_id: number;
    wa_id: string;
    name: string | null;
    last_inbound_at: string | null;
    unsubscribed_at: string | null;
  }>;

  let sent = 0;
  let skipped = 0;
  for (const row of eligible) {
    if (row.unsubscribed_at) {
      skipped++;
      continue;
    }
    if (!within24h(row.last_inbound_at)) {
      // Skip silently — Sid can add a CSAT template later for these.
      skipped++;
      continue;
    }
    try {
      const text = CSAT_PROMPT(row.name);
      const { messageId } = await sendText(row.wa_id, text);
      db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
           VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
        )
        .run(messageId, row.contact_id, text);
      db()
        .prepare(
          "INSERT INTO csat_requests (deal_id, contact_id) VALUES (?, ?)",
        )
        .run(row.deal_id, row.contact_id);
      touchContact(row.contact_id);
      sent++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.error("[csat] send error", e);
      skipped++;
    }
  }

  return { sent, skipped };
}

/**
 * Called from webhook for every text-like inbound. If body is a bare 1–5
 * (optionally followed by a comment) and there's a pending CSAT request for
 * this contact, record the response. Returns true if it captured.
 */
export function captureCsatReply(contactId: number, body: string): boolean {
  // Look for a digit 1–5 at the very start of the trimmed body.
  const trimmed = body.trim();
  const m = trimmed.match(/^([1-5])(?:\D.*)?$/s);
  if (!m) return false;
  const score = Number(m[1]);
  const comment = trimmed.length > 1 ? trimmed.slice(1).trim().replace(/^[^a-zA-Z0-9]+/, "") : null;

  const validAfter = new Date(Date.now() - CSAT_VALID_WINDOW_MS).toISOString();
  const pending = db()
    .prepare(
      `SELECT id FROM csat_requests
        WHERE contact_id = ?
          AND responded_at IS NULL
          AND requested_at >= ?
        ORDER BY id DESC LIMIT 1`,
    )
    .get(contactId, validAfter) as { id: number } | undefined;

  if (!pending) return false;

  db()
    .prepare(
      `UPDATE csat_requests
          SET responded_at = CURRENT_TIMESTAMP, score = ?, comment = ?
        WHERE id = ?`,
    )
    .run(score, comment || null, pending.id);

  return true;
}

export function getCsatSummary({ days }: { days?: number } = {}): {
  total_sent: number;
  total_responded: number;
  response_rate: number;
  avg_score: number | null;
  distribution: Record<string, number>;
  low_scores: Array<{ id: number; contact_id: number; score: number; comment: string | null; responded_at: string }>;
} {
  const since = days
    ? new Date(Date.now() - days * 86_400_000).toISOString()
    : new Date(0).toISOString();
  const sentRow = db()
    .prepare("SELECT COUNT(*) AS n FROM csat_requests WHERE requested_at >= ?")
    .get(since) as { n: number };
  const respRow = db()
    .prepare(
      "SELECT COUNT(*) AS n, AVG(score) AS avg FROM csat_requests WHERE requested_at >= ? AND score IS NOT NULL",
    )
    .get(since) as { n: number; avg: number | null };
  const dist = db()
    .prepare(
      "SELECT score, COUNT(*) AS n FROM csat_requests WHERE requested_at >= ? AND score IS NOT NULL GROUP BY score",
    )
    .all(since) as Array<{ score: number; n: number }>;
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const d of dist) distribution[String(d.score)] = d.n;
  const lowScores = db()
    .prepare(
      `SELECT id, contact_id, score, comment, responded_at
         FROM csat_requests
        WHERE requested_at >= ? AND score IS NOT NULL AND score <= 3
        ORDER BY responded_at DESC LIMIT 20`,
    )
    .all(since) as Array<{
    id: number;
    contact_id: number;
    score: number;
    comment: string | null;
    responded_at: string;
  }>;
  return {
    total_sent: sentRow.n,
    total_responded: respRow.n,
    response_rate: sentRow.n > 0 ? respRow.n / sentRow.n : 0,
    avg_score: respRow.avg != null ? Number(respRow.avg.toFixed(2)) : null,
    distribution,
    low_scores: lowScores,
  };
}
