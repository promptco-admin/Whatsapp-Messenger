"use client";

import { useCallback, useEffect, useState } from "react";

type Stage = {
  id: number;
  name: string;
  order_index: number;
  color: string;
  is_won: number;
  is_lost: number;
};

const PRESET_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#94a3b8",
  "#ef4444",
];

export function DealStagesManager() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [newKind, setNewKind] = useState<"open" | "won" | "lost">("open");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/crm/deal-stages").then((r) => r.json());
      setStages(j.stages || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addStage() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/crm/deal-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          is_won: newKind === "won",
          is_lost: newKind === "lost",
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Failed to add stage");
        return;
      }
      setNewName("");
      setNewColor("#3b82f6");
      setNewKind("open");
      setAdding(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateStage(id: number, patch: Partial<Stage>) {
    setBusy(true);
    try {
      await fetch(`/api/crm/deal-stages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteStage(id: number, name: string) {
    if (!confirm(`Delete stage "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/deal-stages/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Delete failed");
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function move(id: number, direction: "up" | "down") {
    const idx = stages.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= stages.length) return;
    const a = stages[idx];
    const b = stages[swapWith];
    setBusy(true);
    try {
      await Promise.all([
        fetch(`/api/crm/deal-stages/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_index: b.order_index }),
        }),
        fetch(`/api/crm/deal-stages/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_index: a.order_index }),
        }),
      ]);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Pipeline stages</h2>
          <p className="text-xs text-slate-500">
            The columns of your deals Kanban. Mark terminal stages as Won or Lost.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add stage
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {adding && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Stage name (e.g. Site Visit)"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2"
                  />
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as any)}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="open">Active stage</option>
                    <option value="won">Marks deal as Won</option>
                    <option value="lost">Marks deal as Lost</option>
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Color:</span>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className="h-6 w-6 rounded"
                      style={{
                        backgroundColor: c,
                        outline: newColor === c ? "2px solid #1e293b" : undefined,
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setAdding(false)}
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addStage}
                    disabled={busy}
                    className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
            {stages.map((s, i) => (
              <div
                key={s.id}
                className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(s.id, "up")}
                    disabled={busy || i === 0}
                    className="rounded text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(s.id, "down")}
                    disabled={busy || i === stages.length - 1}
                    className="rounded text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => updateStage(s.id, { color: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded border border-slate-300"
                  disabled={busy}
                />
                <input
                  defaultValue={s.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== s.name) {
                      updateStage(s.id, { name: e.target.value.trim() });
                    }
                  }}
                  className="flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                />
                <div className="flex items-center gap-1">
                  {s.is_won ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] uppercase text-green-700">
                      Won
                    </span>
                  ) : s.is_lost ? (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                      Lost
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                      Active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteStage(s.id, s.name)}
                  disabled={busy}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
