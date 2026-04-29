"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import { formatPhonePretty } from "@/lib/display";
import { DealDetailDialog } from "./DealDetailDialog";

type Period = "this_month" | "last_month" | "this_quarter" | "ytd" | "last_90";

type Summary = {
  open_value_paise: number;
  open_count: number;
  won_value_paise: number;
  won_count: number;
  lost_value_paise: number;
  lost_count: number;
  win_rate: number;
  avg_won_deal_paise: number;
};

type StageRow = {
  stage_id: number | null;
  stage_name: string | null;
  color: string | null;
  is_won: number;
  is_lost: number;
  count: number;
  total_paise: number;
  probability: number;
  weighted_paise: number;
};

type AgentRow = {
  user_id: number | null;
  name: string;
  open_count: number;
  open_paise: number;
  won_count: number;
  won_paise: number;
  lost_count: number;
  lost_paise: number;
  win_rate: number;
};

type MonthlyRow = {
  month: string;
  won_count: number;
  won_paise: number;
};

type StalledDeal = {
  id: number;
  title: string;
  value_paise: number;
  stage_name: string | null;
  stage_color: string | null;
  contact_name: string | null;
  contact_wa_id: string;
  owner_name: string | null;
  updated_at: string;
  days_idle: number;
};

type ReportData = {
  period: string;
  range: { from: string; to: string; label: string };
  stalled_days: number;
  summary: Summary;
  by_stage: StageRow[];
  by_agent: AgentRow[];
  monthly: MonthlyRow[];
  stalled: StalledDeal[];
};

type Stage = { id: number; name: string; color: string; is_won: number; is_lost: number };

