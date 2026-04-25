import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const flow = db().prepare("SELECT * FROM flows WHERE id = ?").get(id);
  if (!flow) return NextResponse.json({ error: "not found" }, { status: 404 });
  const runs = db()
    .prepare(
      `SELECT r.id, r.contact_id, r.current_node_id, r.status, r.waiting_for,
              r.next_run_at, r.started_at, r.completed_at, r.last_error,
              c.wa_id, c.name AS contact_name
         FROM flow_runs r
         JOIN contacts c ON c.id = r.contact_id
        WHERE r.flow_id = ?
        ORDER BY r.id DESC
        LIMIT 100`,
    )
    .all(id);
  return NextResponse.json({ flow, runs });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const body = await req.json();
  const cols: string[] = [];
  const vals: any[] = [];
  if (body.name !== undefined) {
    cols.push("name = ?");
    vals.push(String(body.name));
  }
  if (body.description !== undefined) {
    cols.push("description = ?");
    vals.push(String(body.description));
  }
  if (body.active !== undefined) {
    cols.push("active = ?");
    vals.push(body.active ? 1 : 0);
  }
  if (body.trigger_type !== undefined) {
    cols.push("trigger_type = ?");
    vals.push(String(body.trigger_type));
  }
  if (body.trigger_config !== undefined) {
    cols.push("trigger_config = ?");
    vals.push(JSON.stringify(body.trigger_config));
  }
  if (body.nodes !== undefined) {
    cols.push("nodes_json = ?");
    vals.push(JSON.stringify(body.nodes));
  }
  if (body.edges !== undefined) {
    cols.push("edges_json = ?");
    vals.push(JSON.stringify(body.edges));
  }
  if (cols.length === 0) return NextResponse.json({ ok: true });
  cols.push("updated_at = CURRENT_TIMESTAMP");
  vals.push(id);
  db()
    .prepare(`UPDATE flows SET ${cols.join(", ")} WHERE id = ?`)
    .run(...vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  db().prepare("DELETE FROM flows WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
