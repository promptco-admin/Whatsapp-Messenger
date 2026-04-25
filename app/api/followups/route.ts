import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { VariableMapping } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/followups?bucket=overdue|today|upcoming|done|all&assignee=me|all
 * Returns enriched rows joined to contacts for the dashboard list.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") || "all";
  const assignee = url.searchParams.get("assignee") || "all";
  const contactId = url.searchParams.get("contact_id");

  const where: string[] = ["1=1"];
  const params: any[] = [];

  const nowIso = new Date().toISOString();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndIso = todayEnd.toISOString();

  if (bucket === "overdue") {
    where.push("f.status = 'pending'");
    where.push("f.due_at < ?");
    params.push(nowIso);
  } else if (bucket === "today") {
    where.push("f.status = 'pending'");
    where.push("f.due_at >= ?");
    where.push("f.due_at <= ?");
    params.push(nowIso, todayEndIso);
  } else if (bucket === "upcoming") {
    where.push("f.status = 'pending'");
    where.push("f.due_at > ?");
    params.push(todayEndIso);
  } else if (bucket === "done") {
    where.push("f.status IN ('done', 'cancelled')");
  } else if (bucket === "failed") {
    where.push("f.status = 'failed'");
  }

  if (assignee === "me") {
    where.push("f.assigned_user_id = ?");
    params.push(user.id);
  } else if (assignee === "unassigned") {
    where.push("f.assigned_user_id IS NULL");
  }

  if (contactId) {
    where.push("f.contact_id = ?");
    params.push(Number(contactId));
  }

  const rows = db()
    .prepare(
      `SELECT f.*, c.wa_id, c.name AS contact_name,
              c.tags AS contact_tags, c.pipeline_stage_id,
              u.name AS assignee_name
         FROM followups f
         JOIN contacts c ON c.id = f.contact_id
         LEFT JOIN users u ON u.id = f.assigned_user_id
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE f.status WHEN 'pending' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END,
          f.due_at ASC
        LIMIT 500`,
    )
    .all(...params);

  return NextResponse.json({ followups: rows });
}

/**
 * POST /api/followups
 * Body: {
 *   contact_id, title, note?, due_at (ISO),
 *   auto_send?, message_kind? ('text'|'template'),
 *   message_body?, template_name?, template_language?,
 *   variable_mapping?, assigned_user_id?
 * }
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const contactId = Number(body.contact_id);
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  const title = String(body.title || "").trim() || "Follow up";
  const note = body.note ? String(body.note).slice(0, 4000) : null;
  const dueAtRaw = String(body.due_at || "");
  if (!dueAtRaw) return NextResponse.json({ error: "due_at required" }, { status: 400 });
  const dueAt = new Date(dueAtRaw);
  if (isNaN(dueAt.getTime()))
    return NextResponse.json({ error: "due_at invalid" }, { status: 400 });

  const autoSend = body.auto_send ? 1 : 0;
  const kind = body.message_kind === "template" ? "template" : "text";
  const messageBody = body.message_body ? String(body.message_body) : null;
  const templateName = body.template_name ? String(body.template_name) : null;
  const templateLanguage = body.template_language ? String(body.template_language) : null;
  const mapping: VariableMapping[] = Array.isArray(body.variable_mapping)
    ? body.variable_mapping
    : [];
  const assigneeId = body.assigned_user_id ? Number(body.assigned_user_id) : null;

  if (autoSend) {
    if (kind === "text" && (!messageBody || !messageBody.trim())) {
      return NextResponse.json(
        { error: "auto-send text follow-up needs message_body" },
        { status: 400 },
      );
    }
    if (kind === "template" && (!templateName || !templateLanguage)) {
      return NextResponse.json(
        { error: "auto-send template follow-up needs template_name + language" },
        { status: 400 },
      );
    }
  }

  const res = db()
    .prepare(
      `INSERT INTO followups
        (contact_id, title, note, due_at, status, auto_send,
         message_kind, message_body, template_name, template_language,
         variable_mapping, assigned_user_id, created_by_user_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      contactId,
      title,
      note,
      dueAt.toISOString(),
      autoSend,
      autoSend ? kind : null,
      autoSend ? messageBody : null,
      autoSend ? templateName : null,
      autoSend ? templateLanguage : null,
      autoSend ? JSON.stringify(mapping) : null,
      assigneeId,
      user.id,
    );

  return NextResponse.json({ id: Number(res.lastInsertRowid) });
}
