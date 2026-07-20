import { NextResponse } from "next/server";
import { uploadMedia } from "@/lib/whatsapp";
import { requireServiceAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Server-to-server equivalent of /api/media/upload for Prompt-Solar CRM's
 * edge functions — accepts a base64-encoded file (edge functions don't have
 * multipart/form-data readily on hand the way a browser upload does) rather
 * than the multipart form the authenticated UI upload uses.
 */
export async function POST(req: Request) {
  try {
    requireServiceAuth(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { base64, mime, filename } = body;
  if (!base64 || typeof base64 !== "string") {
    return NextResponse.json({ error: "base64 required" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(base64, "base64");
    const id = await uploadMedia(buf, mime || "application/octet-stream", filename || "upload");
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
