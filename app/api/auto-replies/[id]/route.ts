import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await req.json();
  const database = db();

  const fields: string[] = [];
  const values: any[] = [];

  const stringFields = [
    "name",
    "trigger_keyword",
    "match_type",
    "response_kind",
    "response_text",
    "template_name",
    "template_language",
  ] as const;
  for (const f of stringFields) {
    if (body[f] !== undefined) {
      fields.push(`${f} = ?`);
      values.push(body[f] === null ? null : String(body[f]));
    }
  }

  if (body.variable_mapping !== undefined) {
    fields.push("variable_mapping = ?");
    values.push(body.variable_mapping ? JSON.stringify(body.variable_mapping) : null);
  }
  if (body.cooldown_minutes !== undefined) {
    fields.push("cooldown_minutes = ?");
    values.push(Number(body.cooldown_minutes));
  }
  if (body.active !== undefined) {
    fields.push("active = ?");
    values.push(body.active ? 1 : 0);
  }
  if (body.priority !== undefined) {
    fields.push("priority = ?");
    values.push(Number(body.priority));
  }
  if (body.hours_json !== undefined) {
    fields.push("hours_json = ?");
    values.push(
      body.hours_json === null ? null : JSON.stringify(body.hours_json),
    );
  }

  if (fields.length === 0) return NextResponse.json({ ok: true });

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  database.prepare(`UPDATE auto_replies SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db().prepare("DELETE FROM auto_replies WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
