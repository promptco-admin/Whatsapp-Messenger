import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createUser, hashPassword, requireAdmin, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Any logged-in user can list teammates (needed for the Assign dropdown). */
export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare(
      "SELECT id, email, name, role, active, phone_masking, created_at FROM users ORDER BY role DESC, name ASC",
    )
    .all();
  return NextResponse.json({ users: rows });
}

/** Only admins can create users. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { email, password, name, role } = await req.json().catch(() => ({}));
  if (!email || !password || !name) {
    return NextResponse.json({ error: "email, password, name required" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (role && role !== "admin" && role !== "agent") {
    return NextResponse.json({ error: "role must be 'admin' or 'agent'" }, { status: 400 });
  }
  try {
    const hash = await hashPassword(password);
    const id = createUser({ email, password_hash: hash, name, role: role || "agent" });
    return NextResponse.json({ id });
  } catch (e: any) {
    if (String(e.message).includes("UNIQUE")) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
