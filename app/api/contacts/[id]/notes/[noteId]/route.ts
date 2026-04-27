import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Delete note — author can delete own, admin can delete any. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; noteId: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const noteId = Number(params.noteId);
  const contactId = Number(params.id);
  const note = db()
    .prepare("SELECT user_id FROM contact_notes WHERE id = ?")
    .get(noteId) as { user_id: number } | undefined;
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (note.user_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  db().prepare("DELETE FROM contact_notes WHERE id = ?").run(noteId);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "note.delete",
    entityType: "note",
    entityId: noteId,
    contactId,
    summary: `Deleted note`,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
