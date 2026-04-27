import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await req.json();
  const updates: string[] = [];
  const values: any[] = [];
  if (typeof body.name === "string" || body.name === null) {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (Array.isArray(body.tags)) {
    updates.push("tags = ?");
    values.push(JSON.stringify(body.tags));
  }
  if (body.custom_fields && typeof body.custom_fields === "object") {
    updates.push("custom_fields = ?");
    values.push(JSON.stringify(body.custom_fields));
  }
  if (body.assigned_user_id !== undefined) {
    updates.push("assigned_user_id = ?");
    values.push(
      body.assigned_user_id === null || body.assigned_user_id === ""
        ? null
        : Number(body.assigned_user_id),
    );
  }
  // Manual opt-out / opt-in toggle.
  // Body shapes accepted:
  //   { unsubscribed: true }  → set unsubscribed_at = now
  //   { unsubscribed: false } → clear unsubscribed_at (opt back in)
  if (body.unsubscribed !== undefined) {
    updates.push("unsubscribed_at = ?");
    values.push(body.unsubscribed ? new Date().toISOString() : null);
  }

  // Phase 9: pipeline stage move; auto-create a follow-up if the new stage has auto_followup_days.
  let newStageId: number | null | undefined = undefined;
  if (body.pipeline_stage_id !== undefined) {
    newStageId =
      body.pipeline_stage_id === null || body.pipeline_stage_id === ""
        ? null
        : Number(body.pipeline_stage_id);
    updates.push("pipeline_stage_id = ?");
    values.push(newStageId);
  }

  if (updates.length === 0) return NextResponse.json({ ok: true });
  values.push(id);
  db().prepare(`UPDATE contacts SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  // Pipeline-stage moves get their own action so they show up in per-conversation
  // timelines as a distinct event, not buried inside a generic "contact.update".
  if (newStageId !== undefined) {
    const stageRow = newStageId
      ? (db().prepare("SELECT name FROM pipeline_stages WHERE id = ?").get(newStageId) as
          | { name: string }
          | undefined)
      : null;
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "contact.stage_change",
      entityType: "contact",
      entityId: id,
      contactId: id,
      summary: stageRow
        ? `Moved contact to stage "${stageRow.name}"`
        : `Cleared pipeline stage`,
      metadata: { stage_id: newStageId, stage_name: stageRow?.name || null },
      ipAddress: clientIp(req),
    });
  }
  if (body.unsubscribed !== undefined) {
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: body.unsubscribed ? "contact.unsubscribe" : "contact.resubscribe",
      entityType: "contact",
      entityId: id,
      contactId: id,
      summary: body.unsubscribed
        ? `Marked contact as opted-out`
        : `Re-subscribed contact`,
      ipAddress: clientIp(req),
    });
  }
  // Generic update event covers any field changes that didn't get their own log.
  const fields = Object.keys(body).filter(
    (k) => !["unsubscribed", "pipeline_stage_id"].includes(k),
  );
  if (fields.length > 0) {
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "contact.update",
      entityType: "contact",
      entityId: id,
      contactId: id,
      summary: `Updated contact (${fields.join(", ")})`,
      metadata: { fields },
      ipAddress: clientIp(req),
    });
  }

  // After the update, if we moved into a stage with auto_followup_days, schedule a follow-up.
  if (newStageId) {
    const stage = db()
      .prepare(
        "SELECT id, name, auto_followup_days, is_won, is_lost FROM pipeline_stages WHERE id = ?",
      )
      .get(newStageId) as
      | {
          id: number;
          name: string;
          auto_followup_days: number | null;
          is_won: number;
          is_lost: number;
        }
      | undefined;

    if (stage && stage.auto_followup_days && !stage.is_won && !stage.is_lost) {
      // Don't double-schedule if there is already a pending follow-up for this contact in this stage.
      const existing = db()
        .prepare(
          "SELECT id FROM followups WHERE contact_id = ? AND status = 'pending' LIMIT 1",
        )
        .get(id) as { id: number } | undefined;
      if (!existing) {
        const dueAt = new Date(
          Date.now() + stage.auto_followup_days * 24 * 60 * 60_000,
        ).toISOString();
        db()
          .prepare(
            `INSERT INTO followups
              (contact_id, title, due_at, status, auto_send, created_by_user_id)
             VALUES (?, ?, ?, 'pending', 0, ?)`,
          )
          .run(
            id,
            `Follow up — ${stage.name}`,
            dueAt,
            user?.id ?? null,
          );
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  // Snapshot the contact name BEFORE deleting so the audit row has something
  // human-readable (the FK is set to NULL on delete cascade).
  const snap = db()
    .prepare("SELECT name, wa_id FROM contacts WHERE id = ?")
    .get(id) as { name: string | null; wa_id: string } | undefined;
  db().prepare("DELETE FROM contacts WHERE id = ?").run(id);
  if (snap) {
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "contact.delete",
      entityType: "contact",
      entityId: id,
      summary: `Deleted contact ${snap.name || `+${snap.wa_id}`}`,
      metadata: { wa_id: snap.wa_id, name: snap.name },
      ipAddress: clientIp(req),
    });
  }
  return NextResponse.json({ ok: true });
}
