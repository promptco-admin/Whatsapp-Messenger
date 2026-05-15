import { NextResponse } from "next/server";
import { db, getSetting, setSetting } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type AdRoutingRule = {
  id: string;
  source_id: string;
  user_id: number;
  label: string | null;
};

const SETTING_KEY = "ad_routing_rules";

function loadRules(): AdRoutingRule[] {
  const raw = getSetting<AdRoutingRule[]>(SETTING_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

function normalizeRule(r: any): AdRoutingRule | null {
  const source_id = String(r?.source_id ?? "").trim();
  const user_id = Number(r?.user_id);
  if (!source_id || !Number.isInteger(user_id) || user_id <= 0) return null;
  const id = String(r?.id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const label = r?.label ? String(r.label).slice(0, 200) : null;
  return { id, source_id: source_id.slice(0, 200), user_id, label };
}

/** GET — return rules + active users for the picker. Any signed-in user. */
export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const rules = loadRules();
  const users = db()
    .prepare("SELECT id, name, email FROM users WHERE active = 1 ORDER BY name")
    .all() as Array<{ id: number; name: string; email: string }>;
  return NextResponse.json({ rules, users });
}

/** PUT — replace the rule list. Admin only. */
export async function PUT(req: Request) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body?.rules) ? body.rules : [];
  const valid: AdRoutingRule[] = [];
  const seen = new Set<string>();
  for (const r of incoming) {
    const n = normalizeRule(r);
    if (!n) continue;
    // Dedupe by source_id — last write wins.
    if (seen.has(n.source_id)) {
      const idx = valid.findIndex((x) => x.source_id === n.source_id);
      if (idx >= 0) valid[idx] = n;
      continue;
    }
    seen.add(n.source_id);
    valid.push(n);
  }
  setSetting(SETTING_KEY, valid);
  return NextResponse.json({ ok: true, rules: valid });
}
