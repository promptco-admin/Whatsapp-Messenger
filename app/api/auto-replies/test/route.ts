import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RuleRow = {
  id: number;
  name: string;
  trigger_keyword: string;
  match_type: "exact" | "contains" | "starts_with";
  active: number;
  priority: number;
};

function matches(rule: RuleRow, messageBody: string): boolean {
  const hay = messageBody.toLowerCase().trim();
  const ndl = rule.trigger_keyword.toLowerCase().trim();
  if (!ndl) return false;
  if (rule.match_type === "exact") return hay === ndl;
  if (rule.match_type === "starts_with") return hay.startsWith(ndl);
  return hay.includes(ndl);
}

// POST { message: "hi, what are your hours" }
// Returns which active rule (if any) would fire — does NOT send.
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { message } = await req.json();
  const text = String(message || "");
  if (!text.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const rules = db()
    .prepare(
      `SELECT id, name, trigger_keyword, match_type, active, priority
         FROM auto_replies
        WHERE active = 1
        ORDER BY priority DESC, id ASC`,
    )
    .all() as RuleRow[];

  const matched = rules.find((r) => matches(r, text)) || null;
  return NextResponse.json({
    matched,
    checked: rules.length,
  });
}
