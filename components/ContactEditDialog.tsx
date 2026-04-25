"use client";

import { useEffect, useState } from "react";
import type { Contact } from "@/lib/types";

export function ContactEditDialog({
  open,
  contact,
  onClose,
  onSaved,
}: {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [fields, setFields] = useState<Array<{ k: string; v: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name || "");
    setTags((contact.tags || []).join(", "));
    setFields(Object.entries(contact.custom_fields || {}).map(([k, v]) => ({ k, v })));
  }, [contact]);

  if (!open || !contact) return null;

  async function save() {
    if (!contact) return;
    setBusy(true);
    try {
      const tagArr = tags.split(",").map((s) => s.trim()).filter(Boolean);
      const customObj: Record<string, string> = {};
      for (const f of fields) if (f.k.trim()) customObj[f.k.trim()] = f.v;
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, tags: tagArr, custom_fields: customObj }),
      });
      if (!res.ok) {
        alert("Save failed");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!contact) return;
    if (!confirm("Delete this contact and all their messages?")) return;
    setBusy(true);
    try {
      await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 text-lg font-medium">Edit contact</div>
        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Phone</label>
          <div className="rounded bg-wa-panel px-3 py-2 text-sm">+{contact.wa_id}</div>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={contact.wa_profile_name || ""}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
          {contact.wa_profile_name && (
            <div className="mt-1 text-[11px] text-wa-textMuted">
              WhatsApp profile name:{" "}
              <span className="font-medium text-wa-text">{contact.wa_profile_name}</span>
              {!name && (
                <button
                  type="button"
                  onClick={() => setName(contact.wa_profile_name || "")}
                  className="ml-2 text-wa-greenDark hover:underline"
                >
                  Use this
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Tags (comma-separated)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="vip, solar_customer, pune"
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
        </div>
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-wa-textMuted">Custom fields</label>
            <button
              onClick={() => setFields([...fields, { k: "", v: "" }])}
              className="text-xs text-wa-greenDark hover:underline"
            >
              + Add field
            </button>
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={f.k}
                  onChange={(e) => {
                    const next = [...fields];
                    next[i] = { ...next[i], k: e.target.value };
                    setFields(next);
                  }}
                  placeholder="key (e.g. plan)"
                  className="flex-1 rounded border border-wa-border px-3 py-1.5 text-xs outline-none"
                />
                <input
                  value={f.v}
                  onChange={(e) => {
                    const next = [...fields];
                    next[i] = { ...next[i], v: e.target.value };
                    setFields(next);
                  }}
                  placeholder="value"
                  className="flex-1 rounded border border-wa-border px-3 py-1.5 text-xs outline-none"
                />
                <button
                  onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  className="text-xs text-red-600 hover:underline"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Opt-out / opt-in row */}
        <div className="mb-3 rounded border border-wa-border bg-wa-panel/30 p-3">
          <div className="mb-1 text-xs font-medium text-wa-text">Marketing consent</div>
          {contact.unsubscribed_at ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-red-700">
                Opted-out{" "}
                {new Date(contact.unsubscribed_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                — broadcasts and auto-replies skip this contact.
              </div>
              <button
                onClick={async () => {
                  if (!contact) return;
                  setBusy(true);
                  try {
                    await fetch(`/api/contacts/${contact.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ unsubscribed: false }),
                    });
                    onSaved();
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="flex-none rounded bg-wa-greenDark px-3 py-1 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                Opt back in
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-wa-textMuted">
                Currently subscribed. Click to mark this contact as opted-out so they&apos;re
                excluded from broadcasts, sequences, and auto-replies.
              </div>
              <button
                onClick={async () => {
                  if (!contact) return;
                  if (
                    !confirm(
                      `Mark ${contact.name || "+" + contact.wa_id} as opted-out? They will be excluded from all future broadcasts and automation.`,
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await fetch(`/api/contacts/${contact.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ unsubscribed: true }),
                    });
                    onSaved();
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="flex-none rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Mark opted-out
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-between">
          <button
            onClick={remove}
            className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            Delete contact
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
