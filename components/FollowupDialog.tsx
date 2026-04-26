"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template, VariableMapping } from "@/lib/types";

type Mode = "create" | "edit";

function templateBodyPreview(t: Template): string {
  const body = t.components.find((c) => c.type === "BODY");
  return body?.text ? body.text.replace(/\s+/g, " ").trim() : "";
}

function extractVarCount(t: Template): number {
  const body = t.components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const m = body.text.match(/\{\{(\d+)\}\}/g) || [];
  return new Set(m.map((s) => Number(s.replace(/[^\d]/g, "")))).size;
}

type HeaderMediaType = "image" | "video" | "document";

function headerFormat(t: Template): "TEXT" | HeaderMediaType | null {
  const h = t.components.find((c) => c.type === "HEADER");
  if (!h) return null;
  if (h.format === "TEXT") return "TEXT";
  if (h.format === "IMAGE") return "image";
  if (h.format === "VIDEO") return "video";
  if (h.format === "DOCUMENT") return "document";
  return null;
}

type DialogButton = {
  index: number;
  sub_type: "flow" | "quick_reply";
  text?: string;
};

/**
 * Pull FLOW / QUICK_REPLY buttons out of an approved template so the runner
 * can attach matching `button` components at send time. URL and PHONE_NUMBER
 * buttons don't need anything extra unless they have variables, which we
 * don't currently support in follow-ups.
 */
