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
  const database = db();
  const sequences = database
    .prepare(
      `SELECT s.id, s.name, s.description, s.active, s.created_at,
              (SELECT COUNT(*) FROM sequence_steps ss WHERE ss.sequence_id = s.id) AS step_count,
              (SELECT COUNT(*) FROM sequence_enrollments se
                WHERE se.sequence_id = s.id AND se.status = 'active') AS active_enrollments
         FROM sequences s
        ORDER BY s.id DESC`,
    )
    .all();
  return NextResponse.json({ sequences });
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { name, description } = await req.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const res = db()
    .prepare("INSERT INTO sequences (name, description) VALUES (?, ?)")
    .run(String(name).trim(), description ? String(description) : null);
  return NextResponse.json({ id: res.lastInsertRowid });
}
