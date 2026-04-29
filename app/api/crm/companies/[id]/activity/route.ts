import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCompany, getCompanyContactIds } from "@/lib/companies";
import { buildActivityFeed } from "@/lib/activities";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  const company = getCompany(id);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ids = getCompanyContactIds(id);
  const activity = buildActivityFeed(ids, { limit: 200 });
  return NextResponse.json({ activity });
}
