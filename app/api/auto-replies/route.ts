import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare(
      `SELECT id, name, trigger_keyword, match_type, response_kind, response_text,
              template_name, template_language, variable_mapping, cooldown_minutes,
              active, priority, fire_count, hours_json, created_at, updated_at
         FROM auto_replies
        ORDER BY priority DESC, id ASC`,
    )
    .all();
  return NextResponse.json({ auto_replies: rows });
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  const trigger_keyword = String(body.trigger_keyword || "").trim();
  const match_type = String(body.match_type || "contains");
  const response_kind = String(body.response_kind || "text");

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!trigger_keyword)
    return NextResponse.json({ error: "trigger_keyword required" }, { status: 400 });
  if (!["exact", "contains", "starts_with"].includes(match_type))
    return NextResponse.json({ error: "invalid match_type" }, { status: 400 });
  if (!["text", "template"].includes(response_kind))
    return NextResponse.json({ error: "invalid response_kind" }, { status: 400 });

  if (response_kind === "text" && !String(body.response_text || "").trim()) {
    return NextResponse.json({ error: "response_text required for text reply" }, { status: 400 });
  }
  if (response_kind === "template" && !String(body.template_name || "").trim()) {
    return NextResponse.json({ error: "template_name required for template reply" }, { status: 400 });
  }

  const res = db()
    .prepare(
      `INSERT INTO auto_replies
         (name, trigger_keyword, match_type, response_kind, response_text,
          template_name, template_language, variable_mapping, cooldown_minutes,
          active, priority, hours_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      trigger_keyword,
      match_type,
      response_kind,
      response_kind === "text" ? String(body.response_text).trim() : null,
      response_kind === "template" ? String(body.template_name).trim() : null,
      response_kind === "template" ? String(body.template_language || "en_US") : null,
      body.variable_mapping ? JSON.stringify(body.variable_mapping) : null,
      Number(body.cooldown_minutes ?? 60),
      body.active === false ? 0 : 1,
      Number(body.priority || 0),
      body.hours_json ? JSON.stringify(body.hours_json) : null,
    );
  return NextResponse.json({ id: res.lastInsertRowid });
}
