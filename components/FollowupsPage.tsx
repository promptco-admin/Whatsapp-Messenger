"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FollowupDialog, FollowupRecord, FollowupDialogContact } from "./FollowupDialog";

type Bucket = "overdue" | "today" | "upcoming" | "done" | "failed" | "all";
type Assignee = "all" | "me" | "unassigned";
type SortKey = "due_asc" | "due_desc" | "created_desc" | "contact_asc";

function tsFU(s: string | null | undefined): number {
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

type Row = FollowupRecord & {
  wa_id: string;
  contact_name: string | null;
  contact_tags: string | null;
  pipeline_stage_id: number | null;
  assignee_name: string | null;
};

type Summary = {
  overdue: number;
  due_today: number;
  upcoming: number;
  failed: number;
};

const BUCKETS: Array<{ key: Bucket; label: string; tone: string }> = [
  { key: "overdue", label: "Overdue", tone: "text-red-600" },
  { key: "today", label: "Today", tone: "text-amber-600" },
  { key: "upcoming", label: "Upcoming", tone: "text-blue-600" },
  { key: "done", label: "Done", tone: "text-green-600" },
  { key: "failed", label: "Failed", tone: "text-red-700" },
];

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function relativeDue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ms = d.getTime() - Date.now();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(mins / 60);
  const days = Math.round(hrs / 24);
  const lead = ms >= 0 ? "in" : "";
  const trail = ms >= 0 ? "" : "ago";
  if (mins < 60) return `${lead} ${mins}m ${trail}`.trim();
  if (hrs < 48) return `${lead} ${hrs}h ${trail}`.trim();
  return `${lead} ${days}d ${trail}`.trim();
}

