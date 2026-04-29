"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FollowupDialog, FollowupDialogContact } from "./FollowupDialog";
import { formatPhonePretty } from "@/lib/display";

type Stage = {
  id: number;
  name: string;
  order_index: number;
  color: string;
  is_won: number;
  is_lost: number;
  auto_followup_days: number | null;
  contact_count: number;
};

type ContactRow = {
  id: number;
  wa_id: string;
  name: string | null;
  wa_profile_name: string | null;
  tags: string[];
  pipeline_stage_id: number | null;
  last_inbound_at: string | null;
  next_followup_at: string | null;
};

function nameForCard(c: ContactRow): string {
  if (c.name && c.name.trim()) return c.name.trim();
  if (c.wa_profile_name && c.wa_profile_name.trim()) return c.wa_profile_name.trim();
  return formatPhonePretty(c.wa_id);
}

const NEW_STAGE_DEFAULT = { name: "", color: "#94a3b8", auto_followup_days: "" as string };

export function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [followupFor, setFollowupFor] = useState<FollowupDialogContact | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverStage, setHoverStage] = useState<number | null>(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStage, setNewStage] = useState(NEW_STAGE_DEFAULT);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [searchAddFor, setSearchAddFor] = useState<Stage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesRes, contactsRes] = await Promise.all([
        fetch("/api/pipeline-stages"),
        fetch("/api/contacts?limit=1000&include=pipeline"),
      ]);
      const sj = await stagesRes.json();
      setStages(sj.stages || []);
      const cj = await contactsRes.json();
      const list: ContactRow[] = (cj.contacts || []).map((c: any) => ({
        id: c.id,
        wa_id: c.wa_id,
        name: c.name,
        wa_profile_name: c.wa_profile_name ?? null,
        tags: Array.isArray(c.tags)
          ? c.tags
          : typeof c.tags === "string" && c.tags
            ? safeJsonArray(c.tags)
            : [],
        pipeline_stage_id: c.pipeline_stage_id ?? null,
        last_inbound_at: c.last_inbound_at ?? null,
        next_followup_at: c.next_followup_at ?? null,
      }));
      setContacts(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byStage = useMemo(() => {
    const m = new Map<number | null, ContactRow[]>();
    for (const c of contacts) {
      const key = c.pipeline_stage_id ?? null;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [contacts]);

  async function moveContact(contactId: number, stageId: number | null) {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage_id: stageId } : c)),
    );
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage_id: stageId }),
    });
    if (!res.ok) {
      alert("Move failed");
    }
    refresh();
  }

  async function createStage() {
    if (!newStage.name.trim()) return;
    const res = await fetch("/api/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newStage.name.trim(),
        color: newStage.color,
        auto_followup_days: newStage.auto_followup_days
          ? Number(newStage.auto_followup_days)
          : null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Create failed");
      return;
    }
    setNewStage(NEW_STAGE_DEFAULT);
    setShowAddStage(false);
    refresh();
  }

  async function saveStage(s: Stage) {
    const res = await fetch(`/api/pipeline-stages/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.name,
        color: s.color,
        is_won: s.is_won,
        is_lost: s.is_lost,
        auto_followup_days: s.auto_followup_days,
      }),
    });
    if (!res.ok) {
      alert("Save failed");
      return;
    }
    setEditingStage(null);
    refresh();
  }

  async function deleteStage(s: Stage) {
    if (
      !confirm(
        `Delete stage "${s.name}"? Contacts in this stage will become un-staged.`,
      )
    )
      return;
    await fetch(`/api/pipeline-stages/${s.id}`, { method: "DELETE" });
    setEditingStage(null);
    refresh();
  }

  return (
    <div className="flex h-full flex-col bg-wa-bg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wa-border bg-white px-3 py-3 md:px-6">
        <div>
          <div className="text-base font-semibold">Pipeline</div>
          <div className="text-xs text-wa-textMuted">
            Drag contacts between stages. Stages with auto-follow-up days will auto-create a
            follow-up when a contact lands there.
          </div>
        </div>
        <button
          onClick={() => setShowAddStage(true)}
          className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + Add stage
        </button>
      </div>

      {/* TOP: stages kanban (horizontal scroll) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max gap-3 p-4">
          {loading && stages.length === 0 && (
            <div className="p-4 text-sm text-wa-textMuted">Loading…</div>
          )}
          {stages.map((s) => {
            const list = byStage.get(s.id) || [];
            const isHover = hoverStage === s.id;
            return (
              <div
                key={s.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverStage(s.id);
                }}
                onDragLeave={() => setHoverStage((cur) => (cur === s.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setHoverStage(null);
                  if (draggingId) moveContact(draggingId, s.id);
                  setDraggingId(null);
                }}
                className={`flex w-72 flex-none flex-col rounded-lg bg-white shadow-sm ${
                  isHover ? "ring-2 ring-wa-green" : ""
                }`}
              >
                <div
                  className="flex items-center justify-between rounded-t-lg px-3 py-2 text-white"
                  style={{ backgroundColor: s.color }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.name}</div>
                    <div className="text-[10px] opacity-90">
                      {list.length} contact{list.length === 1 ? "" : "s"}
                      {s.auto_followup_days
                        ? ` · auto-follow-up ${s.auto_followup_days}d`
                        : ""}
                      {s.is_won ? " · WON" : ""}
                      {s.is_lost ? " · LOST" : ""}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      onClick={() => {
                        setSearchAddFor(s);
                        setSearchQuery("");
                      }}
                      className="rounded bg-white/20 px-2 py-0.5 text-[11px] font-medium hover:bg-white/30"
                      title={`Search a customer to add to "${s.name}"`}
                    >
                      + Add
                    </button>
                    <button
                      onClick={() => setEditingStage(s)}
                      className="rounded bg-white/20 px-2 py-0.5 text-[11px] hover:bg-white/30"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <div className="scroll-thin flex-1 overflow-y-auto p-2">
                  {list.length === 0 && (
                    <div className="rounded border border-dashed border-wa-border p-3 text-center text-[11px] text-wa-textMuted">
                      Drop contacts here
                    </div>
                  )}
                  <div className="space-y-2">
                    {list.map((c) => (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDraggingId(c.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setHoverStage(null);
                        }}
                        className="cursor-grab rounded border border-wa-border bg-white p-2 text-xs shadow-sm hover:border-wa-green active:cursor-grabbing"
                      >
                        <div className="font-medium text-wa-text">{nameForCard(c)}</div>
                        <div className="text-[10px] text-wa-textMuted">{formatPhonePretty(c.wa_id)}</div>
                        {c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-wa-panel px-1.5 py-0.5 text-[9px] text-wa-textMuted"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() =>
                            setFollowupFor({ id: c.id, name: nameForCard(c), wa_id: c.wa_id })
                          }
                          className="mt-1 text-[10px] text-wa-greenDark hover:underline"
                        >
                          + Follow-up
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM: un-staged horizontal strip — easier to drag UP into stages */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setHoverStage(-1);
        }}
        onDragLeave={() => setHoverStage((cur) => (cur === -1 ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          setHoverStage(null);
          if (draggingId) moveContact(draggingId, null);
          setDraggingId(null);
        }}
        className={`flex-none border-t border-wa-border bg-white ${
          hoverStage === -1 ? "ring-2 ring-inset ring-wa-green" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-wa-border bg-gray-50 px-4 py-1.5">
          <div className="text-xs font-semibold text-gray-700">
            Un-staged · {(byStage.get(null) || []).length}
            <span className="ml-2 font-normal text-wa-textMuted">
              drag a card up into any stage above, or drop a staged card here to un-stage it
            </span>
          </div>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <div className="flex min-w-max gap-2 px-3 py-2">
            {(byStage.get(null) || []).length === 0 && (
              <div className="px-2 py-3 text-[11px] text-wa-textMuted">
                No un-staged contacts. New customers who message you will land here.
              </div>
            )}
            {(byStage.get(null) || []).slice(0, 100).map((c) => (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDraggingId(c.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setHoverStage(null);
                }}
                className="flex w-44 flex-none cursor-grab flex-col rounded border border-wa-border bg-white p-2 text-xs shadow-sm hover:border-wa-green active:cursor-grabbing"
              >
                <div className="truncate font-medium text-wa-text">{nameForCard(c)}</div>
                <div className="text-[10px] text-wa-textMuted">{formatPhonePretty(c.wa_id)}</div>
              </div>
            ))}
            {(byStage.get(null) || []).length > 100 && (
              <div className="flex w-44 flex-none items-center justify-center text-[10px] text-wa-textMuted">
                + {(byStage.get(null) || []).length - 100} more — use Contacts page
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-3 text-lg font-medium">New stage</div>
            <input
              value={newStage.name}
              onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
              placeholder="Stage name (e.g. Site Visit)"
              className="mb-2 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
            />
            <div className="mb-2 flex items-center gap-2">
              <label className="text-xs text-wa-textMuted">Colour</label>
              <input
                type="color"
                value={newStage.color}
                onChange={(e) => setNewStage({ ...newStage, color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-wa-border"
              />
            </div>
            <input
              type="number"
              min={0}
              value={newStage.auto_followup_days}
              onChange={(e) =>
                setNewStage({ ...newStage, auto_followup_days: e.target.value })
              }
              placeholder="Auto-create follow-up after N days (optional)"
              className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddStage(false);
                  setNewStage(NEW_STAGE_DEFAULT);
                }}
                className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
              >
                Cancel
              </button>
              <button
                onClick={createStage}
                className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-3 text-lg font-medium">Edit stage</div>
            <input
              value={editingStage.name}
              onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
              className="mb-2 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
            />
            <div className="mb-2 flex items-center gap-2">
              <label className="text-xs text-wa-textMuted">Colour</label>
              <input
                type="color"
                value={editingStage.color}
                onChange={(e) =>
                  setEditingStage({ ...editingStage, color: e.target.value })
                }
                className="h-8 w-12 cursor-pointer rounded border border-wa-border"
              />
            </div>
            <input
              type="number"
              min={0}
              value={editingStage.auto_followup_days ?? ""}
              onChange={(e) =>
                setEditingStage({
                  ...editingStage,
                  auto_followup_days: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="Auto-create follow-up after N days (optional)"
              className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
            />
            <div className="mb-3 flex gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!editingStage.is_won}
                  onChange={(e) =>
                    setEditingStage({
                      ...editingStage,
                      is_won: e.target.checked ? 1 : 0,
                      is_lost: e.target.checked ? 0 : editingStage.is_lost,
                    })
                  }
                />
                Mark as Won
              </label>
              <label className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!editingStage.is_lost}
                  onChange={(e) =>
                    setEditingStage({
                      ...editingStage,
                      is_lost: e.target.checked ? 1 : 0,
                      is_won: e.target.checked ? 0 : editingStage.is_won,
                    })
                  }
                />
                Mark as Lost
              </label>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => deleteStage(editingStage)}
                className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Delete stage
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingStage(null)}
                  className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveStage(editingStage)}
                  className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {searchAddFor && (
        <SearchAddContactDialog
          stage={searchAddFor}
          contacts={contacts}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setSearchAddFor(null);
            setSearchQuery("");
          }}
          onPick={async (contactId) => {
            await moveContact(contactId, searchAddFor.id);
            setSearchAddFor(null);
            setSearchQuery("");
          }}
        />
      )}

      <FollowupDialog
        open={!!followupFor}
        onClose={() => setFollowupFor(null)}
        onSaved={() => refresh()}
        contact={followupFor}
      />
    </div>
  );
}

