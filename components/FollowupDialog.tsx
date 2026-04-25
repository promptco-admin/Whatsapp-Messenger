"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template } from "@/lib/types";

type Mode = "create" | "edit";

function templateBodyPreview(t: Template): string {
  const body = t.components.find((c) => c.type === "BODY");
  return body?.text ? body.text.replace(/\s+/g, " ").trim() : "";
}

export type FollowupDialogContact = {
  id: number;
  name?: string | null;
  wa_id: string;
};

export type FollowupRecord = {
  id: number;
  contact_id: number;
  title: string;
  note: string | null;
  due_at: string;
  status: string;
  auto_send: number;
  message_kind: string | null;
  message_body: string | null;
  template_name: string | null;
  template_language: string | null;
  variable_mapping: string | null;
  assigned_user_id: number | null;
};

type UserRow = { id: number; name: string };

function toLocalInputValue(iso: string): string {
  // Convert ISO -> "YYYY-MM-DDTHH:MM" for <input type="datetime-local">
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string {
  // Treat the value as local time and convert to ISO.
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function defaultDueAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInputValue(d.toISOString());
}

const QUICK_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "+1h", minutes: 60 },
  { label: "+3h", minutes: 180 },
  { label: "Tomorrow 10am", minutes: -1 }, // special
  { label: "+2 days", minutes: 60 * 24 * 2 },
  { label: "+1 week", minutes: 60 * 24 * 7 },
];

