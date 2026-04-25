import { NextResponse } from "next/server";
import { uploadMedia } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const mime = file.type || "application/octet-stream";
    const name = (file as File).name || "upload";
    const buf = Buffer.from(await file.arrayBuffer());
    const id = await uploadMedia(buf, mime, name);
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
