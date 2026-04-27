import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, findUserByEmail, verifyPassword } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  const user = findUserByEmail(email);
  if (!user) {
    logActivity({
      user: null,
      action: "auth.login_failed",
      summary: `Failed login for ${email}`,
      metadata: { email, reason: "user_not_found" },
      ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    logActivity({
      user: { id: user.id, name: user.name, role: user.role },
      action: "auth.login_failed",
      summary: `Failed login for ${user.email}`,
      metadata: { email: user.email, reason: "bad_password" },
      ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const token = createSession(user.id);
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "auth.login",
    summary: `${user.name} signed in`,
    ipAddress: ip,
  });
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return res;
}
