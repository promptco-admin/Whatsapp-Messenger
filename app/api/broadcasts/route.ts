import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBroadcast, type BroadcastHeader } from "@/lib/broadcast-runner";
import type { VariableMapping } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { resolveSegment, type SegmentCondition } from "@/lib/segments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare(
      `SELECT id, name, template_name, language, segment_tag, status, total, sent, delivered, read, failed,
              scheduled_for, created_at, started_at, completed_at
         FROM broadcasts ORDER BY id DESC`,
    )
    .all();
  return NextResponse.json({ broadcasts: rows });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim() || "Untitled broadcast";
  const template_name = String(body.template_name || "").trim();
  const language = String(body.language || "en_US");
  const segment_tag: string | null = body.segment_tag ? String(body.segment_tag) : null;
  // Phase 8: optional multi-condition segment (AND-combined). Takes precedence
  // over segment_tag when provided.
  const segment_conditions: SegmentCondition[] = Array.isArray(body.segment_conditions)
    ? body.segment_conditions
    : [];
  const variable_mapping: VariableMapping[] = Array.isArray(body.variable_mapping)
    ? body.variable_mapping
    : [];
  const header: BroadcastHeader | undefined = body.header || undefined;
  const contact_ids: number[] = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(Number).filter(Boolean)
    : [];

  // scheduled_for: accept ISO string; if it's in the future, mark as scheduled
  let scheduled_for: string | null = null;
  if (body.scheduled_for) {
    const t = new Date(body.scheduled_for);
    if (!isNaN(t.getTime()) && t.getTime() > Date.now() + 30_000) {
      scheduled_for = t.toISOString();
    }
  }

  if (!template_name) {
    return NextResponse.json({ error: "template_name required" }, { status: 400 });
  }

  let resolvedIds = contact_ids;
  if (resolvedIds.length === 0) {
    // Phase 8: prefer multi-condition segment when present, else legacy tag path.
    resolvedIds = resolveSegment({
      tag: segment_conditions.length > 0 ? null : segment_tag,
      conditions: segment_conditions,
    });
  } else {
    // Explicit ids — still drop unsubscribed ones. Compliance > user intent.
    const placeholders = resolvedIds.map(() => "?").join(",");
    const valid = db()
      .prepare(
        `SELECT id FROM contacts WHERE id IN (${placeholders}) AND unsubscribed_at IS NULL`,
      )
      .all(...resolvedIds) as Array<{ id: number }>;
    resolvedIds = valid.map((r) => r.id);
  }

  if (resolvedIds.length === 0) {
    return NextResponse.json({ error: "no recipients matched" }, { status: 400 });
  }

  const initialStatus = scheduled_for ? "scheduled" : "pending";
  const insert = db().prepare(
    `INSERT INTO broadcasts (name, template_name, language, variable_mapping, header_json, segment_tag, total, status, scheduled_for, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const res = insert.run(
    name,
    template_name,
    language,
    JSON.stringify(variable_mapping),
    header ? JSON.stringify(header) : null,
    segment_tag,
    resolvedIds.length,
    initialStatus,
    scheduled_for,
    user.id,
  );
  const broadcastId = Number(res.lastInsertRowid);

  const insertR = db().prepare(
    "INSERT INTO broadcast_recipients (broadcast_id, contact_id) VALUES (?, ?)",
  );
  const tx = db().transaction((ids: number[]) => {
    for (const id of ids) insertR.run(broadcastId, id);
  });
  tx(resolvedIds);

  if (!scheduled_for) {
    runBroadcast(broadcastId).catch((e) => console.error("broadcast error", e));
  }

  return NextResponse.json({
    id: broadcastId,
    total: resolvedIds.length,
    scheduled_for,
  });
}
