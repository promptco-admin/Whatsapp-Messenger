import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET — return the distinct ads we've seen on inbound contacts, so the routing
 * UI can offer them as autocomplete suggestions instead of forcing the user to
 * paste a Meta ad ID by hand.
 */
export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const rows = db()
    .prepare(
      `SELECT source_json FROM contacts
        WHERE source_json IS NOT NULL
        ORDER BY id DESC
        LIMIT 2000`,
    )
    .all() as Array<{ source_json: string }>;

  const map = new Map<
    string,
    { source_id: string; headline: string | null; count: number }
  >();
  for (const row of rows) {
    try {
      const s = JSON.parse(row.source_json);
      const sid = s?.source_id ? String(s.source_id) : null;
      if (!sid) continue;
      const prev = map.get(sid);
      if (prev) {
        prev.count += 1;
        if (!prev.headline && s.headline) prev.headline = String(s.headline);
      } else {
        map.set(sid, {
          source_id: sid,
          headline: s.headline ? String(s.headline) : null,
          count: 1,
        });
      }
    } catch {
      // skip malformed rows
    }
  }

  const ads = Array.from(map.values()).sort((a, b) => b.count - a.count);
  return NextResponse.json({ ads });
}
