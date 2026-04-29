"use client";

import { useEffect, useState } from "react";
import { formatPhonePretty } from "@/lib/display";

type Contact = {
  id: number;
  wa_id: string;
  name: string | null;
  wa_profile_name: string | null;
};

type User = { id: number; name: string; role: string };
type Stage = { id: number; name: string; color: string; is_won: number; is_lost: number };

export function DealEditDialog({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: {
    id?: number;
    title?: string;
    contact_id?: number;
    owner_user_id?: number | null;
    stage_id?: number | null;
    value?: string;
    expected_close_date?: string | null;
    notes?: string | null;
  };
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [contactId, setContactId] = useState<number | null>(initial?.contact_id || null);
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContactPicker, setShowContactPicker] = useState(false);

  const [ownerId, setOwnerId] = useState<number | null>(initial?.owner_user_id ?? null);
  const [users, setUsers] = useState<User[]>([]);
  const [stageId, setStageId] = useState<number | null>(initial?.stage_id ?? null);
  const [stages, setStages] = useState<Stage[]>([]);

  const [value, setValue] = useState(initial?.value || "");
  const [closeDate, setCloseDate] = useState(initial?.expected_close_date || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [busy, setBusy] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((j) => {
      setContacts(j.contacts || []);
      if (initial?.contact_id) {
        const c = (j.contacts || []).find((x: Contact) => x.id === initial.contact_id);
        if (c) setSelectedContact(c);
      }
    });
    fetch("/api/users").then((r) => r.json()).then((j) => setUsers(j.users || []));
    fetch("/api/crm/deal-stages").then((r) => r.json()).then((j) => setStages(j.stages || []));
  }, [initial?.contact_id]);

  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.wa_profile_name || "").toLowerCase().includes(q) ||
      c.wa_id.includes(q)
    );
  });

  async function save() {
    if (!title.trim()) {
      alert("Please enter a deal title");
      return;
    }
    if (mode === "create" && !contactId) {
      alert("Please pick a contact");
      return;
    }
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        contact_id: contactId,
        owner_user_id: ownerId,
        stage_id: stageId,
        value,
        expected_close_date: closeDate || null,
        notes: notes || null,
      };
      const url = mode === "create" ? "/api/crm/deals" : `/api/crm/deals/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Save failed");
        return;
      }
      onSaved(j.id || initial?.id || 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-lg flex-col bg-white p-5 shadow-xl sm:my-auto sm:max-h-[92vh] sm:overflow-y-auto sm:rounded-lg sm:p-6">
        <div className="mb-4 text-lg font-semibold text-slate-800">
          {mode === "create" ? "New deal" : "Edit deal"}
        </div>

        <Field label="Deal title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 5kW solar panel + installation"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </Field>

        {mode === "create" && (
          <Field label="Contact">
            <div className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {selectedContact ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {selectedContact.name ||
                        selectedContact.wa_profile_name ||
                        formatPhonePretty(selectedContact.wa_id)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatPhonePretty(selectedContact.wa_id)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContact(null);
                      setContactId(null);
                      setShowContactPicker(true);
                    }}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowContactPicker(true)}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  + Pick a contact
                </button>
              )}
            </div>
            {showContactPicker && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                <input
                  autoFocus
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search by name or phone…"
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <div className="max-h-48 overflow-y-auto">
                  {filteredContacts.slice(0, 50).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setContactId(c.id);
                        setSelectedContact(c);
                        setShowContactPicker(false);
                        setContactSearch("");
                      }}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-2 py-1.5 text-left text-sm hover:bg-white"
                    >
                      <span>
                        {c.name || c.wa_profile_name || formatPhonePretty(c.wa_id)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatPhonePretty(c.wa_id)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Value (₹)">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Expected close">
            <input
              type="date"
              value={closeDate || ""}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <select
              value={stageId ?? ""}
              onChange={(e) => setStageId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— pick stage —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_won ? " (won)" : s.is_lost ? " (lost)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <select
              value={ownerId ?? ""}
              onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything useful — requirements, context, gotchas…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : mode === "create" ? "Create deal" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
