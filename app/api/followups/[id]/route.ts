import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendFollowupNow } from "@/lib/followup-runner";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/followups/:id
 * Body: any subset of {
 *   title, note, due_at, status ('done'|'cancelled'|'snoozed'|'pending'),
 *   auto_send, message_kind, message_body, template_name, template_language,
 *   variable_mapping, assigned_user_id, snooze_minutes
 * }
 *
 * Special: { action: 'send_now' } triggers an immediate auto-fire.
 *          { action: 'snooze', minutes: N } reschedules due_at by N minutes from now.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await req.json();

  if (body.action === "send_now") {
    const r = await sendFollowupNow(id, "manual");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "snooze") {
    const minutes = Math.max(1, Math.min(60 * 24 * 90, Number(body.minutes ?? 60)));
    const newDue = new Date(Date.now() + minutes * 60_000).toISOString();
    db()
      .prepare(
        "UPDATE followups SET due_at = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .run(newDue, id);
    return NextResponse.json({ ok: true, due_at: newDue });
  }

  const cols: string[] = [];
  const vals: any[] = [];

  for (const f of [
    "title",
    "note",
    "message_kind",
    "message_body",
    "template_name",
    "template_language",
    "status",
  ] as const) {
    if (body[f] !== undefined) {
      cols.push(`${f} = ?`);
      vals.push(body[f] === null ? null : String(body[f]));
    }
  }

  if (body.due_at !== undefined) {
    const t = new Date(body.due_at);
    if (isNaN(t.getTime()))
      return NextResponse.json({ error: "due_at invalid" }, { status: 400 });
    cols.push("due_at = ?");
    vals.push(t.toISOString());
  }
  if (body.auto_send !== undefined) {
    cols.push("auto_send = ?");
    vals.push(body.auto_send ? 1 : 0);
  }
  if (body.assigned_user_id !== undefined) {
    cols.push("assigned_user_id = ?");
    vals.push(body.assigned_user_id ? Number(body.assigned_user_id) : null);
  }
  if (body.variable_mapping !== undefined) {
    cols.push("variable_mapping = ?");
    vals.push(body.variable_mapping ? JSON.stringify(body.variable_mapping) : null);
  }
  if (body.header !== undefined) {
    cols.push("header_json = ?");
    vals.push(
      body.header && typeof body.header === "object" && body.header.type
        ? JSON.stringify({
            type: String(body.header.type),
            media_id: body.header.media_id ? String(body.header.media_id) : undefined,
            link: body.header.link ? String(body.header.link) : undefined,
            filename: body.header.filename ? String(body.header.filename) : undefined,
          })
        : null,
    );
  }

  if (body.status === "done" || body.status === "cancelled") {
    cols.push("completed_at = CURRENT_TIMESTAMP");
    cols.push("completed_via = ?");
    vals.push("manual");
  }

  if (cols.length === 0) return NextResponse.json({ ok: true });
  cols.push("updated_at = CURRENT_TIMESTAMP");
  vals.push(id);

  db()
    .prepare(`UPDATE followups SET ${cols.join(", ")} WHERE id = ?`)
    .run(...vals);

  // Suppress unused-user lint while keeping the auth check above.
  void user;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db().prepare("DELETE FROM followups WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
