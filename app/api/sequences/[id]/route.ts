import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function gate() {
  try {
    await requireUser();
    return null;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if (g) return g;
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
  if (g) return g;
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { name, description, active } = await req.json();
  const database = db();

  if (name !== undefined) {
    database.prepare("UPDATE sequences SET name = ? WHERE id = ?").run(String(name).trim(), id);
  }
  if (description !== undefined) {
    database
      .prepare("UPDATE sequences SET description = ? WHERE id = ?")
      .run(description ? String(description) : null, id);
  }
  if (active !== undefined) {
    database.prepare("UPDATE sequences SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if (g) return g;
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db().prepare("DELETE FROM sequences WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
