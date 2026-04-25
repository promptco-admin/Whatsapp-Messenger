import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enrollInFlow } from "@/lib/flow-runner";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const flowId = Number(params.id);
  const body = await req.json();
  const contactIds: number[] = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(Number).filter(Boolean)
    : [];
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contact_ids required" }, { status: 400 });
  }
  const results: Array<{ contact_id: number; run_id: number | null }> = [];
  for (const cid of contactIds) {
    try {
      const runId = await enrollInFlow(flowId, cid, { __trigger: "manual" });
      results.push({ contact_id: cid, run_id: runId });
    } catch (e: any) {
      results.push({ contact_id: cid, run_id: null });
      console.error("[flow enroll] error", cid, e?.message);
    }
  }
  return NextResponse.json({ results });
}
