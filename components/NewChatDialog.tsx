"use client";

import { useState } from "react";

export function NewChatDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [waId, setWaId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setError(null);
    const digits = waId.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      setError("Enter a valid phone number including country code (e.g. 14155550123)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wa_id: digits, name: name.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed to create contact");
        return;
      }
      onCreated(j.id);
      onClose();
      setWaId("");
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 text-lg font-medium">Start a new chat</div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-wa-textMuted">
              Phone number (with country code, digits only)
            </label>
            <input
              value={waId}
              onChange={(e) => setWaId(e.target.value)}
              placeholder="e.g. 14155550123"
              className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-wa-textMuted">Name (optional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
            />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {busy ? "Creating…" : "Start chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
