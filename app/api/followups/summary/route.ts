import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { summarizeFollowups } from "@/lib/followup-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  return NextResponse.json(summarizeFollowups());
}
