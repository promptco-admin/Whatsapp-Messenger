"use client";

import { useEffect, useMemo, useState } from "react";
import type { Broadcast } from "@/lib/types";
import { BroadcastComposer } from "./BroadcastComposer";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { displayPhone } from "@/lib/display";

type StatusFilter =
  | "all"
  | "scheduled"
  | "running"
  | "completed"
  | "failed";

type SortKey =
  | "newest"
  | "oldest"
  | "most_sent"
  | "highest_read_rate";

const STATUS_PILLS: Array<{ key: StatusFilter; label: string; tone: string }> = [
  { key: "all", label: "All", tone: "" },
  { key: "scheduled", label: "Scheduled", tone: "text-purple-700" },
  { key: "running", label: "Running", tone: "text-blue-700" },
  { key: "completed", label: "Completed", tone: "text-green-700" },
  { key: "failed", label: "Has failures", tone: "text-red-700" },
];

function tsBC(s: string | null | undefined): number {
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const s = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(s).getTime();
  if (isNaN(d)) return "";
  const diff = Date.now() - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatScheduled(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BroadcastsPage() {
  const { user } = useCurrentUser();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ broadcast: any; recipients: any[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch("/api/broadcasts", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setBroadcasts(j.broadcasts || []);
  }

  async function loadDetail(id: number) {
    const res = await fetch(`/api/broadcasts/${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setDetail(j);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selected == null) {
      setDetail(null);
      return;
    }
    loadDetail(selected);
    const t = setInterval(() => loadDetail(selected), 3000);
    return () => clearInterval(t);
  }, [selected]);

  const visibleBroadcasts = useMemo(() => {
    let list = broadcasts.slice();
    // Status filter
    if (statusFilter === "failed") list = list.filter((b) => (b.failed || 0) > 0);
    else if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    // Search
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q) || b.template_name.toLowerCase().includes(q));
    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case "newest":
          return tsBC(b.created_at) - tsBC(a.created_at);
        case "oldest":
          return tsBC(a.created_at) - tsBC(b.created_at);
        case "most_sent":
          return (b.sent || 0) - (a.sent || 0);
        case "highest_read_rate": {
          const ar = a.sent ? (a.read || 0) / a.sent : 0;
          const br = b.sent ? (b.read || 0) / b.sent : 0;
          return br - ar;
        }
      }
    });
    return list;
  }, [broadcasts, statusFilter, sort, search]);

  const counts = useMemo(() => {
    const m: Record<StatusFilter, number> = {
      all: broadcasts.length,
      scheduled: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const b of broadcasts) {
      if (b.status === "scheduled") m.scheduled++;
      if (b.status === "running") m.running++;
      if (b.status === "completed") m.completed++;
      if ((b.failed || 0) > 0) m.failed++;
    }
    return m;
  }, [broadcasts]);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-3 py-3 md:px-6 md:py-4">
        <div>
          <div className="text-lg font-medium">Broadcasts</div>
          <div className="text-xs text-wa-textMuted">
            Send an approved template to a group of contacts.
          </div>
        </div>
        <button
          onClick={() => setComposeOpen(true)}
          className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + New broadcast
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-wa-border bg-white px-3 py-2 text-xs md:px-6">
        {STATUS_PILLS.map((p) => (
          <button
            key={p.key}
            onClick={() => setStatusFilter(p.key)}
            className={`rounded-full px-3 py-1 ${
              statusFilter === p.key
                ? "bg-wa-greenDark text-white"
                : `bg-wa-panel hover:bg-wa-border/40 ${p.tone}`
            }`}
          >
            {p.label}
            <span
              className={`ml-1 text-[10px] ${
                statusFilter === p.key ? "text-white/80" : "text-wa-textMuted"
              }`}
            >
              ({counts[p.key]})
            </span>
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or template…"
          className="ml-2 w-56 rounded border border-wa-border px-2 py-1 outline-none"
        />
        <label className="ml-auto flex items-center gap-1 text-wa-textMuted">
          Sort:
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-wa-border px-2 py-1 outline-none"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="most_sent">Most sent</option>
            <option value="highest_read_rate">Highest read rate</option>
          </select>
        </label>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {visibleBroadcasts.length === 0 && (
            <div className="p-8 text-center text-sm text-wa-textMuted">
              {broadcasts.length === 0
                ? 'No broadcasts yet. Click "+ New broadcast" to send one.'
                : "No broadcasts match the current filters."}
            </div>
          )}
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-wa-textMuted">
                <th className="border-b border-wa-border px-6 py-2">Name</th>
                <th className="border-b border-wa-border px-6 py-2">Template</th>
                <th className="border-b border-wa-border px-6 py-2">Segment</th>
                <th className="border-b border-wa-border px-6 py-2">Status</th>
                <th className="border-b border-wa-border px-6 py-2">Sent</th>
                <th className="border-b border-wa-border px-6 py-2">Delivered</th>
                <th className="border-b border-wa-border px-6 py-2">Read</th>
                <th className="border-b border-wa-border px-6 py-2">Failed</th>
                <th className="border-b border-wa-border px-6 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {visibleBroadcasts.map((b) => (
                <tr
                  key={b.id}
                  className={`cursor-pointer hover:bg-wa-panel ${
                    selected === b.id ? "bg-wa-panel" : ""
                  }`}
                  onClick={() => setSelected(b.id)}
                >
                  <td className="border-b border-wa-border px-6 py-2 font-medium">{b.name}</td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">
                    {b.template_name} ({b.language})
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">
                    {b.segment_tag ? `#${b.segment_tag}` : "All"}
                  </td>
                  <td className="border-b border-wa-border px-6 py-2">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">
                    {b.sent}/{b.total} ({pct(b.sent, b.total)})
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">{b.delivered}</td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">{b.read}</td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs text-red-600">
                    {b.failed || ""}
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs text-wa-textMuted">
                    {b.status === "scheduled" && b.scheduled_for
                      ? `⏱ ${formatScheduled(b.scheduled_for)}`
                      : timeAgo(b.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected != null && detail && (
          <aside className="w-96 flex-none overflow-y-auto border-l border-wa-border bg-wa-panel">
            <div className="flex items-center justify-between border-b border-wa-border bg-white px-4 py-3">
              <div className="text-sm font-medium">{detail.broadcast.name}</div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-wa-textMuted hover:text-wa-text"
              >
                Close
              </button>
            </div>
            <div className="p-4 text-xs">
              <div className="mb-2">
                <b>Template:</b> {detail.broadcast.template_name} ({detail.broadcast.language})
              </div>
              <div className="mb-2">
                <b>Status:</b> <StatusBadge status={detail.broadcast.status} />
              </div>
              <div className="mb-4 grid grid-cols-4 gap-2 rounded bg-white p-2 text-center">
                <div>
                  <div className="text-[10px] text-wa-textMuted">Total</div>
                  <div className="text-sm font-medium">{detail.broadcast.total}</div>
                </div>
                <div>
                  <div className="text-[10px] text-wa-textMuted">Sent</div>
                  <div className="text-sm font-medium">{detail.broadcast.sent}</div>
                </div>
                <div>
                  <div className="text-[10px] text-wa-textMuted">Read</div>
                  <div className="text-sm font-medium">{detail.broadcast.read}</div>
                </div>
                <div>
                  <div className="text-[10px] text-wa-textMuted">Failed</div>
                  <div className="text-sm font-medium text-red-600">{detail.broadcast.failed}</div>
                </div>
              </div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                Recipients
              </div>
              <div className="scroll-thin max-h-[calc(100vh-320px)] overflow-y-auto rounded bg-white">
                {detail.recipients.map((r: any) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-wa-border px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-medium">{r.name || displayPhone(r.wa_id, user)}</div>
                      {r.error && (
                        <div className="text-[10px] text-red-600">{r.error}</div>
                      )}
                    </div>
                    <StatusBadge status={r.status} small />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      <BroadcastComposer
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={(id) => {
          load();
          setSelected(id);
        }}
      />
    </div>
  );
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    scheduled: "bg-purple-100 text-purple-800",
    running: "bg-blue-100 text-blue-800",
    sent: "bg-gray-100 text-gray-700",
    delivered: "bg-green-100 text-green-800",
    read: "bg-sky-100 text-sky-800",
    failed: "bg-red-100 text-red-700",
    completed: "bg-green-100 text-green-800",
  };
  const cls = map[status] || "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block rounded ${cls} ${
        small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      {status}
    </span>
  );
}
