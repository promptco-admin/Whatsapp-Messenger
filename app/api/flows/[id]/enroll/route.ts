import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enrollInFlow } from "@/lib/flow-runner";
import { db } from "@/lib/db";
import { logActivity, logError, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
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
      logError({
        source: "flow.enroll",
        message: e?.message || String(e),
        context: { flow_id: flowId, contact_id: cid },
        contactId: cid,
      });
    }
  }
  const flowName = (db().prepare("SELECT name FROM flows WHERE id = ?").get(flowId) as
    | { name: string }
    | undefined)?.name;
  const succeeded = results.filter((r) => r.run_id !== null).length;
  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "flow.enroll",
    entityType: "flow",
    entityId: flowId,
    summary: `Enrolled ${succeeded}/${contactIds.length} contact${
      contactIds.length === 1 ? "" : "s"
    } in flow "${flowName || ""}"`,
    metadata: { count: contactIds.length, succeeded },
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ results });
}
