import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getReportSummary,
  getStageReport,
  getAgentReport,
  getMonthlyWon,
  getStalledDeals,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * Resolve a named period preset into a [from, to) ISO range. Both are
 * SQLite-comparable strings (works against either `YYYY-MM-DD HH:MM:SS` or
 * `YYYY-MM-DDTHH:MM:SS.SSSZ` because comparisons are lexicographic and we
 * always use the space-separated form).
 */
function resolveRange(period: string): { from: string; to: string; label: string } {
  const now = new Date();
  const fmt = (d: Date) => {
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} 00:00:00`;
  };

  if (period === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(from), to: fmt(to), label: "Last month" };
  }
  if (period === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 1);
    return { from: fmt(from), to: fmt(to), label: "This quarter" };
  }
  if (period === "ytd") {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear() + 1, 0, 1);
    return { from: fmt(from), to: fmt(to), label: "Year to date" };
  }
  if (period === "last_90") {
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return { from: fmt(from), to: fmt(to), label: "Last 90 days" };
  }
  // default: this month
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: fmt(from), to: fmt(to), label: "This month" };
}

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "this_month";
  const stalledDays = Math.max(
    1,
    Math.min(90, Number(url.searchParams.get("stalled_days") || 7)),
  );

  const range = resolveRange(period);
  const summary = getReportSummary({ from: range.from, to: range.to });
  const by_stage = getStageReport();
  const by_agent = getAgentReport({ from: range.from, to: range.to });
  const monthly = getMonthlyWon();
  const stalled = getStalledDeals(stalledDays);

  return NextResponse.json({
    period,
    range: { from: range.from, to: range.to, label: range.label },
    stalled_days: stalledDays,
    summary,
    by_stage,
    by_agent,
    monthly,
    stalled,
  });
}
