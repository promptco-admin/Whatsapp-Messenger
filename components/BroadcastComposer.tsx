"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template, VariableMapping } from "@/lib/types";

type HeaderMediaType = "image" | "video" | "document";

function extractVarCount(tpl: Template): number {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const m = body.text.match(/\{\{(\d+)\}\}/g) || [];
  return new Set(m.map((s) => Number(s.replace(/[^\d]/g, "")))).size;
}

function headerFormat(tpl: Template): "TEXT" | HeaderMediaType | null {
  const h = tpl.components.find((c) => c.type === "HEADER");
  if (!h) return null;
  if (h.format === "TEXT") return "TEXT";
  if (h.format === "IMAGE") return "image";
  if (h.format === "VIDEO") return "video";
  if (h.format === "DOCUMENT") return "document";
  return null;
}

export function BroadcastComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [broadcastName, setBroadcastName] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [segment, setSegment] = useState<string | null>(null);
  // Phase 8: multi-condition segment (AND-combined). When non-empty, takes
  // precedence over the single-tag `segment`.
  const [segmentConditions, setSegmentConditions] = useState<
    Array<{ field: string; op: string; value: string; value2?: string }>
  >([]);
  const [customFieldKeys, setCustomFieldKeys] = useState<string[]>([]);
  const [mapping, setMapping] = useState<VariableMapping[]>([]);
  const [headerUrl, setHeaderUrl] = useState("");
  const [headerMediaId, setHeaderMediaId] = useState<string | null>(null);
  const [headerFilename, setHeaderFilename] = useState<string | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    fetch("/api/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates || []))
      .catch((e) => setError(e.message));
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((j) => {
        setTags(j.tags || []);
        const keys = new Set<string>();
        for (const c of j.contacts || []) {
          for (const k of Object.keys(c.custom_fields || {})) keys.add(k);
        }
        setCustomFieldKeys(Array.from(keys).sort());
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Phase 8: if any multi-condition filter is set, use segment-preview;
    // otherwise fall back to the simpler contacts?tag= path.
    const validConds = segmentConditions.filter((c) => c.field && c.op);
    if (validConds.length > 0) {
      fetch("/api/contacts/segment-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: null, conditions: validConds }),
      })
        .then((r) => r.json())
        .then((j) => setRecipientCount(j.count || 0))
        .catch(() => setRecipientCount(0));
      return;
    }
    const params = new URLSearchParams();
    if (segment) params.set("tag", segment);
    fetch(`/api/contacts?${params}`)
      .then((r) => r.json())
      .then((j) => setRecipientCount((j.contacts || []).length));
  }, [segment, segmentConditions, open]);

  const selected = useMemo(
    () =>
      templates.find(
        (t) => t.name === selectedName && (selectedLang ? t.language === selectedLang : true),
      ) || null,
    [templates, selectedName, selectedLang],
  );

  useEffect(() => {
    if (!selected) return;
    const count = extractVarCount(selected);
    setMapping(Array.from({ length: count }, () => ({ source: "static", value: "" })));
    setHeaderUrl("");
    setHeaderMediaId(null);
    setHeaderFilename(null);
    setHeaderPreview(null);
  }, [selected]);

  if (!open) return null;

  const hdrFormat = selected ? headerFormat(selected) : null;
  const needsHeaderMedia = hdrFormat === "image" || hdrFormat === "video" || hdrFormat === "document";
  const headerReady = !needsHeaderMedia || !!headerMediaId || headerUrl.trim().length > 0;

  async function uploadHeader(file: File) {
    setUploading(true);
    setError(null);
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
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!selected) return;
    if (recipientCount === 0) {
      setError("No recipients match this segment. Import contacts or change the segment.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const buttonsGroup = selected.components.find((c) => c.type === "BUTTONS") as any;
      const dynamicButtons: Array<{ index: number; sub_type: string; text?: string }> = [];
      (buttonsGroup?.buttons || []).forEach((b: any, i: number) => {
        const t = (b.type || "").toUpperCase();
        if (t === "FLOW") dynamicButtons.push({ index: i, sub_type: "flow", text: b.text });
        else if (t === "QUICK_REPLY")
          dynamicButtons.push({ index: i, sub_type: "quick_reply", text: b.text });
      });

      let scheduledIso: string | null = null;
      if (sendMode === "schedule") {
        if (!scheduledFor) {
          setError("Pick a date and time to schedule this broadcast.");
          return;
        }
        const t = new Date(scheduledFor);
        if (isNaN(t.getTime()) || t.getTime() <= Date.now() + 30_000) {
          setError("Pick a time at least 1 minute in the future.");
          return;
        }
        scheduledIso = t.toISOString();
      }

      const validConds = segmentConditions.filter((c) => c.field && c.op);
      const payload: any = {
        name: broadcastName.trim() || `${selected.name} broadcast`,
        template_name: selected.name,
        language: selected.language,
        segment_tag: validConds.length > 0 ? null : segment,
        segment_conditions: validConds,
        variable_mapping: mapping,
        buttons: dynamicButtons.length ? dynamicButtons : undefined,
        scheduled_for: scheduledIso,
      };
      if (needsHeaderMedia) {
        payload.header = {
          type: hdrFormat,
          media_id: headerMediaId || undefined,
          link: !headerMediaId && headerUrl.trim() ? headerUrl.trim() : undefined,
          filename: hdrFormat === "document" ? headerFilename || undefined : undefined,
        };
      }
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed to start broadcast");
        return;
      }
      onCreated(j.id);
      onClose();
      setBroadcastName("");
      setSelectedName(null);
      setSelectedLang(null);
      setSegment(null);
      setMapping([]);
      setSendMode("now");
      setScheduledFor("");
    } finally {
      setSubmitting(false);
    }
  }

  const allMappingFilled =
    mapping.length === 0 ||
    mapping.every((m) => {
      if (m.source === "static") return m.value.trim().length > 0;
      return m.source === "name" || m.source === "wa_id" || !!m.value;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[720px] max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex w-64 flex-none flex-col border-r border-wa-border bg-wa-panel">
          <div className="border-b border-wa-border p-3 text-sm font-medium">Template</div>
          <div className="scroll-thin flex-1 overflow-y-auto">
            {templates.length === 0 && (
              <div className="p-3 text-xs text-wa-textMuted">Loading templates…</div>
            )}
            {templates.map((t) => {
              const active = t.name === selectedName && t.language === selectedLang;
              return (
                <button
                  key={`${t.name}-${t.language}`}
                  onClick={() => {
                    setSelectedName(t.name);
                    setSelectedLang(t.language);
                  }}
                  className={`block w-full border-b border-wa-border px-3 py-2 text-left text-xs hover:bg-white ${
                    active ? "bg-white" : ""
                  }`}
                >
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="text-[10px] text-wa-textMuted">
                    {t.language} · {t.category}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-wa-border p-3">
            <div className="text-sm font-medium">New broadcast</div>
            <button onClick={onClose} className="text-xs text-wa-textMuted hover:text-wa-text">
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-wa-textMuted">Broadcast name</label>
                <input
                  value={broadcastName}
                  onChange={(e) => setBroadcastName(e.target.value)}
                  placeholder="e.g. April filter cleaning reminder"
                  className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-wa-textMuted">Audience (segment)</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSegment(null)}
                    className={`rounded border px-3 py-1 text-xs ${
                      !segment
                        ? "border-wa-greenDark bg-wa-bubbleOut"
                        : "border-wa-border bg-white"
                    }`}
                  >
                    All contacts
                  </button>
                  {tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSegment(t)}
                      className={`rounded border px-3 py-1 text-xs ${
                        segment === t
                          ? "border-wa-greenDark bg-wa-bubbleOut"
                          : "border-wa-border bg-white"
                      }`}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-wa-textMuted">
                  {recipientCount} recipient{recipientCount === 1 ? "" : "s"} matched
                  {segmentConditions.filter((c) => c.field && c.op).length > 0 && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                      using advanced filter — tag chips ignored
                    </span>
                  )}
                </div>
              </div>

              {/* Phase 8: advanced multi-condition segment builder */}
              <div>
                <label className="mb-1 block text-xs text-wa-textMuted">
                  Advanced filter (all conditions must match)
                </label>
                {segmentConditions.length === 0 ? (
                  <button
                    onClick={() =>
                      setSegmentConditions([{ field: "tag", op: "has", value: "" }])
                    }
                    className="rounded border border-dashed border-wa-border px-3 py-1.5 text-xs text-wa-textMuted hover:bg-wa-panel/40"
                  >
                    + Add condition
                  </button>
                ) : (
                  <div className="space-y-2">
                    {segmentConditions.map((c, i) => (
                      <SegmentConditionRow
                        key={i}
                        cond={c}
                        tags={tags}
                        customFieldKeys={customFieldKeys}
                        onChange={(next) =>
                          setSegmentConditions((prev) =>
                            prev.map((p, j) => (j === i ? next : p)),
                          )
                        }
                        onRemove={() =>
                          setSegmentConditions((prev) =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
                      />
                    ))}
                    <button
                      onClick={() =>
                        setSegmentConditions((prev) => [
                          ...prev,
                          { field: "tag", op: "has", value: "" },
                        ])
                      }
                      className="rounded border border-dashed border-wa-border px-3 py-1 text-[11px] text-wa-textMuted hover:bg-wa-panel/40"
                    >
                      + Add another AND condition
                    </button>
                  </div>
                )}
              </div>
            </div>

            {!selected && (
              <div className="rounded border border-dashed border-wa-border p-6 text-center text-sm text-wa-textMuted">
                Pick an approved template on the left.
              </div>
            )}

            {selected && (
              <>
                {needsHeaderMedia && (
                  <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3">
                    <div className="mb-2 text-xs font-medium text-amber-900">
                      Header {hdrFormat} (same image/file for everyone)
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
                    {headerPreview && hdrFormat === "image" && (
                      <img src={headerPreview} className="mt-2 max-h-32 rounded border" alt="preview" />
                    )}
                  </div>
                )}

                {mapping.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 text-xs font-medium text-wa-textMuted">
                      Map each variable to contact data or a static value
                    </div>
                    <div className="space-y-2">
                      {mapping.map((m, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-16 text-xs text-wa-textMuted">{`{{${i + 1}}}`}</div>
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
                            className="w-40 rounded border border-wa-border px-2 py-1.5 text-xs outline-none"
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
                              placeholder="Value for everyone"
                              className="flex-1 rounded border border-wa-border px-3 py-1.5 text-xs outline-none"
                            />
                          ) : (
                            <div className="flex-1 rounded bg-wa-panel px-3 py-1.5 text-xs text-wa-textMuted">
                              {m.source === "name"
                                ? "→ each contact's name"
                                : m.source === "wa_id"
                                  ? "→ each contact's phone"
                                  : `→ each contact's "${m.value}" field`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded border border-wa-green/40 bg-wa-bubbleOut p-3">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                    Template body (with {`{{1}}`} placeholders)
                  </div>
                  <div className="whitespace-pre-wrap text-sm">
                    {selected.components.find((c) => c.type === "BODY")?.text || ""}
                  </div>
                </div>

                <div className="mt-4 rounded border border-wa-border p-3">
                  <div className="mb-2 text-xs font-medium text-wa-text">When to send</div>
                  <div className="mb-2 flex gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        checked={sendMode === "now"}
                        onChange={() => setSendMode("now")}
                      />
                      Send now
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        checked={sendMode === "schedule"}
                        onChange={() => setSendMode("schedule")}
                      />
                      Schedule for later
                    </label>
                  </div>
                  {sendMode === "schedule" && (
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                    />
                  )}
                  <div className="mt-1 text-[10px] text-wa-textMuted">
                    Scheduled broadcasts fire via a 60-second tick, so they may start up to a
                    minute late.
                  </div>
                </div>
              </>
            )}

            {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
          </div>

          <div className="flex items-center justify-between border-t border-wa-border p-3">
            <div className="text-xs text-wa-textMuted">
              {selected ? `${recipientCount} recipient${recipientCount === 1 ? "" : "s"}` : ""}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
              >
                Cancel
              </button>
              <button
                disabled={
                  !selected ||
                  submitting ||
                  uploading ||
                  !headerReady ||
                  !allMappingFilled ||
                  recipientCount === 0
                }
                onClick={submit}
                className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                {submitting
                  ? "Starting…"
                  : sendMode === "schedule"
                    ? `Schedule for ${recipientCount}`
                    : `Send to ${recipientCount}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 8: one row in the multi-condition segment builder

function SegmentConditionRow({
  cond,
  tags,
  customFieldKeys,
  onChange,
  onRemove,
}: {
  cond: { field: string; op: string; value: string; value2?: string };
  tags: string[];
  customFieldKeys: string[];
  onChange: (next: { field: string; op: string; value: string; value2?: string }) => void;
  onRemove: () => void;
}) {
  const needsDate = cond.field === "last_inbound_at" || cond.field === "created_at";
  const needsValue2 =
    cond.field === "custom_field" &&
    ["equals", "not_equals", "contains"].includes(cond.op);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-wa-border bg-white p-2">
      <select
        value={cond.field}
        onChange={(e) => {
          const field = e.target.value;
          // Reset op to a valid default for the new field
          const defaultOp: Record<string, string> = {
            tag: "has",
            custom_field: "has",
            last_inbound_at: "after",
            created_at: "after",
            assigned_user_id: "has",
            source_type: "has",
            unsubscribed: "missing",
          };
          onChange({ field, op: defaultOp[field] || "has", value: "", value2: "" });
        }}
        className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
      >
        <option value="tag">Tag</option>
        <option value="custom_field">Custom field</option>
        <option value="last_inbound_at">Last inbound</option>
        <option value="created_at">Created</option>
        <option value="assigned_user_id">Assigned agent</option>
        <option value="source_type">Source type</option>
        <option value="unsubscribed">Unsubscribed</option>
      </select>

      <select
        value={cond.op}
        onChange={(e) => onChange({ ...cond, op: e.target.value })}
        className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
      >
        {cond.field === "tag" && (
          <>
            <option value="has">has tag</option>
            <option value="missing">missing tag</option>
          </>
        )}
        {cond.field === "custom_field" && (
          <>
            <option value="has">field has any value</option>
            <option value="missing">field is empty</option>
            <option value="equals">equals</option>
            <option value="not_equals">does not equal</option>
            <option value="contains">contains</option>
          </>
        )}
        {(cond.field === "last_inbound_at" || cond.field === "created_at") && (
          <>
            <option value="after">after</option>
            <option value="before">before</option>
            <option value="missing">has never happened</option>
          </>
        )}
        {cond.field === "assigned_user_id" && (
          <>
            <option value="has">is assigned</option>
            <option value="missing">is unassigned</option>
            <option value="equals">equals user id</option>
          </>
        )}
        {cond.field === "source_type" && (
          <>
            <option value="has">has a source</option>
            <option value="missing">no source</option>
            <option value="equals">equals</option>
          </>
        )}
        {cond.field === "unsubscribed" && (
          <>
            <option value="has">is unsubscribed</option>
            <option value="missing">is subscribed</option>
          </>
        )}
      </select>

      {/* Value input — shape depends on field */}
      {cond.field === "tag" &&
        (tags.length > 0 ? (
          <select
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            className="min-w-[140px] rounded border border-wa-border bg-white px-2 py-1 text-xs"
          >
            <option value="">— pick —</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            placeholder="tag name"
            className="min-w-[140px] rounded border border-wa-border bg-white px-2 py-1 text-xs"
          />
        ))}

      {cond.field === "custom_field" &&
        (customFieldKeys.length > 0 ? (
          <select
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            className="min-w-[140px] rounded border border-wa-border bg-white px-2 py-1 text-xs"
          >
            <option value="">— field —</option>
            {customFieldKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            placeholder="field name"
            className="min-w-[140px] rounded border border-wa-border bg-white px-2 py-1 text-xs"
          />
        ))}

      {needsDate && cond.op !== "missing" && (
        <input
          type="date"
          value={cond.value}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
          className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
        />
      )}

      {cond.field === "assigned_user_id" && cond.op === "equals" && (
        <input
          type="number"
          value={cond.value}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
          placeholder="user id"
          className="min-w-[100px] rounded border border-wa-border bg-white px-2 py-1 text-xs"
        />
      )}

      {cond.field === "source_type" && cond.op === "equals" && (
        <select
          value={cond.value}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
          className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
        >
          <option value="">— pick —</option>
          <option value="ad">ad</option>
          <option value="manual">manual</option>
        </select>
      )}

      {needsValue2 && (
        <input
          value={cond.value2 || ""}
          onChange={(e) => onChange({ ...cond, value2: e.target.value })}
          placeholder="value"
          className="min-w-[120px] rounded border border-wa-border bg-white px-2 py-1 text-xs"
        />
      )}

      <button
        onClick={onRemove}
        className="ml-auto text-[10px] text-red-600 hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