export function FollowupsPage() {
  const [bucket, setBucket] = useState<Bucket>("today");
  const [assignee, setAssignee] = useState<Assignee>("all");
  const [sort, setSort] = useState<SortKey>("due_asc");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({
    overdue: 0,
    due_today: 0,
    upcoming: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rowsRes, sumRes] = await Promise.all([
        fetch(`/api/followups?bucket=${bucket}&assignee=${assignee}`),
        fetch("/api/followups/summary"),
      ]);
      const j = await rowsRes.json();
      setRows(j.followups || []);
      if (sumRes.ok) {
        const s = await sumRes.json();
        setSummary({
          overdue: s.overdue || 0,
          due_today: s.due_today || 0,
          upcoming: s.upcoming || 0,
          failed: s.failed || 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [bucket, assignee]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sortedRows = useMemo(() => {
    const list = rows.slice();
    list.sort((a, b) => {
      switch (sort) {
        case "due_asc":
          return tsFU(a.due_at) - tsFU(b.due_at);
        case "due_desc":
          return tsFU(b.due_at) - tsFU(a.due_at);
        case "created_desc":
          return tsFU((b as any).created_at) - tsFU((a as any).created_at);
        case "contact_asc":
          return (a.contact_name || a.wa_id || "").localeCompare(
            b.contact_name || b.wa_id || "",
          );
      }
    });
    return list;
  }, [rows, sort]);

  const editingContact: FollowupDialogContact | null = useMemo(
    () =>
      editing
        ? {
            id: editing.contact_id,
            name: editing.contact_name,
            wa_id: editing.wa_id,
          }
        : null,
    [editing],
  );

  async function quickAction(row: Row, action: "send_now" | "snooze" | "done" | "cancel") {
    if (action === "send_now" && !confirm(`Send the follow-up message to ${row.contact_name || row.wa_id} now?`)) {
      return;
    }
    let body: any;
    if (action === "send_now") body = { action: "send_now" };
    else if (action === "snooze") body = { action: "snooze", minutes: 60 * 24 };
    else if (action === "done") body = { status: "done" };
    else body = { status: "cancelled" };
    const res = await fetch(`/api/followups/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Action failed");
      return;
    }
    refresh();
  }

  return (
    <div className="flex h-full flex-col bg-wa-bg">
      <div className="flex items-center justify-between border-b border-wa-border bg-white px-6 py-3">
        <div>
          <div className="text-base font-semibold">Follow-ups</div>
          <div className="text-xs text-wa-textMuted">
            Tasks tied to leads — tracked, snoozable, optionally auto-sending.
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <SummaryChip label="Overdue" value={summary.overdue} tone="text-red-600" />
          <SummaryChip label="Today" value={summary.due_today} tone="text-amber-600" />
          <SummaryChip label="Upcoming" value={summary.upcoming} tone="text-blue-600" />
          {summary.failed > 0 && (
            <SummaryChip label="Failed" value={summary.failed} tone="text-red-700" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-wa-border bg-white px-6 py-2">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => setBucket(b.key)}
            className={`rounded-full px-3 py-1 text-xs ${
              bucket === b.key
                ? "bg-wa-greenDark text-white"
                : `bg-wa-panel ${b.tone} hover:bg-wa-border/40`
            }`}
          >
            {b.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-wa-textMuted">Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-wa-border px-2 py-1 outline-none"
          >
            <option value="due_asc">Due soonest</option>
            <option value="due_desc">Due latest</option>
            <option value="created_desc">Recently created</option>
            <option value="contact_asc">Contact A → Z</option>
          </select>
          <span className="text-wa-textMuted">Assignee:</span>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value as Assignee)}
            className="rounded border border-wa-border px-2 py-1 outline-none"
          >
            <option value="all">All</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-6 text-sm text-wa-textMuted">Loading…</div>}
        {!loading && sortedRows.length === 0 && (
          <div className="p-10 text-center text-sm text-wa-textMuted">
            No follow-ups in this bucket.
            <div className="mt-2 text-xs">
              Open a chat or contact and click "Add follow-up" to create one.
            </div>
          </div>
        )}
        <div className="divide-y divide-wa-border">
          {sortedRows.map((row) => {
            const overdue = row.status === "pending" && new Date(row.due_at) < new Date();
            return (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 bg-white px-6 py-3 hover:bg-wa-panel/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditing(row)}
                      className="truncate text-left text-sm font-medium text-wa-text hover:underline"
                    >
                      {row.title}
                    </button>
                    {row.auto_send ? (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">
                        auto-send
                      </span>
                    ) : null}
                    {row.status === "failed" && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                        failed
                      </span>
                    )}
                    {row.status === "done" && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                        done
                      </span>
                    )}
                    {row.status === "cancelled" && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                        cancelled
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-wa-textMuted">
                    <span className="font-medium text-wa-text">
                      {row.contact_name || `+${row.wa_id}`}
                    </span>
                    {row.contact_name && <span> · +{row.wa_id}</span>}
                    {row.assignee_name && <span> · 👤 {row.assignee_name}</span>}
                  </div>
                  {row.note && (
                    <div className="mt-1 line-clamp-2 text-xs text-wa-textMuted">{row.note}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={`text-xs ${overdue ? "text-red-600" : "text-wa-textMuted"}`}>
                    {formatDue(row.due_at)}
                    <span className="ml-1 text-[10px]">({relativeDue(row.due_at)})</span>
                  </div>
                  {row.status === "pending" || row.status === "failed" ? (
                    <div className="flex gap-1 text-[11px]">
                      {row.auto_send && (
                        <button
                          onClick={() => quickAction(row, "send_now")}
                          className="rounded bg-wa-greenDark px-2 py-0.5 text-white hover:bg-wa-green"
                        >
                          Send now
                        </button>
                      )}
                      <button
                        onClick={() => quickAction(row, "snooze")}
                        className="rounded border border-wa-border bg-white px-2 py-0.5 hover:bg-wa-panel"
                      >
                        +1 day
                      </button>
                      <button
                        onClick={() => quickAction(row, "done")}
                        className="rounded border border-wa-border bg-white px-2 py-0.5 hover:bg-wa-panel"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => quickAction(row, "cancel")}
                        className="rounded border border-wa-border bg-white px-2 py-0.5 text-red-600 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <FollowupDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
        contact={editingContact}
        initial={editing}
      />
    </div>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded border border-wa-border bg-white px-3 py-1">
      <span className={`mr-1 font-semibold ${tone}`}>{value}</span>
      <span className="text-wa-textMuted">{label}</span>
    </div>
  );
}
