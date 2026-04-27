import { db, touchContact } from "./db";
import { sendTemplate, type TemplateSendComponent, type TemplateParameter } from "./whatsapp";
import type { VariableMapping } from "./types";
import { logError } from "./audit";

type EnrollmentRow = {
  enrollment_id: number;
  sequence_id: number;
  contact_id: number;
  current_step: number;
  wa_id: string;
  name: string | null;
  custom_fields: string;
  unsubscribed_at: string | null;
};

type StepRow = {
  id: number;
  sequence_id: number;
  order_index: number;
  template_name: string;
  language: string;
  variable_mapping: string | null;
  header_json: string | null;
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
};

type HeaderJson = {
  type: "image" | "video" | "document";
  media_id?: string;
  link?: string;
  filename?: string;
};

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function resolveVariable(m: VariableMapping, contact: { name: string | null; wa_id: string; custom_fields: string }): string {
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
  step: StepRow,
  contact: { name: string | null; wa_id: string; custom_fields: string },
): { components: TemplateSendComponent[]; renderedBody: string } {
  const components: TemplateSendComponent[] = [];
  const mapping = safeParse<VariableMapping[]>(step.variable_mapping, []);
  const values = mapping.map((m) => resolveVariable(m, contact));

  const header = safeParse<HeaderJson | null>(step.header_json, null);
  if (header && (header.media_id || header.link)) {
    const mediaRef: any = header.media_id ? { id: header.media_id } : { link: header.link };
    if (header.type === "document" && header.filename) mediaRef.filename = header.filename;
    const param = { type: header.type, [header.type]: mediaRef } as TemplateParameter;
    components.push({ type: "header", parameters: [param] });
  }

  if (values.length > 0) {
    components.push({
      type: "body",
      parameters: values.map((v) => ({ type: "text", text: v })),
    });
  }

  return { components, renderedBody: values.join(" · ") };
}

function computeNextRunAt(step: StepRow | null): string | null {
  if (!step) return null;
  const now = Date.now();
  const ms =
    step.delay_days * 24 * 60 * 60 * 1000 +
    step.delay_hours * 60 * 60 * 1000 +
    step.delay_minutes * 60 * 1000;
  return new Date(now + ms).toISOString();
}

/**
 * Called every scheduler tick. Advances any sequence enrollments whose
 * next_run_at is due: sends the current step's template, then either
 * queues the next step (with its delay) or marks the enrollment complete.
 */
export async function runSequenceTick() {
  const database = db();
  const nowIso = new Date().toISOString();

  const due = database
    .prepare(
      `SELECT se.id AS enrollment_id, se.sequence_id, se.contact_id, se.current_step,
              c.wa_id, c.name, c.custom_fields, c.unsubscribed_at
         FROM sequence_enrollments se
         JOIN contacts c ON c.id = se.contact_id
        WHERE se.status = 'active'
          AND se.next_run_at IS NOT NULL
          AND se.next_run_at <= ?`,
    )
    .all(nowIso) as EnrollmentRow[];

  for (const e of due) {
    // Phase 7a: skip opted-out contacts.
    if (e.unsubscribed_at) {
      database
        .prepare(
          "UPDATE sequence_enrollments SET status = 'failed', last_error = 'contact unsubscribed', next_run_at = NULL WHERE id = ?",
        )
        .run(e.enrollment_id);
      continue;
    }
    // Load the step to send (current_step is 0-indexed).
    const step = database
      .prepare(
        `SELECT id, sequence_id, order_index, template_name, language, variable_mapping,
                header_json, delay_days, delay_hours, delay_minutes
           FROM sequence_steps
          WHERE sequence_id = ? AND order_index = ?`,
      )
      .get(e.sequence_id, e.current_step) as StepRow | undefined;

    if (!step) {
      // No more steps — mark completed.
      database
        .prepare(
          "UPDATE sequence_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP, next_run_at = NULL WHERE id = ?",
        )
        .run(e.enrollment_id);
      continue;
    }

    try {
      const { components, renderedBody } = buildComponents(step, e);
      const { messageId } = await sendTemplate(
        e.wa_id,
        step.template_name,
        step.language,
        components,
      );

      database
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, template_name, template_variables, status)
           VALUES (?, ?, 'outbound', 'template', ?, ?, ?, 'sent')`,
        )
        .run(
          messageId,
          e.contact_id,
          renderedBody || `[sequence: ${step.template_name}]`,
          step.template_name,
          step.variable_mapping,
        );
      touchContact(e.contact_id);

      // Find the NEXT step after this one.
      const nextStep = database
        .prepare(
          `SELECT id, sequence_id, order_index, template_name, language, variable_mapping,
                  header_json, delay_days, delay_hours, delay_minutes
             FROM sequence_steps
            WHERE sequence_id = ? AND order_index = ?`,
        )
        .get(e.sequence_id, e.current_step + 1) as StepRow | undefined;

      if (nextStep) {
        database
          .prepare(
            "UPDATE sequence_enrollments SET current_step = ?, next_run_at = ?, last_error = NULL WHERE id = ?",
          )
          .run(
            e.current_step + 1,
            computeNextRunAt(nextStep),
            e.enrollment_id,
          );
      } else {
        database
          .prepare(
            "UPDATE sequence_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP, next_run_at = NULL, last_error = NULL WHERE id = ?",
          )
          .run(e.enrollment_id);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[sequence] enrollment #${e.enrollment_id} step ${e.current_step} failed:`, msg);
      database
        .prepare(
          "UPDATE sequence_enrollments SET status = 'failed', last_error = ? WHERE id = ?",
        )
        .run(msg, e.enrollment_id);
      logError({
        source: "sequence.send",
        message: msg,
        context: {
          enrollment_id: e.enrollment_id,
          sequence_id: e.sequence_id,
          step: e.current_step,
        },
        contactId: e.contact_id,
      });
    }

    // Small delay between sends (rate-limit friendly).
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Enroll a contact into a sequence. Queues step 0 to run immediately (or
 * after its configured delay if any).
 */
export function enrollContact(sequenceId: number, contactId: number): { ok: boolean; error?: string } {
  const database = db();

  const firstStep = database
    .prepare(
      `SELECT id, sequence_id, order_index, template_name, language, variable_mapping,
              header_json, delay_days, delay_hours, delay_minutes
         FROM sequence_steps
        WHERE sequence_id = ? AND order_index = 0`,
    )
    .get(sequenceId) as StepRow | undefined;

  if (!firstStep) return { ok: false, error: "Sequence has no steps" };

  const nextRunAt = computeNextRunAt(firstStep);

  try {
    database
      .prepare(
        `INSERT INTO sequence_enrollments (sequence_id, contact_id, current_step, status, next_run_at)
         VALUES (?, ?, 0, 'active', ?)`,
      )
      .run(sequenceId, contactId, nextRunAt);
    return { ok: true };
  } catch (e: any) {
    // UNIQUE constraint likely — already enrolled.
    if (String(e.message || "").includes("UNIQUE")) {
      return { ok: false, error: "Contact already enrolled in this sequence" };
    }
    return { ok: false, error: e.message || String(e) };
  }
}
