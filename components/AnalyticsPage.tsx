"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Overview = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
  unique_customers: number;
  auto_reply_fires: number;
  ad_sourced_total: number;
  ad_sourced_recent: number;
  delivered_rate: number;
  read_rate: number;
  reply_rate: number;
};

type TopAd = { label: string; count: number };

type TemplateRow = {
  template_name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  delivered_rate: number;
  read_rate: number;
};

type AgentRow = {
  id: number;
  name: string;
  role: string;
  messages_sent: number;
  conversations_assigned: number;
  notes_written: number;
  broadcasts_created: number;
};

type DailyRow = {
  day: string;
  outbound: number;
  inbound: number;
  sent: number;
  delivered: number;
  read: number;
  delivered_rate: number;
  read_rate: number;
};

type PipelineStage = {
  id: number;
  name: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  count: number;
};

type AnalyticsData = {
  days: number;
  overview: Overview;
  templates: TemplateRow[];
  agents: AgentRow[];
  daily: DailyRow[];
  top_ads: TopAd[];
  heatmap: number[][]; // 7x24
  pipeline: { stages: PipelineStage[]; unstaged: number };
  followups: {
    overdue: number;
    pending: number;
    done: number;
    cancelled: number;
    failed: number;
  };
  new_contacts: Array<{ day: string; count: number }>;
  opt_status: { subscribed: number; opted_out: number };
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Tailwind colour values inlined — Recharts needs concrete hex.
const C = {
  green: "#16a34a",
  greenDark: "#15803d",
  sky: "#0284c7",
  amber: "#d97706",
  red: "#dc2626",
  purple: "#7c3aed",
  gray: "#94a3b8",
  pink: "#ec4899",
  indigo: "#4f46e5",
};

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${days}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const dailyData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((d) => ({
      day: d.day.slice(5), // "MM-DD"
      Outbound: d.outbound,
      Inbound: d.inbound,
      "Delivered %": Math.round(d.delivered_rate * 100),
      "Read %": Math.round(d.read_rate * 100),
    }));
  }, [data]);

  const templateChart = useMemo(() => {
    if (!data) return [];
    return data.templates.slice(0, 8).map((t) => ({
      name: t.template_name.length > 18 ? t.template_name.slice(0, 16) + "…" : t.template_name,
      Sent: t.sent,
      "Read %": Math.round(t.read_rate * 100),
    }));
  }, [data]);

  const pipelineChart = useMemo(() => {
    if (!data) return [];
    const arr = data.pipeline.stages.map((s) => ({
      name: s.name,
      value: s.count,
      color: s.color,
    }));
    if (data.pipeline.unstaged > 0) {
      arr.push({ name: "Un-staged", value: data.pipeline.unstaged, color: "#cbd5e1" });
    }
    return arr.filter((d) => d.value > 0);
  }, [data]);

  const followupChart = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Overdue", value: data.followups.overdue, color: C.red },
      { name: "Pending", value: data.followups.pending, color: C.amber },
      { name: "Done", value: data.followups.done, color: C.green },
      { name: "Failed", value: data.followups.failed, color: C.purple },
      { name: "Cancelled", value: data.followups.cancelled, color: C.gray },
    ].filter((d) => d.value > 0);
  }, [data]);

  const agentChart = useMemo(() => {
    if (!data) return [];
    return data.agents.slice(0, 8).map((a) => ({
      name: a.name,
      "Messages sent": a.messages_sent,
      "Notes": a.notes_written,
      "Broadcasts": a.broadcasts_created,
    }));
  }, [data]);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-white">
      <div className="flex items-center justify-between border-b border-wa-border bg-wa-panel px-6 py-4">
        <div>
          <div className="text-lg font-medium">Analytics</div>
          <div className="text-xs text-wa-textMuted">
            Your messaging performance {loading && "(refreshing…)"}
          </div>
        </div>
        <div className="flex gap-1">
          {[
            { label: "24h", d: 1 },
            { label: "7d", d: 7 },
            { label: "30d", d: 30 },
            { label: "90d", d: 90 },
          ].map((opt) => (
            <button
              key={opt.d}
              onClick={() => setDays(opt.d)}
              className={`rounded-full px-3 py-1 text-xs ${
                days === opt.d
                  ? "bg-wa-greenDark text-white"
                  : "bg-white text-wa-text hover:bg-wa-panelDark"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="flex flex-1 items-center justify-center text-sm text-wa-textMuted">
          Loading…
        </div>
      ) : (
        <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
          {/* KPI cards */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Kpi label="Sent" value={data.overview.sent} />
            <Kpi
              label="Delivered"
              value={data.overview.delivered}
              hint={pct(data.overview.delivered_rate)}
              tone="green"
            />
            <Kpi
              label="Read"
              value={data.overview.read}
              hint={pct(data.overview.read_rate)}
              tone="sky"
            />
            <Kpi label="Failed" value={data.overview.failed} tone="red" />
            <Kpi label="Inbound" value={data.overview.inbound} tone="amber" />
            <Kpi label="Customers" value={data.overview.unique_customers} />
            <Kpi label="Auto-replies" value={data.overview.auto_reply_fires} />
            <Kpi
              label="From ads"
              value={data.overview.ad_sourced_recent}
              hint={`${data.overview.ad_sourced_total} total`}
              tone="amber"
            />
          </section>

          {/* Daily activity area chart */}
          <section className="rounded-lg border border-wa-border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Daily activity</div>
              <div className="text-[10px] text-wa-textMuted">
                Last {data.daily.length} day{data.daily.length === 1 ? "" : "s"} of inbound + outbound message volume
              </div>
            </div>
            {dailyData.length === 0 ? (
              <EmptyChart label="No messages yet in this range." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.greenDark} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={C.greenDark} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.amber} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={C.amber} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="Outbound"
                    stroke={C.greenDark}
                    fill="url(#outFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="Inbound"
                    stroke={C.amber}
                    fill="url(#inFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* Delivery funnel + delivery-rate trend, side by side */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-wa-border bg-white p-5">
              <div className="mb-3 text-sm font-medium">Delivery funnel</div>
              <FunnelBar label="Sent" count={data.overview.sent} total={data.overview.sent} />
              <FunnelBar
                label="Delivered"
                count={data.overview.delivered}
                total={data.overview.sent}
                tone="green"
              />
              <FunnelBar
                label="Read"
                count={data.overview.read}
                total={data.overview.sent}
                tone="sky"
              />
              <div className="mt-3 border-t border-wa-border pt-3 text-xs text-wa-textMuted">
                Reply rate (inbound per outbound): <b>{pct(data.overview.reply_rate)}</b>
              </div>
            </div>

            <div className="rounded-lg border border-wa-border bg-white p-5">
              <div className="mb-3 text-sm font-medium">Delivery & read rate trend</div>
              {dailyData.length === 0 ? (
                <EmptyChart label="No outbound messages yet." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Delivered %" stroke={C.green} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Read %" stroke={C.sky} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Pipeline pie + Follow-up status pie */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-wa-border bg-white p-5">
              <div className="mb-3 text-sm font-medium">Pipeline distribution</div>
              {pipelineChart.length === 0 ? (
                <EmptyChart label="No staged contacts yet. Drag leads into the Pipeline tab." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pipelineChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      label={(e: any) => `${e.name} (${e.value})`}
                      labelLine={false}
                    >
                      {pipelineChart.map((s, i) => (
                        <Cell key={i} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border border-wa-border bg-white p-5">
              <div className="mb-3 text-sm font-medium">Follow-up status</div>
              {followupChart.length === 0 ? (
                <EmptyChart label="No follow-ups yet." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={followupChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      label={(e: any) => `${e.name} (${e.value})`}
                      labelLine={false}
                    >
                      {followupChart.map((s, i) => (
                        <Cell key={i} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Hour-of-day heatmap */}
          <section className="rounded-lg border border-wa-border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Inbound heatmap (when customers message us)</div>
              <div className="text-[10px] text-wa-textMuted">Server time · last {data.days} days</div>
            </div>
            <Heatmap heatmap={data.heatmap} />
          </section>

          {/* Per-template chart + table */}
          <section className="rounded-lg border border-wa-border bg-white p-5">
            <div className="mb-3 text-sm font-medium">Per-template performance</div>
            {data.templates.length === 0 ? (
              <EmptyChart label="No template sends in this range." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={templateChart} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} angle={-15} textAnchor="end" interval={0} />
                    <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Sent" fill={C.greenDark} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="Read %" stroke={C.sky} strokeWidth={2} dot />
                  </BarChart>
                </ResponsiveContainer>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-wa-textMuted">
                      <th className="border-b border-wa-border py-2">Template</th>
                      <th className="border-b border-wa-border py-2 text-right">Sent</th>
                      <th className="border-b border-wa-border py-2 text-right">Delivered</th>
                      <th className="border-b border-wa-border py-2 text-right">Read</th>
                      <th className="border-b border-wa-border py-2 text-right">Failed</th>
                      <th className="border-b border-wa-border py-2 text-right">Delivered %</th>
                      <th className="border-b border-wa-border py-2 text-right">Read %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.templates.map((t) => (
                      <tr key={t.template_name}>
                        <td className="border-b border-wa-border py-2 font-medium">{t.template_name}</td>
                        <td className="border-b border-wa-border py-2 text-right">{t.sent}</td>
                        <td className="border-b border-wa-border py-2 text-right">{t.delivered}</td>
                        <td className="border-b border-wa-border py-2 text-right">{t.read}</td>
                        <td className="border-b border-wa-border py-2 text-right text-red-600">{t.failed || ""}</td>
                        <td className="border-b border-wa-border py-2 text-right">{pct(t.delivered_rate)}</td>
                        <td className="border-b border-wa-border py-2 text-right">{pct(t.read_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          {/* Per-agent chart + table */}
          <section className="rounded-lg border border-wa-border bg-white p-5">
            <div className="mb-3 text-sm font-medium">Per-agent activity</div>
            {data.agents.length === 0 ? (
              <EmptyChart label="No active users yet." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={agentChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Messages sent" fill={C.greenDark} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Notes" fill={C.purple} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Broadcasts" fill={C.sky} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-wa-textMuted">
                      <th className="border-b border-wa-border py-2">Agent</th>
                      <th className="border-b border-wa-border py-2">Role</th>
                      <th className="border-b border-wa-border py-2 text-right">Messages sent</th>
                      <th className="border-b border-wa-border py-2 text-right">Assigned</th>
                      <th className="border-b border-wa-border py-2 text-right">Notes</th>
                      <th className="border-b border-wa-border py-2 text-right">Broadcasts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((a) => (
                      <tr key={a.id}>
                        <td className="border-b border-wa-border py-2 font-medium">{a.name}</td>
                        <td className="border-b border-wa-border py-2">
                          <span className="rounded bg-wa-panel px-2 py-0.5 text-[10px]">{a.role}</span>
                        </td>
                        <td className="border-b border-wa-border py-2 text-right">{a.messages_sent}</td>
                        <td className="border-b border-wa-border py-2 text-right">{a.conversations_assigned}</td>
                        <td className="border-b border-wa-border py-2 text-right">{a.notes_written}</td>
                        <td className="border-b border-wa-border py-2 text-right">{a.broadcasts_created}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          {/* Lead acquisition + Subscriber breakdown */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-wa-border bg-white p-5">
              <div className="mb-3 text-sm font-medium">New contacts per day</div>
              {data.new_contacts.length === 0 ? (
                <EmptyChart label="No new contacts in this range." />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={data.new_contacts.map((d) => ({ day: d.day.slice(5), count: d.count }))}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" fill={C.indigo} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border border-wa-border bg-white p-5">
              <div className="mb-3 text-sm font-medium">Subscriber status</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 p-4">
                  <div className="text-[10px] uppercase tracking-wide text-green-700">Subscribed</div>
                  <div className="text-2xl font-semibold text-green-800">
                    {data.opt_status.subscribed.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-red-50 p-4">
                  <div className="text-[10px] uppercase tracking-wide text-red-700">Opted-out</div>
                  <div className="text-2xl font-semibold text-red-800">
                    {data.opt_status.opted_out.toLocaleString()}
                  </div>
                </div>
              </div>
              {data.opt_status.opted_out > 0 && (
                <div className="mt-3 text-[11px] text-wa-textMuted">
                  Opt-out rate:{" "}
                  <b>
                    {pct(
                      data.opt_status.opted_out /
                        (data.opt_status.subscribed + data.opt_status.opted_out || 1),
                    )}
                  </b>{" "}
                  · these contacts are excluded from broadcasts and automation.
                </div>
              )}
            </div>
          </section>

          {/* Top ads (existing table) */}
          <section className="rounded-lg border border-wa-border bg-white p-5">
            <div className="mb-1 text-sm font-medium">Top click-to-WhatsApp ads</div>
            <div className="mb-3 text-[10px] text-wa-textMuted">
              Counts contacts whose first message came from a Meta ad, scoped to activity in the
              selected range.
            </div>
            {data.top_ads.length === 0 ? (
              <EmptyChart label="No ad-sourced conversations in this range." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-wa-textMuted">
                    <th className="border-b border-wa-border py-2">Ad (headline or ID)</th>
                    <th className="border-b border-wa-border py-2 text-right">Contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_ads.map((ad) => (
                    <tr key={ad.label}>
                      <td className="border-b border-wa-border py-2 font-medium">{ad.label}</td>
                      <td className="border-b border-wa-border py-2 text-right">{ad.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "green" | "red" | "sky" | "amber";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "sky"
        ? "text-sky-600"
        : tone === "amber"
          ? "text-amber-600"
          : tone === "green"
            ? "text-green-700"
            : "text-wa-text";
  return (
    <div className="rounded-lg border border-wa-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-wa-textMuted">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] text-wa-textMuted">{hint}</div>}
    </div>
  );
}

function FunnelBar({
  label,
  count,
  total,
  tone = "default",
}: {
  label: string;
  count: number;
  total: number;
  tone?: "default" | "green" | "sky";
}) {
  const width = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor =
    tone === "green" ? "bg-green-500" : tone === "sky" ? "bg-sky-500" : "bg-wa-greenDark";
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-wa-textMuted">
          {count.toLocaleString()}
          {total > 0 && ` · ${Math.round((count / total) * 100)}%`}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded bg-wa-panel">
        <div className={`h-full ${barColor}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Heatmap({ heatmap }: { heatmap: number[][] }) {
  const max = Math.max(1, ...heatmap.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th className="px-1 text-wa-textMuted"></th>
            {Array.from({ length: 24 }).map((_, h) => (
              <th key={h} className="w-6 px-0.5 text-center font-normal text-wa-textMuted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.map((row, dow) => (
            <tr key={dow}>
              <td className="pr-2 font-medium text-wa-textMuted">{DOW[dow]}</td>
              {row.map((n, h) => {
                const intensity = n / max;
                const bg =
                  n === 0 ? "#f8fafc" : `rgba(22, 163, 74, ${0.15 + intensity * 0.85})`;
                return (
                  <td
                    key={h}
                    title={`${DOW[dow]} ${h}:00 — ${n} inbound`}
                    style={{ backgroundColor: bg }}
                    className="h-5 w-6 border border-white text-center text-[9px] text-white/0"
                  >
                    {n > 0 && intensity > 0.5 ? n : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-wa-textMuted">
        <span>Less</span>
        <div className="flex">
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((a) => (
            <div
              key={a}
              className="h-3 w-3"
              style={{ backgroundColor: `rgba(22, 163, 74, ${a})` }}
            />
          ))}
        </div>
        <span>More</span>
        <span className="ml-auto">Peak: {max} messages in a single hour</span>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded border border-dashed border-wa-border text-xs text-wa-textMuted">
      {label}
    </div>
  );
}
