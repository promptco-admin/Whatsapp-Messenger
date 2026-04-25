import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollContact } from "@/lib/sequence-runner";
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

// Enroll one or many contacts into a sequence.
// Accepts { contact_ids: number[] } OR { segment_tag: string }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if (g) return g;
  const seqId = Number(params.id);
  if (!seqId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  let ids: number[] = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(Number).filter(Boolean)
    : [];

  if (ids.length === 0 && body.segment_tag) {
    const tag = String(body.segment_tag);
    const rows = db()
      .prepare("SELECT id, tags FROM contacts")
      .all() as Array<{ id: number; tags: string }>;
    ids = rows
      .filter((r) => {
        try {
          const tags = JSON.parse(r.tags || "[]");
          return Array.isArray(tags) && tags.includes(tag);
        } catch {
          return false;
        }
      })
      .map((r) => r.id);
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "no contacts to enroll" }, { status: 400 });
  }

  let enrolled = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = enrollContact(seqId, id);
    if (r.ok) enrolled++;
    else {
      skipped++;
      if (r.error && errors.length < 5) errors.push(r.error);
    }
  }

  return NextResponse.json({ enrolled, skipped, errors });
}

// Pause/resume/cancel an enrollment.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if (g) return g;
  const seqId = Number(params.id);
  if (!seqId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { enrollment_id, status } = await req.json();
  if (!enrollment_id || !["active", "paused", "completed"].includes(status)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  db()
    .prepare(
      "UPDATE sequence_enrollments SET status = ? WHERE id = ? AND sequence_id = ?",
    )
    .run(status, Number(enrollment_id), seqId);
  return NextResponse.json({ ok: true });
}
