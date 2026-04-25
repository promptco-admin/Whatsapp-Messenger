import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

function genCode(): string {
  // 6-char url-safe code. Collision probability for hundreds of links: negligible.
  return crypto.randomBytes(4).toString("base64url").slice(0, 6);
}

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rows = db()
    .prepare(
      `SELECT sl.id, sl.code, sl.destination_url, sl.label, sl.broadcast_id,
              sl.template_name, sl.created_at,
              COUNT(uc.id) AS clicks,
              COUNT(DISTINCT uc.contact_id) AS unique_clicks
         FROM short_links sl
         LEFT JOIN url_clicks uc ON uc.short_link_id = sl.id
         GROUP BY sl.id
         ORDER BY sl.id DESC
         LIMIT 200`,
    )
    .all();
  return NextResponse.json({ links: rows });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const dest = String(body.destination_url || "").trim();
  if (!/^https?:\/\//i.test(dest)) {
    return NextResponse.json(
      { error: "destination_url must be http(s)://…" },
      { status: 400 },
    );
  }
  const label = body.label ? String(body.label).slice(0, 120) : null;
  const broadcastId = body.broadcast_id ? Number(body.broadcast_id) : null;
  const templateName = body.template_name ? String(body.template_name) : null;

  // Retry a couple of times on the very unlikely event of a code collision
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = genCode();
    try {
      db()
        .prepare(
          `INSERT INTO short_links (code, destination_url, label, broadcast_id, template_name, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(code, dest, label, broadcastId, templateName, user.id);
      break;
    } catch (e: any) {
      if (!String(e?.message || "").includes("UNIQUE")) throw e;
      code = "";
    }
  }
  if (!code) {
    return NextResponse.json(
      { error: "could not allocate a short code — try again" },
      { status: 500 },
    );
  }
  return NextResponse.json({ code });
}
