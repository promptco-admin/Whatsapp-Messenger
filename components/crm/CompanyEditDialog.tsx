"use client";

import { useEffect, useState } from "react";

type User = { id: number; name: string; role: string };

export function CompanyEditDialog({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: {
    id?: number;
    name?: string;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
    industry?: string | null;
    notes?: string | null;
    owner_user_id?: number | null;
  };
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [website, setWebsite] = useState(initial?.website || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [industry, setIndustry] = useState(initial?.industry || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [ownerId, setOwnerId] = useState<number | null>(initial?.owner_user_id ?? null);
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((j) => setUsers(j.users || []));
  }, []);

  async function save() {
    if (!name.trim()) {
      alert("Please enter a company name");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        website: website.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        industry: industry.trim() || null,
        notes: notes.trim() || null,
        owner_user_id: ownerId,
      };
      const url = mode === "create" ? "/api/crm/companies" : `/api/crm/companies/${initial?.id}`;
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
          {mode === "create" ? "New company" : "Edit company"}
        </div>

        <Field label="Company name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ABC Industries Pvt Ltd"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Industry">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Manufacturing"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Website">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Office phone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 …"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
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

        <Field label="Address">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything you want to remember about this company"
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
            {busy ? "Saving…" : mode === "create" ? "Create company" : "Save changes"}
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
