/**
 * Audit + error logging.
 *
 * Two tables:
 *  - activity_log: who did what (user-driven actions, also system events like
 *    a follow-up auto-firing). Powers the in-app Logs page Activity tab and
 *    the per-conversation timeline on each chat.
 *  - error_log: system-level failures (webhook parse errors, send rejections,
 *    runner exceptions). Powers the Errors tab.
 *
 * Both are pruned daily by the scheduler at LOG_RETENTION_DAYS (default 90).
 *
 * All writes are best-effort and silent on failure — auditing should NEVER
 * crash the request that triggered it.
 */
import { db } from "./db";
import type { User } from "./auth";

export const LOG_RETENTION_DAYS = 90;

/**
 * Action vocabulary. Keep stable — used for filtering and per-conversation
 * timelines. Format is `<entity>.<verb>`.
 *
 *   auth: login, logout
 *   message: send (manual user send), system_send (runner-driven)
 *   contact: create, update, delete, import, assign, unsubscribe, stage_change
 *   followup: create, update, delete, send (auto), send_now (manual), snooze, complete, cancel
 *   broadcast: create, cancel, complete
 *   template: create, update, delete
 *   sequence: create, update, delete, enroll
 *   flow: create, update, delete, enroll
 *   auto_reply: create, update, delete
 *   quick_reply: create, update, delete
 *   pipeline_stage: create, update, delete
 *   user: create, update, delete
 *   note: create, update, delete
 */
export type AuditAction = string;

export type AuditUser = Pick<User, "id" | "name" | "role"> | null;

export type LogActivityInput = {
  user: AuditUser;
  action: AuditAction;
  entityType?: string | null;
  entityId?: number | null;
  contactId?: number | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export type LogErrorInput = {
  source: string;
  message: string;
  context?: Record<string, unknown> | null;
  contactId?: number | null;
};

/** Fire-and-forget activity write. Never throws. */
export function logActivity(input: LogActivityInput): void {
  try {
    db()
      .prepare(
        `INSERT INTO activity_log
         (user_id, user_name, user_role, action, entity_type, entity_id,
          contact_id, summary, metadata_json, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.user?.id ?? null,
        input.user?.name ?? null,
        input.user?.role ?? null,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.contactId ?? null,
        input.summary ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ipAddress ?? null,
      );
  } catch (e) {
    // Swallow — audit must never break the caller.
    console.error("[audit] logActivity failed", (e as Error)?.message);
  }
}

/** Fire-and-forget error write. Never throws. */
export function logError(input: LogErrorInput): void {
  try {
    db()
      .prepare(
        `INSERT INTO error_log (source, message, context_json, contact_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        input.source,
        input.message.slice(0, 4000), // safety cap
        input.context ? JSON.stringify(input.context) : null,
        input.contactId ?? null,
      );
  } catch (e) {
    console.error("[audit] logError failed", (e as Error)?.message);
  }
}

/**
 * Delete log rows older than the retention window. Returns the row counts.
 * Called by the scheduler once per hour (cheap on indexed created_at).
 */
export function pruneLogs(retentionDays = LOG_RETENTION_DAYS): {
  activity: number;
  errors: number;
} {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const a = db().prepare("DELETE FROM activity_log WHERE created_at < ?").run(cutoff);
    const e = db().prepare("DELETE FROM error_log WHERE created_at < ?").run(cutoff);
    return { activity: a.changes, errors: e.changes };
  } catch (e) {
    console.error("[audit] pruneLogs failed", (e as Error)?.message);
    return { activity: 0, errors: 0 };
  }
}

/**
 * Pull the IP address from a Next.js Request, honoring proxy headers (so the
 * deployed app behind nginx records the real client IP, not 127.0.0.1).
 */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return null;
}
