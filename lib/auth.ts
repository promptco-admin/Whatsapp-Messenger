import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";

export const SESSION_COOKIE = "wa_session";
const SESSION_DAYS = 14;

export type User = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "agent";
  active: number;
  phone_masking: number;
  created_at: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function anyUserExists(): boolean {
  const row = db().prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
  return row.n > 0;
}

export function createUser(opts: {
  email: string;
  password_hash: string;
  name: string;
  role?: "admin" | "agent";
}): number {
  const res = db()
    .prepare(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
    )
    .run(opts.email.toLowerCase().trim(), opts.password_hash, opts.name, opts.role || "agent");
  return Number(res.lastInsertRowid);
}

export function findUserByEmail(email: string): (User & { password_hash: string }) | null {
  const row = db()
    .prepare("SELECT * FROM users WHERE email = ? AND active = 1")
    .get(email.toLowerCase().trim()) as (User & { password_hash: string }) | undefined;
  return row || null;
}

export function findUserById(id: number): User | null {
  const row = db()
    .prepare(
      "SELECT id, email, name, role, active, phone_masking, created_at FROM users WHERE id = ? AND active = 1",
    )
    .get(id) as User | undefined;
  return row || null;
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db()
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expires);
  return token;
}

export function deleteSession(token: string) {
  db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserFromToken(token: string): User | null {
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.active, u.phone_masking, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND u.active = 1`,
    )
    .get(token) as (User & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  const { expires_at, ...user } = row;
  return user;
}

/** Read session cookie and return the current user, or null. For use in API routes. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserFromToken(token);
}

/** Throws a 401-style error if no user. Call in API routes needing auth. */
export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") {
    const err: any = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  return u;
}

/** Purge expired sessions. Call opportunistically. */
export function purgeExpiredSessions() {
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}
