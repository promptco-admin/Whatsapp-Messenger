import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/pipeline-stages/:id
 * Body: any subset of { name, order_index, color, is_won, is_lost, auto_followup_days }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await req.json();

  const cols: string[] = [];
  const vals: any[] = [];

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    cols.push("name = ?");
    vals.push(name);
  }
  if (body.order_index !== undefined) {
    cols.push("order_index = ?");
    vals.push(Number(body.order_index));
  }
  if (typeof body.color === "string") {
    cols.push("color = ?");
    vals.push(body.color);
  }
  if (body.is_won !== undefined) {
    cols.push("is_won = ?");
    vals.push(body.is_won ? 1 : 0);
  }
  if (body.is_lost !== undefined) {
    cols.push("is_lost = ?");
    vals.push(body.is_lost ? 1 : 0);
  }
  if (body.auto_followup_days !== undefined) {
    cols.push("auto_followup_days = ?");
    vals.push(
      body.auto_followup_days === null || body.auto_followup_days === ""
        ? null
        : Number(body.auto_followup_days),
    );
  }

  if (cols.length === 0) return NextResponse.json({ ok: true });
  vals.push(id);
  db()
    .prepare(`UPDATE pipeline_stages SET ${cols.join(", ")} WHERE id = ?`)
    .run(...vals);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/pipeline-stages/:id
 * Detaches contacts (sets pipeline_stage_id = NULL) before deleting the stage.
 */
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

  const database = db();
  const tx = database.transaction(() => {
    database
      .prepare("UPDATE contacts SET pipeline_stage_id = NULL WHERE pipeline_stage_id = ?")
      .run(id);
    database.prepare("DELETE FROM pipeline_stages WHERE id = ?").run(id);
  });
  tx();
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/pipeline-stages/:id/reorder
 * (Reuse PATCH with order_index for individual moves; bulk reorder lives at parent route if needed.)
 */
