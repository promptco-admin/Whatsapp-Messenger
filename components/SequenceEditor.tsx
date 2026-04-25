"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template, VariableMapping } from "@/lib/types";

type Step = {
  id?: number;
  template_name: string;
  language: string;
  variable_mapping: VariableMapping[];
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
};

type Enrollment = {
  id: number;
  contact_id: number;
  current_step: number;
  status: string;
  next_run_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  last_error: string | null;
  wa_id: string;
  name: string | null;
};

type SequenceDetail = {
  sequence: {
    id: number;
    name: string;
    description: string | null;
    active: number;
  };
  steps: Array<{
    id: number;
    order_index: number;
    template_name: string;
    language: string;
    variable_mapping: string | null;
    header_json: string | null;
    delay_days: number;
    delay_hours: number;
    delay_minutes: number;
  }>;
  enrollments: Enrollment[];
};

function extractVarCount(tpl: Template): number {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const m = body.text.match(/\{\{(\d+)\}\}/g) || [];
  return new Set(m.map((s) => Number(s.replace(/[^\d]/g, "")))).size;
}

export function SequenceEditor({
  sequenceId,
  onDeleted,
  onChanged,
}: {
  sequenceId: number;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SequenceDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [enrollTag, setEnrollTag] = useState<string | null>(null);
  const [enrollResult, setEnrollResult] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/sequences/${sequenceId}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as SequenceDetail;
    setDetail(j);
    setName(j.sequence.name);
    setDescription(j.sequence.description || "");
    setActive(!!j.sequence.active);
    setSteps(
      j.steps.map((s) => ({
        id: s.id,
        template_name: s.template_name,
        language: s.language,
        variable_mapping: s.variable_mapping ? JSON.parse(s.variable_mapping) : [],
        delay_days: s.delay_days,
        delay_hours: s.delay_hours,
        delay_minutes: s.delay_minutes,
      })),
    );
  }

  useEffect(() => {
    load();
    fetch("/api/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates || []));
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((j) => setTags(j.tags || []));
  }, [sequenceId]);

  const templatesByKey = useMemo(() => {
    const map = new Map<string, Template>();
    for (const t of templates) map.set(`${t.name}::${t.language}`, t);
    return map;
  }, [templates]);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        template_name: "",
        language: "en_US",
        variable_mapping: [],
        delay_days: prev.length === 0 ? 0 : 1,
        delay_hours: 0,
        delay_minutes: 0,
      },
    ]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveStep(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function setStepTemplate(i: number, templateName: string, language: string) {
    const tpl = templatesByKey.get(`${templateName}::${language}`);
    const count = tpl ? extractVarCount(tpl) : 0;
    updateStep(i, {
      template_name: templateName,
      language,
      variable_mapping: Array.from({ length: count }, () => ({ source: "static", value: "" })),
    });
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/sequences/${sequenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, active }),
      });
      await fetch(`/api/sequences/${sequenceId}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this sequence? Active enrollments will be cancelled.")) return;
    await fetch(`/api/sequences/${sequenceId}`, { method: "DELETE" });
    onDeleted();
  }

  async function enrollByTag() {
    if (!enrollTag) return;
    const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment_tag: enrollTag }),
    });
    const j = await res.json();
    if (!res.ok) {
      setEnrollResult(`Error: ${j.error || "failed"}`);
    } else {
      setEnrollResult(`Enrolled ${j.enrolled}, skipped ${j.skipped}.`);
      await load();
      onChanged();
    }
  }

  async function changeEnrollment(enrollmentId: number, status: string) {
    await fetch(`/api/sequences/${sequenceId}/enroll`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_id: enrollmentId, status }),
    });
    await load();
    onChanged();
  }

  if (!detail) {
    return <div className="p-8 text-sm text-wa-textMuted">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-wa-border bg-white px-4 py-3">
        <div className="flex flex-1 items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-wa-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEnrollOpen(true)}
            className="rounded bg-white px-3 py-1.5 text-xs font-medium text-wa-text hover:bg-wa-panel"
            style={{ border: "1px solid #d1d7db" }}
          >
            + Enroll contacts
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={remove}
            className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: steps editor */}
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Description (optional)"
            className="mb-4 w-full resize-none rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />

          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Steps (sent in order)</div>
            <button
              onClick={addStep}
              className="rounded bg-wa-greenDark px-3 py-1 text-xs font-medium text-white hover:bg-wa-green"
            >
              + Add step
            </button>
          </div>

          {steps.length === 0 && (
            <div className="rounded border border-dashed border-wa-border p-6 text-center text-sm text-wa-textMuted">
              No steps yet. Add a first step — it fires immediately on enrollment (unless you set
              a delay).
            </div>
          )}

          <div className="space-y-3">
            {steps.map((s, i) => {
              const tpl = templatesByKey.get(`${s.template_name}::${s.language}`);
              const body = tpl?.components.find((c) => c.type === "BODY")?.text || "";
              return (
                <div key={i} className="rounded border border-wa-border bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-wa-textMuted">
                      Step {i + 1}
                      {i === 0 ? " (fires first)" : ""}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => moveStep(i, -1)}
                        disabled={i === 0}
                        className="rounded border border-wa-border px-2 py-0.5 text-xs hover:bg-wa-panel disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveStep(i, 1)}
                        disabled={i === steps.length - 1}
                        className="rounded border border-wa-border px-2 py-0.5 text-xs hover:bg-wa-panel disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeStep(i)}
                        className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <label className="mb-1 block text-[10px] text-wa-textMuted">Template</label>
                  <select
                    value={s.template_name ? `${s.template_name}::${s.language}` : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const [tn, lang] = v.split("::");
                      setStepTemplate(i, tn, lang);
                    }}
                    className="mb-2 w-full rounded border border-wa-border px-2 py-1.5 text-sm outline-none"
                  >
                    <option value="">— pick an approved template —</option>
                    {templates.map((t) => (
                      <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>

                  {s.variable_mapping.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {s.variable_mapping.map((m, vi) => (
                        <div key={vi} className="flex items-center gap-2">
                          <div className="w-12 text-xs text-wa-textMuted">{`{{${vi + 1}}}`}</div>
                          <select
                            value={m.source === "custom_field" ? `custom:${m.value}` : m.source}
                            onChange={(e) => {
                              const v = e.target.value;
                              const next = [...s.variable_mapping];
                              if (v === "static") next[vi] = { source: "static", value: "" };
                              else if (v === "name") next[vi] = { source: "name", value: "" };
                              else if (v === "wa_id") next[vi] = { source: "wa_id", value: "" };
                              else if (v.startsWith("custom:"))
                                next[vi] = { source: "custom_field", value: v.slice(7) };
                              updateStep(i, { variable_mapping: next });
                            }}
                            className="w-36 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                          >
                            <option value="static">Static text</option>
                            <option value="name">Contact name</option>
                            <option value="wa_id">Contact phone</option>
                          </select>
                          {m.source === "static" ? (
                            <input
                              value={m.value}
                              onChange={(e) => {
                                const next = [...s.variable_mapping];
                                next[vi] = { source: "static", value: e.target.value };
                                updateStep(i, { variable_mapping: next });
                              }}
                              placeholder="Value"
                              className="flex-1 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                            />
                          ) : (
                            <div className="flex-1 rounded bg-wa-panel px-2 py-1 text-xs text-wa-textMuted">
                              {m.source === "name" ? "→ contact name" : "→ contact phone"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {body && (
                    <div className="mb-2 rounded bg-wa-bubbleOut px-2 py-1.5 text-[11px] whitespace-pre-wrap">
                      {body}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="text-xs text-wa-textMuted">
                      {i === 0 ? "Delay after enrollment:" : "Delay after previous step:"}
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={s.delay_days}
                      onChange={(e) => updateStep(i, { delay_days: Number(e.target.value) || 0 })}
                      className="w-14 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                    />
                    <span className="text-xs">d</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={s.delay_hours}
                      onChange={(e) => updateStep(i, { delay_hours: Number(e.target.value) || 0 })}
                      className="w-14 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                    />
                    <span className="text-xs">h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={s.delay_minutes}
                      onChange={(e) => updateStep(i, { delay_minutes: Number(e.target.value) || 0 })}
                      className="w-14 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                    />
                    <span className="text-xs">m</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: enrollments */}
        <aside className="w-80 flex-none overflow-y-auto border-l border-wa-border bg-wa-panel">
          <div className="border-b border-wa-border bg-white px-4 py-3 text-sm font-medium">
            Enrollments ({detail.enrollments.length})
          </div>
          {detail.enrollments.length === 0 && (
            <div className="p-4 text-xs text-wa-textMuted">
              No one enrolled yet. Click "+ Enroll contacts" above.
            </div>
          )}
          {detail.enrollments.map((e) => (
            <div key={e.id} className="border-b border-wa-border bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="truncate text-xs font-medium">
                  {e.name || `+${e.wa_id}`}
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    e.status === "active"
                      ? "bg-blue-100 text-blue-800"
                      : e.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : e.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {e.status}
                </span>
              </div>
              <div className="text-[10px] text-wa-textMuted">
                Step {e.current_step + 1} of {steps.length}
                {e.next_run_at && e.status === "active"
                  ? ` · next ${new Date(e.next_run_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                  : ""}
              </div>
              {e.last_error && (
                <div className="mt-1 text-[10px] text-red-600">{e.last_error}</div>
              )}
              {e.status === "active" && (
                <button
                  onClick={() => changeEnrollment(e.id, "paused")}
                  className="mt-1 text-[10px] text-wa-textMuted hover:text-wa-text"
                >
                  Pause
                </button>
              )}
              {e.status === "paused" && (
                <button
                  onClick={() => changeEnrollment(e.id, "active")}
                  className="mt-1 text-[10px] text-wa-textMuted hover:text-wa-text"
                >
                  Resume
                </button>
              )}
            </div>
          ))}
        </aside>
      </div>

      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 text-lg font-medium">Enroll contacts</div>
            <div className="mb-3 text-xs text-wa-textMuted">
              Pick a tag — every contact with that tag gets enrolled. Contacts already enrolled
              are skipped.
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {tags.length === 0 && (
                <div className="text-xs text-wa-textMuted">
                  No tags found. Tag some contacts first, then come back.
                </div>
              )}
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setEnrollTag(t)}
                  className={`rounded border px-3 py-1 text-xs ${
                    enrollTag === t
                      ? "border-wa-greenDark bg-wa-bubbleOut"
                      : "border-wa-border bg-white"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
            {enrollResult && (
              <div className="mb-3 text-xs text-wa-textMuted">{enrollResult}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEnrollOpen(false);
                  setEnrollResult(null);
                  setEnrollTag(null);
                }}
                className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
              >
                Close
              </button>
              <button
                onClick={enrollByTag}
                disabled={!enrollTag || steps.length === 0}
                className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                Enroll
              </button>
            </div>
            {steps.length === 0 && (
              <div className="mt-2 text-[11px] text-red-600">
                Add at least one step and save before enrolling.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