export function FollowupDialog({
  open,
  onClose,
  onSaved,
  contact,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  contact: FollowupDialogContact | null;
  initial?: FollowupRecord | null;
}) {
  const mode: Mode = initial ? "edit" : "create";
  const [title, setTitle] = useState("Follow up");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [autoSend, setAutoSend] = useState(false);
  const [kind, setKind] = useState<"text" | "template">("text");
  const [messageBody, setMessageBody] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users")
      .then((r) => r.ok ? r.json() : { users: [] })
      .then((j) => setUsers(j.users || []))
      .catch(() => setUsers([]));
    setTemplatesLoading(true);
    fetch("/api/templates")
      .then((r) => r.ok ? r.json() : { templates: [] })
      .then((j) => setTemplates(j.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [open]);

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (t) => t.name === templateName && t.language === templateLanguage,
      ) || null,
    [templates, templateName, templateLanguage],
  );

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitle(initial.title || "Follow up");
      setNote(initial.note || "");
      setDueAt(toLocalInputValue(initial.due_at));
      setAutoSend(!!initial.auto_send);
      setKind((initial.message_kind as any) === "template" ? "template" : "text");
      setMessageBody(initial.message_body || "");
      setTemplateName(initial.template_name || "");
      setTemplateLanguage(initial.template_language || "");
      setAssignee(initial.assigned_user_id ? String(initial.assigned_user_id) : "");
    } else {
      setTitle("Follow up");
      setNote("");
      setDueAt(defaultDueAt());
      setAutoSend(false);
      setKind("text");
      setMessageBody("");
      setTemplateName("");
      setTemplateLanguage("");
      setAssignee("");
    }
    setErr(null);
  }, [open, initial]);

  const contactLabel = useMemo(() => {
    if (!contact) return "";
    return contact.name ? `${contact.name} (+${contact.wa_id})` : `+${contact.wa_id}`;
  }, [contact]);

  function applyPreset(p: { label: string; minutes: number }) {
    const d = new Date();
    if (p.label === "Tomorrow 10am") {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    } else {
      d.setMinutes(d.getMinutes() + p.minutes);
    }
    setDueAt(toLocalInputValue(d.toISOString()));
  }

  async function save() {
    setErr(null);
    if (!contact && mode === "create") {
      setErr("Pick a contact first");
      return;
    }
    const dueIso = fromLocalInputValue(dueAt);
    if (!dueIso) {
      setErr("Pick a valid due date and time");
      return;
    }
    if (autoSend) {
      if (kind === "text" && !messageBody.trim()) {
        setErr("Auto-send text follow-up needs a message body");
        return;
      }
      if (kind === "template" && (!templateName.trim() || !templateLanguage.trim())) {
        setErr("Auto-send template follow-up needs template name + language");
        return;
      }
    }
    setBusy(true);
    try {
      const payload: any = {
        title: title.trim() || "Follow up",
        note: note.trim() || null,
        due_at: dueIso,
        auto_send: autoSend,
        message_kind: autoSend ? kind : null,
        message_body: autoSend && kind === "text" ? messageBody : null,
        template_name: autoSend && kind === "template" ? templateName.trim() : null,
        template_language: autoSend && kind === "template" ? templateLanguage.trim() : null,
        assigned_user_id: assignee ? Number(assignee) : null,
      };
      if (mode === "create") payload.contact_id = contact?.id;
      const url = mode === "create" ? "/api/followups" : `/api/followups/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "Save failed");
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("Delete this follow-up?")) return;
    setBusy(true);
    try {
      await fetch(`/api/followups/${initial.id}`, { method: "DELETE" });
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-medium">
            {mode === "create" ? "New follow-up" : "Edit follow-up"}
          </div>
          <button onClick={onClose} className="text-xs text-wa-textMuted hover:text-wa-text">
            Close
          </button>
        </div>

        {contact && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-wa-textMuted">Contact</label>
            <div className="rounded bg-wa-panel px-3 py-2 text-sm">{contactLabel}</div>
          </div>
        )}

        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Quoted ₹45k for solar heater — confirm warranty terms"
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Due</label>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded border border-wa-border bg-wa-panel px-2 py-0.5 text-[11px] hover:bg-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Assign to (optional)</label>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 rounded border border-wa-border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
            />
            <span>Auto-send a message when this follow-up is due</span>
          </label>

          {autoSend && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setKind("text")}
                  className={`rounded px-3 py-1 text-xs ${
                    kind === "text" ? "bg-wa-greenDark text-white" : "bg-wa-panel"
                  }`}
                >
                  Free-form text
                </button>
                <button
                  onClick={() => setKind("template")}
                  className={`rounded px-3 py-1 text-xs ${
                    kind === "template" ? "bg-wa-greenDark text-white" : "bg-wa-panel"
                  }`}
                >
                  Approved template
                </button>
              </div>

              {kind === "text" && (
                <div>
                  <textarea
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    rows={3}
                    placeholder="Hi {{name}}, just checking in on the solar heater quote we shared. Any questions?"
                    className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
                  />
                  <div className="mt-1 text-[11px] text-wa-textMuted">
                    Note: free-form text only sends if the contact messaged you in the last 24h.
                    Otherwise WhatsApp blocks it. Use a template for older leads.
                  </div>
                </div>
              )}

              {kind === "template" && (
                <div>
                  <select
                    value={
                      templateName && templateLanguage
                        ? `${templateName}::${templateLanguage}`
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        setTemplateName("");
                        setTemplateLanguage("");
                        return;
                      }
                      const [n, lang] = v.split("::");
                      setTemplateName(n);
                      setTemplateLanguage(lang);
                    }}
                    className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
                  >
                    <option value="">
                      {templatesLoading
                        ? "Loading templates…"
                        : templates.length === 0
                          ? "No approved templates available"
                          : "— Select a template —"}
                    </option>
                    {templates.map((t) => (
                      <option
                        key={`${t.name}::${t.language}`}
                        value={`${t.name}::${t.language}`}
                      >
                        {t.name} ({t.language}) · {t.category}
                      </option>
                    ))}
                  </select>
                  {selectedTemplate && (
                    <div className="mt-2 rounded border border-wa-green/40 bg-wa-bubbleOut p-2">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                        Body preview
                      </div>
                      <div className="line-clamp-3 whitespace-pre-wrap text-xs">
                        {templateBodyPreview(selectedTemplate)}
                      </div>
                      {(() => {
                        const m = templateBodyPreview(selectedTemplate).match(
                          /\{\{(\d+)\}\}/g,
                        );
                        const count = m ? new Set(m).size : 0;
                        if (count === 0) return null;
                        return (
                          <div className="mt-1 text-[10px] text-amber-700">
                            ⚠ Template has {count} variable
                            {count === 1 ? "" : "s"} — auto-send will leave them
                            blank unless you wire variable_mapping. (Edit via API
                            for now.)
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {!selectedTemplate && templateName && templateLanguage && (
                    <div className="mt-2 text-[11px] text-amber-700">
                      ⚠ Saved template <b>{templateName}</b> ({templateLanguage})
                      is no longer in the approved list. Pick another one.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {err && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className="mt-4 flex justify-between">
          {mode === "edit" ? (
            <button
              onClick={remove}
              disabled={busy}
              className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
            >
              {busy ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
