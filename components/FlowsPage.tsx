"use client";

import { useEffect, useState } from "react";
import { FlowEditor } from "./FlowEditor";

type FlowRow = {
  id: number;
  name: string;
  description: string | null;
  active: number;
  trigger_type: string;
  trigger_config: string | null;
  created_at: string;
  updated_at: string;
  run_count: number;
  active_runs: number;
};

export function FlowsPage() {
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/flows", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setFlows(j.flows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createFlow() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trigger_type: "manual" }),
    });
    if (res.ok) {
      const j = await res.json();
      setCreating(false);
      setNewName("");
      setEditId(j.id);
    }
  }

  async function toggle(f: FlowRow) {
    await fetch(`/api/flows/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !f.active }),
    });
    load();
  }

  async function remove(f: FlowRow) {
    if (!confirm(`Delete flow "${f.name}"? This cannot be undone.`)) return;
    await fetch(`/api/flows/${f.id}`, { method: "DELETE" });
    load();
  }

  if (editId !== null) {
    return (
      <FlowEditor
        flowId={editId}
        onClose={() => {
          setEditId(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-3 py-3 md:px-6 md:py-4">
        <div className="min-w-0 flex-1">
          <div className="text-lg font-medium">Flows</div>
          <div className="text-xs text-wa-textMuted">
            Build chatbot flows: trigger → send messages → ask questions → branch by keyword
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex-none rounded-full bg-wa-greenDark px-4 py-2 text-xs font-medium text-white hover:bg-wa-green"
        >
          + New flow
        </button>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 overflow-auto p-3 md:p-6">
        {loading && flows.length === 0 && (
          <div className="py-10 text-center text-sm text-wa-textMuted">Loading…</div>
        )}
        {!loading && flows.length === 0 && (
          <div className="mt-10 rounded-lg border border-dashed border-wa-border p-10 text-center text-sm text-wa-textMuted">
            No flows yet. Click <b>+ New flow</b> to build your first chatbot.
          </div>
        )}
        {flows.length > 0 && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-wa-textMuted">
                <th className="border-b border-wa-border py-2">Name</th>
                <th className="border-b border-wa-border py-2">Trigger</th>
                <th className="border-b border-wa-border py-2 text-right">Runs</th>
                <th className="border-b border-wa-border py-2 text-right">Active now</th>
                <th className="border-b border-wa-border py-2 text-center">On</th>
                <th className="border-b border-wa-border py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.id} className="hover:bg-wa-panel/40">
                  <td className="border-b border-wa-border py-3">
                    <button
                      onClick={() => setEditId(f.id)}
                      className="text-left font-medium text-wa-text hover:underline"
                    >
                      {f.name}
                    </button>
                    {f.description && (
                      <div className="text-[11px] text-wa-textMuted">{f.description}</div>
                    )}
                  </td>
                  <td className="border-b border-wa-border py-3">
                    <TriggerBadge type={f.trigger_type} config={f.trigger_config} />
                  </td>
                  <td className="border-b border-wa-border py-3 text-right">{f.run_count}</td>
                  <td className="border-b border-wa-border py-3 text-right">{f.active_runs}</td>
                  <td className="border-b border-wa-border py-3 text-center">
                    <button
                      onClick={() => toggle(f)}
                      className={`inline-flex h-5 w-9 items-center rounded-full transition ${
                        f.active ? "bg-wa-greenDark" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          f.active ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="border-b border-wa-border py-3 text-right">
                    <button
                      onClick={() => setEditId(f.id)}
                      className="mr-2 text-xs text-wa-greenDark hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(f)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 text-sm font-medium">New flow</div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Flow name"
              onKeyDown={(e) => {
                if (e.key === "Enter") createFlow();
                if (e.key === "Escape") setCreating(false);
              }}
              className="mb-4 w-full rounded border border-wa-border px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="rounded px-3 py-1.5 text-xs hover:bg-wa-panel"
              >
                Cancel
              </button>
              <button
                onClick={createFlow}
                disabled={!newName.trim()}
                className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TriggerBadge({ type, config }: { type: string; config: string | null }) {
  let cfg: any = {};
  try {
    cfg = config ? JSON.parse(config) : {};
  } catch {
    cfg = {};
  }
  const label =
    type === "keyword"
      ? `Keyword: "${cfg.keyword || "?"}"`
      : type === "new_contact"
        ? "New contact"
        : type === "from_ad"
          ? cfg.source_id
            ? `Ad: ${cfg.source_id}`
            : "From any ad"
          : "Manual";
  const tone =
    type === "keyword"
      ? "bg-blue-100 text-blue-800"
      : type === "new_contact"
        ? "bg-green-100 text-green-800"
        : type === "from_ad"
          ? "bg-amber-100 text-amber-800"
          : "bg-gray-100 text-gray-800";
  return <span className={`rounded px-2 py-0.5 text-[10px] ${tone}`}>{label}</span>;
}
