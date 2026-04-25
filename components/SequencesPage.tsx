"use client";

import { useEffect, useState } from "react";
import { SequenceEditor } from "./SequenceEditor";

type SequenceRow = {
  id: number;
  name: string;
  description: string | null;
  active: number;
  created_at: string;
  step_count: number;
  active_enrollments: number;
};

export function SequencesPage() {
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  async function load() {
    const res = await fetch("/api/sequences", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setSequences(j.sequences || []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function createSequence() {
    if (!newName.trim()) return;
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    });
    if (!res.ok) return;
    const j = await res.json();
    setCreating(false);
    setNewName("");
    setNewDesc("");
    await load();
    setSelectedId(Number(j.id));
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-wa-border bg-wa-panel px-6 py-4">
        <div>
          <div className="text-lg font-medium">Drip sequences</div>
          <div className="text-xs text-wa-textMuted">
            A series of templates sent to contacts on a schedule. Useful for onboarding,
            follow-ups, and reminders.
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + New sequence
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-none overflow-y-auto border-r border-wa-border bg-wa-panel">
          {sequences.length === 0 && (
            <div className="p-6 text-center text-xs text-wa-textMuted">
              No sequences yet. Click "+ New sequence" to create one.
            </div>
          )}
          {sequences.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`block w-full border-b border-wa-border px-4 py-3 text-left hover:bg-white ${
                selectedId === s.id ? "bg-white" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="truncate text-sm font-medium">{s.name}</div>
                {s.active ? (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800">
                    active
                  </span>
                ) : (
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                    paused
                  </span>
                )}
              </div>
              {s.description && (
                <div className="mt-1 truncate text-[11px] text-wa-textMuted">{s.description}</div>
              )}
              <div className="mt-1 text-[10px] text-wa-textMuted">
                {s.step_count} step{s.step_count === 1 ? "" : "s"} ·{" "}
                {s.active_enrollments} active enrollment{s.active_enrollments === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {selectedId != null ? (
            <SequenceEditor
              key={selectedId}
              sequenceId={selectedId}
              onDeleted={() => {
                setSelectedId(null);
                load();
              }}
              onChanged={load}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-wa-textMuted">
              Pick a sequence on the left, or create a new one.
            </div>
          )}
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 text-lg font-medium">New sequence</div>
            <label className="mb-1 block text-xs text-wa-textMuted">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Post-install onboarding (3 messages)"
              className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
            />
            <label className="mb-1 block text-xs text-wa-textMuted">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              placeholder="What is this sequence for?"
              className="mb-3 w-full resize-none rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
              >
                Cancel
              </button>
              <button
                onClick={createSequence}
                disabled={!newName.trim()}
                className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
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
