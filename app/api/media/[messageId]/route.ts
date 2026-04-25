import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { downloadMedia } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Media proxy. The browser can't fetch graph.facebook.com media directly
 * (it needs the bearer token + the URL is short-lived + CORS). So the
 * <img src="/api/media/123"> route looks up the message's media_id, calls
 * Meta to get the short-lived URL, streams the bytes back.
 *
 * Outbound messages with a `media_url` (public https) are redirected to
 * that URL — no token needed.
 */
export async function GET(
  _req: Request,
  { params }: { params: { messageId: string } },
) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const id = Number(params.messageId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const row = db()
    .prepare(
      "SELECT id, media_id, media_mime, media_url, media_filename FROM messages WHERE id = ?",
    )
    .get(id) as
    | {
        id: number;
        media_id: string | null;
        media_mime: string | null;
        media_url: string | null;
        media_filename: string | null;
      }
    | undefined;

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // If it's a public URL (outbound template header with {link}), just redirect.
  if (row.media_url) {
    return NextResponse.redirect(row.media_url, 302);
  }

  if (!row.media_id) {
    return NextResponse.json({ error: "no media attached" }, { status: 404 });
  }

  try {
    const { buffer, mime } = await downloadMedia(row.media_id);
    const headers: Record<string, string> = {
      "Content-Type": row.media_mime || mime,
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(buffer.length),
    };
    if (row.media_filename) {
      headers["Content-Disposition"] = `inline; filename="${row.media_filename.replace(/"/g, "")}"`;
    }
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "media fetch failed" },
      { status: 502 },
    );
  }
}
