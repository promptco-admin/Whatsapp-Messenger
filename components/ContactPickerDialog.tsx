"use client";

import { useEffect, useMemo, useState } from "react";

type ContactLite = {
  id: number;
  wa_id: string;
  name: string | null;
  wa_profile_name: string | null;
  tags: string[];
  last_inbound_at: string | null;
};

function within24h(iso: string | null): boolean {
  if (!iso) return false;
  const s = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

/**
 * Reusable multi-select contact picker.
 * Used by Forward-message and Broadcast manual-list flows.
 */
export function ContactPickerDialog({
  open,
  onClose,
  onConfirm,
  title = "Pick contacts",
  confirmLabel = "Continue",
  excludeIds = [],
  /** When true, contacts outside the 24h window are dimmed + flagged
   *  (forward flow uses free-form text which only works inside the window). */
  flagOutsideWindow = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (contactIds: number[]) => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
  excludeIds?: number[];
  flagOutsideWindow?: boolean;
}) {
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    setSearch("");
    setTagFilter(null);
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((j) => {
        setContacts(j.contacts || []);
        setTags(j.tags || []);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const exclude = new Set(excludeIds);
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (exclude.has(c.id)) return false;
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.wa_profile_name || "").toLowerCase().includes(q) ||
        c.wa_id.includes(q)
      );
    });
  }, [contacts, search, tagFilter, excludeIds]);

  if (!open) return null;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = filtered.every((c) => next.has(c.id));
      for (const c of filtered) {
        if (allOn) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await onConfirm(Array.from(selected));
    } finally {
      setBusy(false);
    }
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-lg flex-col bg-white shadow-xl sm:max-h-[88vh] sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-wa-border px-4 py-3">
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-[11px] text-wa-textMuted">
              {selected.size} selected · {filtered.length} shown
            </div>
          </div>
          <button onClick={onClose} className="text-xs text-wa-textMuted hover:text-wa-text">
            Close
          </button>
        </div>

        <div className="border-b border-wa-border px-4 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="mb-2 w-full rounded border border-wa-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setTagFilter(null)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  !tagFilter
                    ? "border-wa-greenDark bg-wa-bubbleOut"
                    : "border-wa-border bg-white"
                }`}
              >
                All
              </button>
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={`rounded border px-2 py-0.5 text-[11px] ${
                    tagFilter === t
                      ? "border-wa-greenDark bg-wa-bubbleOut"
                      : "border-wa-border bg-white"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={toggleAllVisible}
            disabled={filtered.length === 0}
            className="mt-2 text-[11px] text-wa-greenDark hover:underline disabled:text-wa-textMuted"
          >
            {allVisibleSelected ? "Deselect all visible" : "Select all visible"}
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-xs text-wa-textMuted">Loading contacts…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-wa-textMuted">
              No contacts match this filter.
            </div>
          )}
          {filtered.map((c) => {
            const display = c.name || c.wa_profile_name || `+${c.wa_id}`;
            const isOn = selected.has(c.id);
            const inWindow = within24h(c.last_inbound_at);
            const dim = flagOutsideWindow && !inWindow;
            return (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-3 border-b border-wa-border px-4 py-2 hover:bg-wa-panel ${
                  isOn ? "bg-wa-bubbleOut/50" : ""
                } ${dim ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 accent-wa-greenDark"
                />
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-wa-green to-wa-greenDark text-xs font-semibold text-white">
                  {display.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-wa-text">{display}</div>
                  <div className="truncate text-[11px] text-wa-textMuted">
                    +{c.wa_id}
                    {c.tags.length > 0 && (
                      <span className="ml-2">
                        {c.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="ml-1 rounded bg-wa-panelDark px-1 text-[10px]"
                          >
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                {flagOutsideWindow && !inWindow && (
                  <span
                    className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800"
                    title="24h window is closed for this contact — free-form text won't deliver"
                  >
                    Out of 24h
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-wa-border px-4 py-3">
          <div className="text-xs text-wa-textMuted">
            {selected.size} selected
            {flagOutsideWindow && selected.size > 0 && (
              <span className="ml-2 text-amber-700">
                · contacts outside 24h window will be skipped
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy || selected.size === 0}
              className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
            >
              {busy ? "Sending…" : `${confirmLabel} (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
