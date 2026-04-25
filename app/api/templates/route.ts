import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  try {
    const templates = await listTemplates();
    const approved = templates.filter((t) => (t.status || "").toUpperCase() === "APPROVED");
    return NextResponse.json({ templates: approved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