export function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [period, setPeriod] = useState<Period>("this_month");
  const [stalledDays, setStalledDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [openDealId, setOpenDealId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        fetch(`/api/crm/reports?period=${period}&stalled_days=${stalledDays}`).then((x) =>
          x.json(),
        ),
        fetch("/api/crm/deal-stages").then((x) => x.json()),
      ]);
      setData(r);
      setStages(s.stages || []);
    } finally {
      setLoading(false);
    }
  }, [period, stalledDays]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const forecastWeighted = useMemo(() => {
    if (!data) return 0;
    return data.by_stage.reduce(
      (acc, s) => (s.is_lost ? acc : acc + s.weighted_paise),
      0,
    );
  }, [data]);

  const stageBarMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.by_stage.map((s) => s.total_paise));
  }, [data]);

  const monthlyMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.monthly.map((m) => m.won_paise));
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="text-sm font-semibold text-slate-800">Sales reports</div>
        <div className="flex flex-wrap items-center gap-1">
          <PeriodPill active={period === "this_month"} onClick={() => setPeriod("this_month")}>
            This month
          </PeriodPill>
          <PeriodPill active={period === "last_month"} onClick={() => setPeriod("last_month")}>
            Last month
          </PeriodPill>
          <PeriodPill
            active={period === "this_quarter"}
            onClick={() => setPeriod("this_quarter")}
          >
            This quarter
          </PeriodPill>
          <PeriodPill active={period === "last_90"} onClick={() => setPeriod("last_90")}>
            Last 90 days
          </PeriodPill>
          <PeriodPill active={period === "ytd"} onClick={() => setPeriod("ytd")}>
            YTD
          </PeriodPill>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>Stalled threshold:</span>
          <select
            value={stalledDays}
            onChange={(e) => setStalledDays(Number(e.target.value))}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value={3}>3+ days</option>
            <option value={7}>7+ days</option>
            <option value={14}>14+ days</option>
            <option value={30}>30+ days</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
        {loading || !data ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            Loading reports…
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-4">
            {/* Stalled deals alert (top-of-page actionable) */}
            {data.stalled.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-amber-900">
                      ⚠ {data.stalled.length} deal{data.stalled.length === 1 ? "" : "s"} stalled
                    </div>
                    <div className="text-xs text-amber-700">
                      No activity in the last {data.stalled_days}+ days. These need a nudge.
                    </div>
                  </div>
                  <div className="text-xs font-medium text-amber-700">
                    {formatPaiseCompact(
                      data.stalled.reduce((a, d) => a + d.value_paise, 0),
                    )}{" "}
                    at risk
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-amber-100 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-50/60 text-[10px] uppercase tracking-wide text-amber-800">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Deal</th>
                        <th className="px-3 py-1.5 text-left font-medium">Contact</th>
                        <th className="px-3 py-1.5 text-left font-medium">Stage</th>
                        <th className="px-3 py-1.5 text-left font-medium">Owner</th>
                        <th className="px-3 py-1.5 text-right font-medium">Value</th>
                        <th className="px-3 py-1.5 text-right font-medium">Idle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stalled.slice(0, 10).map((d) => (
                        <tr
                          key={d.id}
                          onClick={() => setOpenDealId(d.id)}
                          className="cursor-pointer border-t border-amber-100 hover:bg-amber-50/40"
                        >
                          <td className="px-3 py-1.5 font-medium text-slate-800">{d.title}</td>
                          <td className="px-3 py-1.5 text-slate-600">
                            {d.contact_name || formatPhonePretty(d.contact_wa_id)}
                          </td>
                          <td className="px-3 py-1.5">
                            {d.stage_name && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                                style={{ backgroundColor: d.stage_color || "#94a3b8" }}
                              >
                                {d.stage_name}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate-600">{d.owner_name || "—"}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-indigo-700">
                            {formatPaise(d.value_paise)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-amber-700">
                            {d.days_idle}d
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.stalled.length > 10 && (
                  <div className="mt-2 text-[11px] text-amber-700">
                    Showing top 10 of {data.stalled.length} stalled deals.
                  </div>
                )}
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Open pipeline" value={formatPaiseCompact(data.summary.open_value_paise)} sub={`${data.summary.open_count} deals`} />
              <Kpi label="Forecast" value={formatPaiseCompact(forecastWeighted)} sub="Weighted by stage" />
              <Kpi
                label={`Won · ${data.range.label}`}
                value={formatPaiseCompact(data.summary.won_value_paise)}
                sub={`${data.summary.won_count} closed`}
                tone="green"
              />
              <Kpi
                label={`Lost · ${data.range.label}`}
                value={formatPaiseCompact(data.summary.lost_value_paise)}
                sub={`${data.summary.lost_count} closed`}
                tone="slate"
              />
              <Kpi
                label="Win rate"
                value={`${Math.round(data.summary.win_rate * 100)}%`}
                sub={`${data.summary.won_count}/${data.summary.won_count + data.summary.lost_count} closed`}
              />
              <Kpi
                label="Avg won deal"
                value={formatPaiseCompact(data.summary.avg_won_deal_paise)}
                sub={data.range.label}
              />
            </div>

            {/* Pipeline by stage + Forecast */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel title="Pipeline by stage" subtitle="Open deals only">
                {data.by_stage.length === 0 ? (
                  <Empty>No stages configured.</Empty>
                ) : (
                  <div className="space-y-2">
                    {data.by_stage.map((s) => {
                      const pct =
                        s.total_paise === 0
                          ? 0
                          : Math.max(2, Math.round((s.total_paise / stageBarMax) * 100));
                      return (
                        <div key={String(s.stage_id)}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: s.color || "#94a3b8" }}
                              />
                              <span className="font-medium text-slate-700">
                                {s.stage_name}
                                {s.is_won && " ✓"}
                                {s.is_lost && " ✗"}
                              </span>
                              <span className="text-slate-400">· {s.count}</span>
                            </div>
                            <div className="font-medium text-slate-700">
                              {formatPaise(s.total_paise)}
                            </div>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                            <div
                              className="h-full rounded transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: s.color || "#94a3b8",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="Forecast (weighted)" subtitle="Open × stage probability">
                <div className="mb-3 rounded-md bg-indigo-50 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-indigo-700">
                    Weighted pipeline value
                  </div>
                  <div className="text-2xl font-semibold text-indigo-900">
                    {formatPaiseCompact(forecastWeighted)}
                  </div>
                  <div className="text-[11px] text-indigo-600">
                    Sum of (deal value × stage probability) across all open deals
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="py-1 text-left font-medium">Stage</th>
                      <th className="py-1 text-right font-medium">Prob.</th>
                      <th className="py-1 text-right font-medium">Open ₹</th>
                      <th className="py-1 text-right font-medium">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_stage
                      .filter((s) => !s.is_lost)
                      .map((s) => (
                        <tr key={String(s.stage_id)} className="border-b border-slate-100">
                          <td className="py-1.5 text-slate-700">
                            <span
                              className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                              style={{ backgroundColor: s.color || "#94a3b8" }}
                            />
                            {s.stage_name}
                          </td>
                          <td className="py-1.5 text-right text-slate-600">
                            {Math.round(s.probability * 100)}%
                          </td>
                          <td className="py-1.5 text-right text-slate-700">
                            {formatPaiseCompact(s.total_paise)}
                          </td>
                          <td className="py-1.5 text-right font-medium text-indigo-700">
                            {formatPaiseCompact(s.weighted_paise)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[10px] text-slate-400">
                  Probability ramps linearly across non-terminal stages. You can adjust by
                  reordering stages.
                </div>
              </Panel>
            </div>

            {/* Monthly wins chart */}
            <Panel title="Won revenue · last 12 months" subtitle="Bucketed by close date">
              <div className="flex h-40 items-end gap-2">
                {data.monthly.map((m) => {
                  const pct =
                    m.won_paise === 0 ? 0 : Math.max(4, (m.won_paise / monthlyMax) * 100);
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative flex h-32 w-full items-end justify-center">
                        <div
                          className="w-full rounded-t bg-indigo-500 transition-all hover:bg-indigo-600"
                          style={{ height: `${pct}%` }}
                          title={`${m.month}: ${formatPaise(m.won_paise)} from ${m.won_count} deals`}
                        />
                      </div>
                      <div className="text-center text-[10px] text-slate-500">
                        {monthLabel(m.month)}
                      </div>
                      <div className="text-center text-[10px] font-medium text-slate-700">
                        {m.won_paise > 0 ? formatPaiseCompact(m.won_paise) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Agent leaderboard */}
            <Panel title="Sales team performance" subtitle={data.range.label}>
              {data.by_agent.length === 0 ? (
                <Empty>No active users yet.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="py-1.5 text-left font-medium">#</th>
                        <th className="py-1.5 text-left font-medium">Agent</th>
                        <th className="py-1.5 text-right font-medium">Open ₹</th>
                        <th className="py-1.5 text-right font-medium">Open #</th>
                        <th className="py-1.5 text-right font-medium">Won ₹</th>
                        <th className="py-1.5 text-right font-medium">Won #</th>
                        <th className="py-1.5 text-right font-medium">Lost #</th>
                        <th className="py-1.5 text-right font-medium">Win %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_agent.map((a, i) => (
                        <tr
                          key={String(a.user_id)}
                          className="border-b border-slate-100"
                        >
                          <td className="py-1.5 text-slate-400">
                            {i === 0 && a.won_paise > 0 ? "🏆" : i + 1}
                          </td>
                          <td className="py-1.5 font-medium text-slate-800">{a.name}</td>
                          <td className="py-1.5 text-right text-slate-700">
                            {formatPaiseCompact(a.open_paise)}
                          </td>
                          <td className="py-1.5 text-right text-slate-500">
                            {a.open_count}
                          </td>
                          <td className="py-1.5 text-right font-medium text-green-700">
                            {formatPaiseCompact(a.won_paise)}
                          </td>
                          <td className="py-1.5 text-right text-slate-500">
                            {a.won_count}
                          </td>
                          <td className="py-1.5 text-right text-slate-500">
                            {a.lost_count}
                          </td>
                          <td className="py-1.5 text-right text-slate-700">
                            {a.won_count + a.lost_count > 0
                              ? `${Math.round(a.win_rate * 100)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      {openDealId != null && (
        <DealDetailDialog
          dealId={openDealId}
          stages={stages}
          onClose={() => setOpenDealId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function PeriodPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "slate";
}) {
  const valueColor =
    tone === "green"
      ? "text-green-700"
      : tone === "slate"
        ? "text-slate-700"
        : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-semibold ${valueColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
      {children}
    </div>
  );
}

function monthLabel(m: string): string {
  // m = "YYYY-MM"
  const [y, mm] = m.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[Number(mm) - 1] + " " + y.slice(-2);
}
