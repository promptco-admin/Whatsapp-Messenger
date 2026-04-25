import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/:id
 * - Admin can update name, role, active, password for anyone.
 * - Any user can update their own phone_masking preference or password.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let currentUser;
  try {
    currentUser = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const targetId = Number(params.id);
  const isSelf = currentUser.id === targetId;
  const isAdmin = currentUser.role === "admin";

  const body = await req.json().catch(() => ({}));
  const updates: string[] = [];
  const values: any[] = [];

  if ("name" in body && (isAdmin || isSelf)) {
    updates.push("name = ?");
    values.push(String(body.name).trim());
  }
  if ("role" in body && isAdmin) {
    if (body.role !== "admin" && body.role !== "agent") {
      return NextResponse.json({ error: "role must be 'admin' or 'agent'" }, { status: 400 });
    }
    updates.push("role = ?");
    values.push(body.role);
  }
  if ("active" in body && isAdmin) {
    updates.push("active = ?");
    values.push(body.active ? 1 : 0);
  }
  if ("phone_masking" in body && (isAdmin || isSelf)) {
    updates.push("phone_masking = ?");
    values.push(body.phone_masking ? 1 : 0);
  }
  if ("password" in body && (isAdmin || isSelf)) {
    if (String(body.password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const hash = await hashPassword(body.password);
    updates.push("password_hash = ?");
    values.push(hash);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  values.push(targetId);
  db().prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

/** Delete (deactivate) a user. Admin only. Can't delete yourself. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let currentUser;
  try {
    currentUser = await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const targetId = Number(params.id);
  if (currentUser.id === targetId) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }
  // Soft delete: deactivate rather than hard delete to preserve audit trail
  db().prepare("UPDATE users SET active = 0 WHERE id = ?").run(targetId);
  // Invalidate their sessions
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
  return NextResponse.json({ ok: true });
}
