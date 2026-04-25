import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  anyUserExists,
  createSession,
  createUser,
  hashPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** First-run admin setup. Only works if no users exist yet. */
export async function GET() {
  return NextResponse.json({ needs_setup: !anyUserExists() });
}

export async function POST(req: Request) {
  if (anyUserExists()) {
    return NextResponse.json({ error: "Setup already complete" }, { status: 400 });
  }
  const { email, password, name } = await req.json().catch(() => ({}));
  if (!email || !password || !name) {
    return NextResponse.json({ error: "email, password, name required" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const hash = await hashPassword(password);
  const id = createUser({
    email,
    password_hash: hash,
    name,
    role: "admin",
  });
  const token = createSession(id);
  const res = NextResponse.json({ ok: true, user_id: id });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return res;
}
