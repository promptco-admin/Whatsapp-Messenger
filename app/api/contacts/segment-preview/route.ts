import { NextResponse } from "next/server";
import { resolveSegment, type SegmentCondition } from "@/lib/segments";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Phase 8: segment preview.
 * Body: { tag?: string|null, conditions?: SegmentCondition[] }
 * Returns: { count: number, sample_ids: number[] }
 */
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json().catch(() => ({}));
  const conditions: SegmentCondition[] = Array.isArray(body.conditions)
    ? body.conditions
    : [];
  const tag = body.tag ? String(body.tag) : null;
  const ids = resolveSegment({
    tag: conditions.length > 0 ? null : tag,
    conditions,
  });
  return NextResponse.json({
    count: ids.length,
    sample_ids: ids.slice(0, 10),
  });
}
