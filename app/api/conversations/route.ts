import { NextResponse } from "next/server";
import { db, upsertContact } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter"); // 'mine' | 'unassigned' | null

  let where = "";
  const args: any[] = [];
  if (filter === "mine") {
    where = "WHERE c.assigned_user_id = ?";
    args.push(user.id);
  } else if (filter === "unassigned") {
    where = "WHERE c.assigned_user_id IS NULL";
  }

  // Cap the conversation list. The earlier query did 3 correlated subqueries
  // per contact and ran across the whole contacts table (>400 rows in some
  // tenants). On a phone over 4G that took multiple seconds. 500 is plenty —
  // anything older than the 500th most recently active conversation is
  // already a search/contact-page concern, not a chat concern.
  const rows = db()
    .prepare(
      `SELECT c.id, c.wa_id, c.name, c.wa_profile_name, c.last_message_at, c.last_inbound_at,
              c.assigned_user_id, c.source_json,
              (SELECT u.name FROM users u WHERE u.id = c.assigned_user_id) AS assigned_user_name,
              (SELECT body FROM messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
              (SELECT direction FROM messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_direction,
              (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.direction = 'inbound' AND m.read_at IS NULL) AS unread_count
         FROM contacts c
         ${where}
        ORDER BY COALESCE(c.last_message_at, '1970-01-01') DESC
        LIMIT 500`,
    )
    .all(...args);
  return NextResponse.json({ conversations: rows });
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { wa_id, name } = await req.json();
  if (!wa_id || typeof wa_id !== "string") {
    return NextResponse.json({ error: "wa_id required" }, { status: 400 });
  }
  const normalized = wa_id.replace(/[^0-9]/g, "");
  const id = upsertContact(normalized, name ?? null);
  return NextResponse.json({ id, wa_id: normalized });
}
