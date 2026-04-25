import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Phase 8: click-tracked short link redirect.
 *
 * Shape: /r/<code>?c=<contactId>&b=<broadcastId>
 *   - code    : short_links.code (required, URL path segment)
 *   - c=...   : optional contact id (baked into the URL per-recipient)
 *   - b=...   : optional broadcast id
 *
 * Logs a row in url_clicks, then 302-redirects to the destination. Unknown
 * codes return 404. Any logging error is swallowed — we always redirect if
 * we found a destination.
 */
export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const code = String(params.code || "").trim();
  if (!code) return new NextResponse("not found", { status: 404 });

  const link = db()
    .prepare(
      "SELECT id, destination_url FROM short_links WHERE code = ?",
    )
    .get(code) as { id: number; destination_url: string } | undefined;
  if (!link) return new NextResponse("not found", { status: 404 });

  try {
    const url = new URL(req.url);
    const contactId = Number(url.searchParams.get("c") || "") || null;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const ua = req.headers.get("user-agent") || null;
    db()
      .prepare(
        `INSERT INTO url_clicks (short_link_id, contact_id, ip, user_agent)
         VALUES (?, ?, ?, ?)`,
      )
      .run(link.id, contactId, ip, ua);
  } catch (e) {
    console.error("[/r] log error", e);
  }

  return NextResponse.redirect(link.destination_url, 302);
}
