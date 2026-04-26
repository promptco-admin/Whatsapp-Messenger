import { NextResponse } from "next/server";
import { db, upsertContact } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);
  const tag = url.searchParams.get("tag");
  const search = (url.searchParams.get("search") || "").trim();

  const rows = db()
    .prepare(
      `SELECT id, wa_id, name, wa_profile_name, wa_profile_updated_at,
              tags, custom_fields, last_message_at, last_inbound_at,
              pipeline_stage_id, assigned_user_id, unsubscribed_at, created_at
         FROM contacts ORDER BY COALESCE(name, wa_profile_name, wa_id) ASC`,
    )
    .all() as any[];

  let contacts = rows.map((r) => ({
    ...r,
    tags: safeParse(r.tags, []),
    custom_fields: safeParse(r.custom_fields, {}),
  }));

  if (tag) contacts = contacts.filter((c) => c.tags.includes(tag));
  if (search) {
    const q = search.toLowerCase();
    contacts = contacts.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.wa_profile_name || "").toLowerCase().includes(q) ||
        c.wa_id.includes(q),
    );
  }

  const allTags = new Set<string>();
  for (const c of contacts) for (const t of c.tags) allTags.add(t);

  return NextResponse.json({ contacts, tags: Array.from(allTags).sort() });
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { wa_id, name, tags, custom_fields } = await req.json();
  if (!wa_id || typeof wa_id !== "string") {
    return NextResponse.json({ error: "wa_id required" }, { status: 400 });
  }
  const normalized = wa_id.replace(/[^0-9]/g, "");
  if (normalized.length < 8) {
    return NextResponse.json({ error: "invalid phone number" }, { status: 400 });
  }
  const id = upsertContact(normalized, name ?? null);
  if (Array.isArray(tags)) {
    db().prepare("UPDATE contacts SET tags = ? WHERE id = ?").run(JSON.stringify(tags), id);
  }
  if (custom_fields && typeof custom_fields === "object") {
    db().prepare("UPDATE contacts SET custom_fields = ? WHERE id = ?").run(
      JSON.stringify(custom_fields),
      id,
    );
  }
  return NextResponse.json({ id, wa_id: normalized });
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
