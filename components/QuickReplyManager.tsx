"use client";

import { useEffect, useState } from "react";

export type QuickReply = {
  id: number;
  shortcut: string | null;
  title: string;
  body: string;
};

export function QuickReplyManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);

  async function load() {
    const res = await fetch("/api/quick-replies", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setItems(j.quick_replies || []);
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  if (!open) return null;

  async function save() {
    if (!editing?.title || !editing?.body) return;
    const method = editing.id ? "PATCH" : "POST";
    const url = editing.id ? `/api/quick-replies/${editing.id}` : "/api/quick-replies";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shortcut: editing.shortcut || null,
        title: editing.title,
        body: editing.body,
      }),
    });
    if (res.ok) {
      setEditing(null);
      await load();
      onChanged();
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this quick reply?")) return;
    await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
    await load();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex h-full max-h-screen w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:h-[600px] sm:max-h-[92vh] sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-wa-border p-4">
          <div className="text-lg font-medium">Quick replies</div>
          <button onClick={onClose} className="text-xs text-wa-textMuted hover:text-wa-text">
            Close
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-72 flex-none flex-col border-r border-wa-border bg-wa-panel">
            <button
              onClick={() => setEditing({ shortcut: "", title: "", body: "" })}
              className="m-3 rounded bg-wa-greenDark px-3 py-2 text-xs font-medium text-white hover:bg-wa-green"
            >
              + New quick reply
            </button>
            <div className="scroll-thin flex-1 overflow-y-auto">
              {items.length === 0 && (
                <div className="p-4 text-xs text-wa-textMuted">
                  No quick replies yet. Create one for common responses.
                </div>
              )}
              {items.map((qr) => (
                <button
                  key={qr.id}
                  onClick={() => setEditing(qr)}
                  className={`block w-full border-b border-wa-border px-3 py-2 text-left text-xs hover:bg-white ${
                    editing?.id === qr.id ? "bg-white" : ""
                  }`}
                >
                  <div className="truncate text-sm font-medium">{qr.title}</div>
                  <div className="text-[10px] text-wa-textMuted">
                    {qr.shortcut ? `/${qr.shortcut}` : "no shortcut"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            {!editing && (
              <div className="m-auto text-center text-sm text-wa-textMuted">
                Pick a quick reply to edit, or create a new one.
              </div>
            )}
            {editing && (
              <>
                <label className="mb-1 text-xs text-wa-textMuted">Title (what you see)</label>
                <input
                  value={editing.title || ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. Business hours"
                  className="mb-3 rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                />

                <label className="mb-1 text-xs text-wa-textMuted">
                  Shortcut (type <code>/shortcut</code> in chat to insert)
                </label>
                <input
                  value={editing.shortcut || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, shortcut: e.target.value.replace(/\s/g, "") })
                  }
                  placeholder="e.g. hours"
                  className="mb-3 rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                />

                <label className="mb-1 text-xs text-wa-textMuted">Message text</label>
                <textarea
                  value={editing.body || ""}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  rows={8}
                  placeholder="The message that gets inserted into the composer."
                  className="mb-3 flex-1 resize-none rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                />

                <div className="flex items-center justify-between">
                  <div>
                    {editing.id && (
                      <button
                        onClick={() => remove(editing.id!)}
                        className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={save}
                      disabled={!editing.title || !editing.body}
                      className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