function detectButtons(t: Template): DialogButton[] {
  const group = t.components.find((c) => c.type === "BUTTONS") as any;
  const out: DialogButton[] = [];
  (group?.buttons || []).forEach((b: any, i: number) => {
    const ty = String(b?.type || "").toUpperCase();
    if (ty === "FLOW") out.push({ index: i, sub_type: "flow", text: b.text });
    else if (ty === "QUICK_REPLY")
      out.push({ index: i, sub_type: "quick_reply", text: b.text });
  });
  return out;
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
  header_json: string | null;
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
  const [mapping, setMapping] = useState<VariableMapping[]>([]);
  const [customFieldKeys, setCustomFieldKeys] = useState<string[]>([]);
  const [headerMediaId, setHeaderMediaId] = useState<string | null>(null);
  const [headerUrl, setHeaderUrl] = useState("");
  const [headerFilename, setHeaderFilename] = useState<string | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
    // Pull custom-field keys so the mapping picker can offer them.
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((j) => {
        const keys = new Set<string>();
        for (const c of j.contacts || []) {
          for (const k of Object.keys(c.custom_fields || {})) keys.add(k);
        }
        setCustomFieldKeys(Array.from(keys).sort());
      })
      .catch(() => setCustomFieldKeys([]));
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
      // Hydrate any saved variable mapping; if it doesn't parse, fall back to [].
      try {
        const parsed = initial.variable_mapping
          ? (JSON.parse(initial.variable_mapping) as VariableMapping[])
          : [];
        setMapping(Array.isArray(parsed) ? parsed : []);
      } catch {
        setMapping([]);
      }
      // Hydrate the saved media-header reference so editing doesn't lose it.
      try {
        const h = initial.header_json ? JSON.parse(initial.header_json) : null;
        setHeaderMediaId(h?.media_id || null);
        setHeaderUrl(h?.link || "");
        setHeaderFilename(h?.filename || null);
        setHeaderPreview(null); // we don't have the file blob anymore
      } catch {
        setHeaderMediaId(null);
        setHeaderUrl("");
        setHeaderFilename(null);
        setHeaderPreview(null);
      }
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
      setMapping([]);
      setHeaderMediaId(null);
      setHeaderUrl("");
      setHeaderFilename(null);
      setHeaderPreview(null);
    }
    setErr(null);
  }, [open, initial]);

  // When the user picks a different template, reshape the mapping to match
  // the variable count. Preserve the existing rows where possible (so toggling
  // back and forth doesn't wipe what's been entered).
  useEffect(() => {
    if (!selectedTemplate) return;
    const count = extractVarCount(selectedTemplate);
    setMapping((prev) => {
      if (count === 0) return [];
      const next: VariableMapping[] = [];
      for (let i = 0; i < count; i++) {
        next.push(prev[i] || { source: "static", value: "" });
      }
      return next;
    });
  }, [selectedTemplate]);

  const contactLabel = useMemo(() => {
    if (!contact) return "";
    return contact.name ? `${contact.name} (+${contact.wa_id})` : `+${contact.wa_id}`;
  }, [contact]);

  const hdrFormat = selectedTemplate ? headerFormat(selectedTemplate) : null;
  const needsHeaderMedia =
    hdrFormat === "image" || hdrFormat === "video" || hdrFormat === "document";
  const headerReady =
    !needsHeaderMedia || !!headerMediaId || headerUrl.trim().length > 0;

  async function uploadHeader(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      setHeaderMediaId(j.id);
      setHeaderFilename(file.name);
      setHeaderPreview(URL.createObjectURL(file));
      setHeaderUrl("");
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setUploading(false);
    }
  }

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
      if (kind === "template") {
        // Every static variable must have a value, otherwise WhatsApp rejects the send.
        const missing = mapping.findIndex(
          (m) => m.source === "static" && !m.value.trim(),
        );
        if (missing !== -1) {
          setErr(`Variable {{${missing + 1}}} is empty — fill it in or pick a contact field`);
          return;
        }
        const missingCustom = mapping.findIndex(
          (m) => m.source === "custom_field" && !m.value.trim(),
        );
        if (missingCustom !== -1) {
          setErr(`Variable {{${missingCustom + 1}}} needs a custom field name`);
          return;
        }
        if (needsHeaderMedia && !headerReady) {
          setErr(
            `This template needs a ${hdrFormat} header — upload a file or paste a public URL`,
          );
          return;
        }
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
        variable_mapping:
          autoSend && kind === "template" && mapping.length > 0 ? mapping : null,
        header:
          autoSend && kind === "template" && needsHeaderMedia
            ? {
                type: hdrFormat,
                media_id: headerMediaId || undefined,
                link: !headerMediaId && headerUrl.trim() ? headerUrl.trim() : undefined,
                filename:
                  hdrFormat === "document" ? headerFilename || undefined : undefined,
              }
            : null,
        // Auto-detect FLOW / QUICK_REPLY buttons on the template — Meta requires
        // a matching `button` component in the send payload or it returns
        // #131009 ("Parameter value is not valid").
        buttons:
          autoSend && kind === "template" && selectedTemplate
            ? detectButtons(selectedTemplate)
            : [],
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
                    </div>
                  )}

                  {selectedTemplate && needsHeaderMedia && (
                    <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
                      <div className="mb-2 text-[11px] font-medium text-amber-900">
                        Header {hdrFormat} required — same file is sent to the contact
                      </div>
                      <div className="mb-2 flex items-center gap-2">
                        <label className="cursor-pointer rounded border border-wa-border bg-white px-3 py-1.5 text-xs hover:bg-wa-panel">
                          {uploading ? "Uploading…" : "Choose file"}
                          <input
                            type="file"
                            className="hidden"
                            accept={
                              hdrFormat === "image"
                                ? "image/*"
                                : hdrFormat === "video"
                                  ? "video/*"
                                  : undefined
                            }
                            disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadHeader(f);
                            }}
                          />
                        </label>
                        <span className="text-xs text-wa-textMuted">or</span>
                        <input
                          value={headerUrl}
                          onChange={(e) => {
                            setHeaderUrl(e.target.value);
                            setHeaderMediaId(null);
                          }}
                          placeholder="Public URL"
                          className="flex-1 rounded border border-wa-border px-3 py-1.5 text-xs outline-none"
                        />
                      </div>
                      {headerMediaId && (
                        <div className="text-[11px] text-green-700">
                          ✓ Uploaded {headerFilename ? `(${headerFilename})` : ""}
                        </div>
                      )}
                      {!headerMediaId && headerUrl.trim() && (
                        <div className="text-[11px] text-wa-textMuted">
                          Will use this public URL at send time.
                        </div>
                      )}
                      {headerPreview && hdrFormat === "image" && (
                        <img
                          src={headerPreview}
                          className="mt-2 max-h-32 rounded border"
                          alt="preview"
                        />
                      )}
                    </div>
                  )}

                  {selectedTemplate && mapping.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-2 text-[11px] font-medium text-wa-textMuted">
                        Map each variable to contact data or a static value
                      </div>
                      <div className="space-y-2">
                        {mapping.map((m, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-12 text-xs text-wa-textMuted">{`{{${i + 1}}}`}</div>
                            <select
                              value={
                                m.source === "custom_field"
                                  ? `custom:${m.value}`
                                  : m.source === "static"
                                    ? "static"
                                    : m.source
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                const next = [...mapping];
                                if (v === "static") next[i] = { source: "static", value: "" };
                                else if (v === "name") next[i] = { source: "name", value: "" };
                                else if (v === "wa_id") next[i] = { source: "wa_id", value: "" };
                                else if (v.startsWith("custom:"))
                                  next[i] = { source: "custom_field", value: v.slice(7) };
                                setMapping(next);
                              }}
                              className="w-36 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                            >
                              <option value="static">Static text</option>
                              <option value="name">Contact name</option>
                              <option value="wa_id">Contact phone</option>
                              {customFieldKeys.map((k) => (
                                <option key={k} value={`custom:${k}`}>
                                  Custom: {k}
                                </option>
                              ))}
                            </select>
                            {m.source === "static" ? (
                              <input
                                value={m.value}
                                onChange={(e) => {
                                  const next = [...mapping];
                                  next[i] = { source: "static", value: e.target.value };
                                  setMapping(next);
                                }}
                                placeholder="Value to send"
                                className="flex-1 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                              />
                            ) : (
                              <div className="flex-1 rounded bg-wa-panel px-2 py-1 text-xs text-wa-textMuted">
                                {m.source === "name"
                                  ? "→ contact's name"
                                  : m.source === "wa_id"
                                    ? "→ contact's phone"
                                    : `→ contact's "${m.value}" field`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
