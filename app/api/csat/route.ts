import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCsatSummary } from "@/lib/csat-runner";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") || "90") || 90;
  return NextResponse.json(getCsatSummary({ days: Math.max(1, Math.min(365, days)) }));
}
