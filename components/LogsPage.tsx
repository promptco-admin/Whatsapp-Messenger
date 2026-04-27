"use client";

/**
 * Admin-only Logs page. Two tabs:
 *  - Activity — who did what, when. Filterable by user, action prefix,
 *    free-text search, and date range.
 *  - Errors — system-level failures. Filterable by source.
 *
 * If a non-admin lands here we render a friendly notice instead of crashing
 * (the API itself enforces the role check).
 */
import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Tab = "activity" | "errors";

type ActivityRow = {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  contact_id: number | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type ErrorRow = {
  id: number;
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  contact_id: number | null;
  created_at: string;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Top-level family used by the action-prefix dropdown. Keep in sync with audit. */
const ACTION_FAMILIES = [
  "auth",
  "message",
  "contact",
  "followup",
  "broadcast",
  "sequence",
  "flow",
  "auto_reply",
  "quick_reply",
  "pipeline_stage",
  "user",
  "note",
];

export function LogsPage() {
  const me = useCurrentUser();
  const [tab, setTab] = useState<Tab>("activity");

  if (me.loading) {
    return <div className="p-8 text-sm text-wa-textMuted">Loading…</div>;
  }
  if (me.user?.role !== "admin") {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-xl font-semibold">Logs</h1>
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Logs are admin-only. Ask an admin if you need to see system activity
          or your own action history.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wa-border bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">Logs</h1>
        <div className="flex gap-1 rounded bg-wa-panel p-1 text-xs">
          <button
            onClick={() => setTab("activity")}
            className={`rounded px-3 py-1 font-medium ${
              tab === "activity" ? "bg-white shadow" : "text-wa-textMuted hover:text-wa-text"
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setTab("errors")}
            className={`rounded px-3 py-1 font-medium ${
              tab === "errors" ? "bg-white shadow" : "text-wa-textMuted hover:text-wa-text"
            }`}
          >
            Errors
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "activity" ? <ActivityTab /> : <ErrorsTab />}
      </div>
    </div>
  );
}

function ActivityTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [users, setUsers] = useState<Array<{ id: number | null; name: string | null }>>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [userFilter, setUserFilter] = useState<string>("");
  const [actionPrefix, setActionPrefix] = useState<string>("");
  const [actionExact, setActionExact] = useState<string>("");
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (userFilter !== "") p.set("user_id", userFilter);
    if (actionPrefix) p.set("action_prefix", `${actionPrefix}.`);
    if (actionExact) p.set("action", actionExact);
    if (search.trim()) p.set("q", search.trim());
    if (since) p.set("since", new Date(since).toISOString());
    if (until) p.set("until", new Date(until).toISOString());
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [userFilter, actionPrefix, actionExact, search, since, until, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/logs/activity?${queryString}`)
      .then((r) => (r.ok ? r.json() : { activity: [], users: [], actions: [], total: 0 }))
      .then((j) => {
        if (cancelled) return;
        setRows(j.activity || []);
        setUsers(j.users || []);
        setActions(j.actions || []);
        setTotal(j.total || 0);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function resetFilters() {
    setUserFilter("");
    setActionPrefix("");
    setActionExact("");
    setSearch("");
    setSince("");
    setUntil("");
    setOffset(0);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wa-border bg-wa-panel px-6 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="User">
            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            >
              <option value="">Anyone</option>
              <option value="0">System (no user)</option>
              {users.map((u) =>
                u.id ? (
                  <option key={u.id} value={u.id}>
                    {u.name || `User #${u.id}`}
                  </option>
                ) : null,
              )}
            </select>
          </Field>
          <Field label="Action family">
            <select
              value={actionPrefix}
              onChange={(e) => {
                setActionPrefix(e.target.value);
                setActionExact("");
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            >
              <option value="">Any</option>
              {ACTION_FAMILIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Specific action">
            <select
              value={actionExact}
              onChange={(e) => {
                setActionExact(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            >
              <option value="">Any</option>
              {actions
                .filter((a) => !actionPrefix || a.startsWith(`${actionPrefix}.`))
                .map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Since">
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => {
                setSince(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Until">
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => {
                setUntil(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Search">
            <input
              type="search"
              placeholder="text in summary…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            />
          </Field>
          <button
            onClick={resetFilters}
            className="rounded border border-wa-border bg-white px-3 py-1 text-xs hover:bg-wa-panel"
          >
            Reset
          </button>
          <div className="ml-auto text-xs text-wa-textMuted">
            {loading ? "Loading…" : `${total.toLocaleString()} matching event${total === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-wa-panel text-xs text-wa-textMuted">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Who</th>
              <th className="px-4 py-2 text-left">Action</th>
              <th className="px-4 py-2 text-left">What</th>
              <th className="px-4 py-2 text-left">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-wa-textMuted">
                  No events match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-wa-border hover:bg-wa-panel/50">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-wa-textMuted">
                  {formatTimestamp(r.created_at)}
                </td>
                <td className="px-4 py-2">
                  {r.user_name ? (
                    <span>
                      {r.user_name}
                      {r.user_role && (
                        <span className="ml-1 rounded bg-wa-panelDark px-1 text-[9px] text-wa-textMuted">
                          {r.user_role}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="rounded bg-wa-panelDark px-1.5 py-0.5 text-[10px] text-wa-textMuted">
                      system
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px]">{r.action}</td>
                <td className="px-4 py-2">
                  {r.summary || <span className="text-wa-textMuted">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[10px] text-wa-textMuted">
                  {r.ip_address || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-wa-border bg-white px-4 py-2 text-xs">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          className="rounded border border-wa-border px-2 py-1 disabled:opacity-50"
        >
          ← Newer
        </button>
        <span className="text-wa-textMuted">
          {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
        </span>
        <button
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
          className="rounded border border-wa-border px-2 py-1 disabled:opacity-50"
        >
          Older →
        </button>
      </div>
    </div>
  );
}

function ErrorsTab() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (source) p.set("source", source);
    if (search.trim()) p.set("q", search.trim());
    if (since) p.set("since", new Date(since).toISOString());
    if (until) p.set("until", new Date(until).toISOString());
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [source, search, since, until, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/logs/errors?${queryString}`)
      .then((r) => (r.ok ? r.json() : { errors: [], sources: [], total: 0 }))
      .then((j) => {
        if (cancelled) return;
        setRows(j.errors || []);
        setSources(j.sources || []);
        setTotal(j.total || 0);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wa-border bg-wa-panel px-6 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Source">
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            >
              <option value="">Any</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Since">
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => {
                setSince(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Until">
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => {
                setUntil(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Search">
            <input
              type="search"
              placeholder="text in error message…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
            />
          </Field>
          <div className="ml-auto text-xs text-wa-textMuted">
            {loading ? "Loading…" : `${total.toLocaleString()} error${total === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-wa-panel text-xs text-wa-textMuted">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-left">Message</th>
              <th className="px-4 py-2 text-left">Context</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-wa-textMuted">
                  No errors logged in this range. Nice.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-wa-border hover:bg-wa-panel/50">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-wa-textMuted">
                  {formatTimestamp(r.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px]">{r.source}</td>
                <td className="px-4 py-2">
                  <div className="text-red-700">{r.message}</div>
                </td>
                <td className="px-4 py-2">
                  {r.context ? (
                    <pre className="overflow-x-auto rounded bg-wa-panel/70 p-1 font-mono text-[10px] text-wa-textMuted">
                      {JSON.stringify(r.context, null, 0)}
                    </pre>
                  ) : (
                    <span className="text-wa-textMuted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-wa-border bg-white px-4 py-2 text-xs">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          className="rounded border border-wa-border px-2 py-1 disabled:opacity-50"
        >
          ← Newer
        </button>
        <span className="text-wa-textMuted">
          {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
        </span>
        <button
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
          className="rounded border border-wa-border px-2 py-1 disabled:opacity-50"
        >
          Older →
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-[10px] uppercase tracking-wide text-wa-textMuted">
      {label}
      {children}
    </label>
  );
}
