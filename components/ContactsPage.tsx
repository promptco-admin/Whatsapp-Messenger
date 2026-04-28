"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import { ImportContactsDialog } from "./ImportContactsDialog";
import { ContactEditDialog } from "./ContactEditDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { displayPhone } from "@/lib/display";

type SortKey =
  | "name_asc"
  | "name_desc"
  | "recent_activity"
  | "recently_added"
  | "oldest"
  | "recent_inbound";

type Stage = { id: number; name: string; color: string };

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "name_asc", label: "Name A → Z" },
  { value: "name_desc", label: "Name Z → A" },
  { value: "recent_activity", label: "Recent activity" },
  { value: "recent_inbound", label: "Recently messaged us" },
  { value: "recently_added", label: "Recently added" },
  { value: "oldest", label: "Oldest first" },
];

function ts(s: string | null | undefined): number {
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function nameKey(c: Contact): string {
  return (c.name || c.wa_profile_name || c.wa_id || "").toLowerCase();
}

export function ContactsPage() {
  const { user } = useCurrentUser();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  // sort + filters
  const [sort, setSort] = useState<SortKey>("name_asc");
  const [stageFilter, setStageFilter] = useState<string>("any"); // "any" | "none" | "<id>"
  const [showOptedOut, setShowOptedOut] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (selectedTag) params.set("tag", selectedTag);
    if (search) params.set("search", search);
    const res = await fetch(`/api/contacts?${params}`, { cache: "no-store" });
    if (!res.ok) {
      setLoaded(true);
      return;
    }
    const j = await res.json();
    setContacts(j.contacts || []);
    setAllTags(j.tags || []);
    setLoaded(true);
  }

  async function loadStages() {
    const res = await fetch("/api/pipeline-stages", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setStages(j.stages || []);
  }

  useEffect(() => {
    load();
  }, [selectedTag, search]);

  useEffect(() => {
    loadStages();
  }, []);

  const stageById = useMemo(() => {
    const m = new Map<number, Stage>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  const visibleContacts = useMemo(() => {
    let list = contacts.slice();
    // Filter: opted-out
    if (!showOptedOut) list = list.filter((c) => !c.unsubscribed_at);
    // Filter: stage
    if (stageFilter === "none") list = list.filter((c) => !c.pipeline_stage_id);
    else if (stageFilter !== "any")
      list = list.filter((c) => String(c.pipeline_stage_id) === stageFilter);

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case "name_asc":
          return nameKey(a).localeCompare(nameKey(b));
        case "name_desc":
          return nameKey(b).localeCompare(nameKey(a));
        case "recent_activity":
          return ts(b.last_message_at) - ts(a.last_message_at);
        case "recent_inbound":
          return ts(b.last_inbound_at) - ts(a.last_inbound_at);
        case "recently_added":
          return ts(b.created_at) - ts(a.created_at);
        case "oldest":
          return ts(a.created_at) - ts(b.created_at);
      }
    });
    return list;
  }, [contacts, sort, stageFilter, showOptedOut]);

  async function addContact() {
    const digits = newPhone.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      alert("Enter a valid phone number with country code");
      return;
    }
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa_id: digits, name: newName.trim() || null }),
    });
    if (res.ok) {
      setAddOpen(false);
      setNewPhone("");
      setNewName("");
      load();
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-3 py-3 md:px-6 md:py-4">
        <div>
          <div className="text-lg font-medium text-wa-text">Contacts</div>
          <div className="text-xs text-wa-textMuted">
            {visibleContacts.length} of {contacts.length} contact
            {contacts.length === 1 ? "" : "s"}
            {selectedTag && <> · tag: #{selectedTag}</>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="rounded bg-white px-3 py-1.5 text-xs font-medium text-wa-text hover:bg-wa-panelDark"
          >
            Import CSV
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
          >
            + Add contact
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 flex-none overflow-y-auto border-r border-wa-border bg-wa-panel p-3 md:block">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
            Segments
          </div>
          <button
            onClick={() => setSelectedTag(null)}
            className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white ${
              !selectedTag ? "bg-white font-medium" : ""
            }`}
          >
            All contacts
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTag(t)}
              className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white ${
                selectedTag === t ? "bg-white font-medium" : ""
              }`}
            >
              #{t}
            </button>
          ))}
          {allTags.length === 0 && (
            <div className="mt-2 text-[11px] text-wa-textMuted">
              No tags yet. Tag contacts to create segments.
            </div>
          )}
        </aside>

        <div className="flex-1 overflow-auto">
          <div className="border-b border-wa-border bg-white px-6 py-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts by name or phone…"
              className="w-full rounded-lg bg-wa-panel px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-wa-border bg-white px-6 py-2 text-xs">
            <label className="flex items-center gap-1 text-wa-textMuted">
              Sort:
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded border border-wa-border px-2 py-1 outline-none"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-wa-textMuted">
              Stage:
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="rounded border border-wa-border px-2 py-1 outline-none"
              >
                <option value="any">Any</option>
                <option value="none">Un-staged</option>
                {stages.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-1 text-wa-textMuted">
              <input
                type="checkbox"
                checked={showOptedOut}
                onChange={(e) => setShowOptedOut(e.target.checked)}
              />
              Show opted-out
            </label>
            {(stageFilter !== "any" || showOptedOut || sort !== "name_asc") && (
              <button
                onClick={() => {
                  setSort("name_asc");
                  setStageFilter("any");
                  setShowOptedOut(false);
                }}
                className="ml-auto text-wa-greenDark hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-wa-textMuted">
                <th className="border-b border-wa-border px-6 py-2">Name</th>
                <th className="border-b border-wa-border px-6 py-2">Phone</th>
                <th className="border-b border-wa-border px-6 py-2">Stage</th>
                <th className="border-b border-wa-border px-6 py-2">Tags</th>
                <th className="border-b border-wa-border px-6 py-2">Custom fields</th>
                <th className="border-b border-wa-border px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {!loaded && visibleContacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-wa-textMuted">
                    Loading contacts…
                  </td>
                </tr>
              )}
              {loaded && visibleContacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-wa-textMuted">
                    No contacts match the current filters.
                  </td>
                </tr>
              )}
              {visibleContacts.map((c) => {
                const stage = c.pipeline_stage_id ? stageById.get(c.pipeline_stage_id) : null;
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-wa-panel"
                    onClick={() => setEditing(c)}
                  >
                    <td className="border-b border-wa-border px-6 py-2 font-medium">
                      {c.name ? (
                        c.name
                      ) : c.wa_profile_name ? (
                        <span title="From WhatsApp profile">
                          {c.wa_profile_name}
                          <span className="ml-1 rounded bg-wa-panelDark px-1 text-[9px] font-normal text-wa-textMuted">
                            WA
                          </span>
                        </span>
                      ) : (
                        <span className="text-wa-textMuted">—</span>
                      )}
                      {c.unsubscribed_at && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[9px] text-red-700">
                          opted-out
                        </span>
                      )}
                    </td>
                    <td className="border-b border-wa-border px-6 py-2">
                      +{displayPhone(c.wa_id, user)}
                    </td>
                    <td className="border-b border-wa-border px-6 py-2 text-xs">
                      {stage ? (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] text-white"
                          style={{ backgroundColor: stage.color }}
                        >
                          {stage.name}
                        </span>
                      ) : (
                        <span className="text-wa-textMuted">—</span>
                      )}
                    </td>
                    <td className="border-b border-wa-border px-6 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-wa-bubbleOut px-1.5 py-0.5 text-[10px] text-green-900"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="border-b border-wa-border px-6 py-2 text-xs">
                      {Object.entries(c.custom_fields || {})
                        .slice(0, 2)
                        .map(([k, v]) => (
                          <span key={k} className="mr-2 text-wa-textMuted">
                            <b>{k}:</b> {v}
                          </span>
                        ))}
                    </td>
                    <td className="border-b border-wa-border px-6 py-2 text-right text-xs text-wa-textMuted">
                      Edit →
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ImportContactsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={load}
      />
      <ContactEditDialog
        open={!!editing}
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 text-lg font-medium">Add contact</div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-wa-textMuted">
                Phone (country code + number, digits only)
              </label>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="14155550123"
                className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
              />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-wa-textMuted">Name (optional)</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAddOpen(false)}
                className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
              >
                Cancel
              </button>
              <button
                onClick={addContact}
                className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
