import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeal } from "@/lib/deals";
import { buildActivityFeed } from "@/lib/activities";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const deal = getDeal(id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const activity = buildActivityFeed([deal.contact_id], { limit: 100 });
  return NextResponse.json({ activity });
}
