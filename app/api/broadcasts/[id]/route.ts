import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { runBroadcast } from "@/lib/broadcast-runner";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const broadcast = db().prepare("SELECT * FROM broadcasts WHERE id = ?").get(id);
  if (!broadcast) return NextResponse.json({ error: "not found" }, { status: 404 });
  const recipients = db()
    .prepare(
      `SELECT br.id, br.status, br.wa_message_id, br.error, br.sent_at, c.wa_id, c.name
         FROM broadcast_recipients br
         JOIN contacts c ON c.id = br.contact_id
        WHERE br.broadcast_id = ?
        ORDER BY br.id ASC`,
    )
    .all(id);
  return NextResponse.json({ broadcast, recipients });
}

/** POST — resume a paused broadcast. Flips status back to pending and
 *  re-triggers the runner for recipients that are still pending. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  if (action !== "resume") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const broadcast = db().prepare("SELECT id, name, status FROM broadcasts WHERE id = ?").get(id) as
    | { id: number; name: string; status: string }
    | undefined;
  if (!broadcast) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (broadcast.status !== "paused") {
    return NextResponse.json(
      { error: `can only resume a paused broadcast (status=${broadcast.status})` },
      { status: 409 },
    );
  }
  db().prepare("UPDATE broadcasts SET status = 'pending' WHERE id = ?").run(id);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "broadcast.resume",
    entityType: "broadcast",
    entityId: id,
    summary: `Broadcast "${broadcast.name}" resumed by ${user.name}`,
  });
  runBroadcast(id).catch((e) => console.error("broadcast resume error", e));
  return NextResponse.json({ ok: true });
}
