import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollContact } from "@/lib/sequence-runner";
import { requireUser, type User } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function gate(): Promise<{ user: User } | { error: NextResponse }> {
  try {
    const user = await requireUser();
    return { user };
  } catch (e: any) {
    return { error: NextResponse.json({ error: e.message }, { status: e.status || 401 }) };
  }
}

// Enroll one or many contacts into a sequence.
// Accepts { contact_ids: number[] } OR { segment_tag: string }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { user } = g;
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

  const seqName = (db().prepare("SELECT name FROM sequences WHERE id = ?").get(seqId) as
    | { name: string }
    | undefined)?.name;
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "sequence.enroll",
    entityType: "sequence",
    entityId: seqId,
    summary: `Enrolled ${enrolled} contact${enrolled === 1 ? "" : "s"} in sequence "${seqName || ""}"${
      skipped ? ` (${skipped} skipped)` : ""
    }`,
    metadata: { enrolled, skipped, segment_tag: body.segment_tag || null },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ enrolled, skipped, errors });
}

// Pause/resume/cancel an enrollment.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { user } = g;
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
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "sequence.enrollment_update",
    entityType: "sequence",
    entityId: seqId,
    summary: `Set enrollment #${enrollment_id} to ${status}`,
    metadata: { enrollment_id, status },
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