function SearchAddContactDialog({
  stage,
  contacts,
  query,
  onQueryChange,
  onClose,
  onPick,
}: {
  stage: Stage;
  contacts: ContactRow[];
  query: string;
  onQueryChange: (s: string) => void;
  onClose: () => void;
  onPick: (contactId: number) => void | Promise<void>;
}) {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/[^0-9]/g, "");
  // Match name, WhatsApp profile name, OR phone digits. Phone match only
  // applies when the user actually typed digits — otherwise `wa_id.includes("")`
  // returns true for every contact and the filter becomes a no-op.
  const matches = (
    q
      ? contacts.filter((c) => {
          const name = (c.name || "").toLowerCase();
          const wa = (c.wa_profile_name || "").toLowerCase();
          if (name.includes(q)) return true;
          if (wa.includes(q)) return true;
          if (digits.length > 0 && c.wa_id.includes(digits)) return true;
          return false;
        })
      : contacts
  ).slice(0, 30);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">
            Add a customer to{" "}
            <span style={{ color: stage.color }}>{stage.name}</span>
          </div>
          <button onClick={onClose} className="text-xs text-wa-textMuted hover:text-wa-text">
            Close
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or phone (+91…)"
          className="mb-2 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
        />
        <div className="scroll-thin max-h-80 divide-y divide-wa-border overflow-y-auto rounded border border-wa-border">
          {matches.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-wa-textMuted">
              {q ? "No contacts match." : "Start typing to search your contacts."}
            </div>
          )}
          {matches.map((c) => {
            const inStage = c.pipeline_stage_id === stage.id;
            return (
              <button
                key={c.id}
                disabled={inStage}
                onClick={() => onPick(c.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-wa-panel disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-wa-text">
                    {nameForCard(c)}
                  </div>
                  <div className="text-[10px] text-wa-textMuted">
                    {formatPhonePretty(c.wa_id)}
                    {c.tags.length > 0 && (
                      <span className="ml-2">{c.tags.slice(0, 3).join(" · ")}</span>
                    )}
                  </div>
                </div>
                <span className="ml-3 flex-none text-[10px] text-wa-textMuted">
                  {inStage ? "Already here" : "Add →"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[10px] text-wa-textMuted">
          Don&apos;t see them? Add the contact via the <b>Contacts</b> tab or by starting a chat,
          then come back here.
        </div>
      </div>
    </div>
  );
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
