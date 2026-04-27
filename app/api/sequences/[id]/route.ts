import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, type User } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function gate(): Promise<{ user: User } | { error: NextResponse }> {
  try {
    const user = await requireUser();
    return { user };
  } catch (e: any) {
    return {
      error: NextResponse.json({ error: e.message }, { status: e.status || 401 }),
    };
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const database = db();

  const sequence = database.prepare("SELECT * FROM sequences WHERE id = ?").get(id);
  if (!sequence) return NextResponse.json({ error: "not found" }, { status: 404 });

  const steps = database
    .prepare(
      `SELECT id, order_index, template_name, language, variable_mapping, header_json,
              delay_days, delay_hours, delay_minutes
         FROM sequence_steps
        WHERE sequence_id = ?
        ORDER BY order_index ASC`,
    )
    .all(id);

  const enrollments = database
    .prepare(
      `SELECT se.id, se.contact_id, se.current_step, se.status, se.next_run_at,
              se.enrolled_at, se.completed_at, se.last_error,
              c.wa_id, c.name
         FROM sequence_enrollments se
         JOIN contacts c ON c.id = se.contact_id
        WHERE se.sequence_id = ?
        ORDER BY se.id DESC`,
    )
    .all(id);

  return NextResponse.json({ sequence, steps, enrollments });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { user } = g;
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { name, description, active } = await req.json();
  const database = db();

  const fields: string[] = [];
  if (name !== undefined) {
    database.prepare("UPDATE sequences SET name = ? WHERE id = ?").run(String(name).trim(), id);
    fields.push("name");
  }
  if (description !== undefined) {
    database
      .prepare("UPDATE sequences SET description = ? WHERE id = ?")
      .run(description ? String(description) : null, id);
    fields.push("description");
  }
  if (active !== undefined) {
    database.prepare("UPDATE sequences SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
    fields.push("active");
  }
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "sequence.update",
    entityType: "sequence",
    entityId: id,
    summary:
      active !== undefined && fields.length === 1
        ? `${active ? "Activated" : "Deactivated"} sequence`
        : `Edited sequence (${fields.join(", ")})`,
    metadata: { fields },
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { user } = g;
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const snap = db().prepare("SELECT name FROM sequences WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  db().prepare("DELETE FROM sequences WHERE id = ?").run(id);
  if (snap) {
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "sequence.delete",
      entityType: "sequence",
      entityId: id,
      summary: `Deleted sequence "${snap.name}"`,
      ipAddress: clientIp(req),
    });
  }
  return NextResponse.json({ ok: true });
}
