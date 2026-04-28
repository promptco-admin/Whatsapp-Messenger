"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template, VariableMapping } from "@/lib/types";

type HoursConfig = {
  tz: string;
  days: number[];
  start: string;
  end: string;
};

type AutoReply = {
  id: number;
  name: string;
  trigger_keyword: string;
  match_type: "exact" | "contains" | "starts_with";
  response_kind: "text" | "template";
  response_text: string | null;
  template_name: string | null;
  template_language: string | null;
  variable_mapping: string | null;
  cooldown_minutes: number;
  active: number;
  priority: number;
  fire_count: number;
  hours_json: string | null;
  created_at: string;
  updated_at: string;
};

type EditingRule = {
  id?: number;
  name: string;
  trigger_keyword: string;
  match_type: "exact" | "contains" | "starts_with";
  response_kind: "text" | "template";
  response_text: string;
  template_name: string;
  template_language: string;
  variable_mapping: VariableMapping[];
  cooldown_minutes: number;
  active: boolean;
  priority: number;
  hours_enabled: boolean;
  hours: HoursConfig;
};

const DEFAULT_HOURS: HoursConfig = {
  tz: "Asia/Kolkata",
  days: [1, 2, 3, 4, 5, 6], // Mon–Sat
  start: "09:00",
  end: "19:00",
};

const BLANK: EditingRule = {
  name: "",
  trigger_keyword: "",
  match_type: "contains",
  response_kind: "text",
  response_text: "",
  template_name: "",
  template_language: "",
  variable_mapping: [],
  cooldown_minutes: 60,
  active: true,
  priority: 0,
  hours_enabled: false,
  hours: { ...DEFAULT_HOURS },
};

function extractVarCount(tpl: Template): number {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const m = body.text.match(/\{\{(\d+)\}\}/g) || [];
  return new Set(m.map((s) => Number(s.replace(/[^\d]/g, "")))).size;
}

export function AutoRepliesPage() {
  const [rules, setRules] = useState<AutoReply[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<EditingRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/auto-replies", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setRules(j.auto_replies || []);
  }

  useEffect(() => {
    load();
    fetch("/api/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates || []));
  }, []);

  const templatesByKey = useMemo(() => {
    const m = new Map<string, Template>();
    for (const t of templates) m.set(`${t.name}::${t.language}`, t);
    return m;
  }, [templates]);

  function startNew() {
    setEditing({ ...BLANK });
    setError(null);
  }

  function startEdit(r: AutoReply) {
    let hours: HoursConfig = { ...DEFAULT_HOURS };
    let hoursEnabled = false;
    if (r.hours_json) {
      try {
        const parsed = JSON.parse(r.hours_json);
        hours = { ...DEFAULT_HOURS, ...parsed };
        hoursEnabled = true;
      } catch {}
    }
    setEditing({
      id: r.id,
      name: r.name,
      trigger_keyword: r.trigger_keyword,
      match_type: r.match_type,
      response_kind: r.response_kind,
      response_text: r.response_text || "",
      template_name: r.template_name || "",
      template_language: r.template_language || "",
      variable_mapping: r.variable_mapping ? JSON.parse(r.variable_mapping) : [],
      cooldown_minutes: r.cooldown_minutes,
      active: !!r.active,
      priority: r.priority,
      hours_enabled: hoursEnabled,
      hours,
    });
    setError(null);
  }

  function setTemplateForRule(templateName: string, language: string) {
    if (!editing) return;
    const tpl = templatesByKey.get(`${templateName}::${language}`);
    const count = tpl ? extractVarCount(tpl) : 0;
    setEditing({
      ...editing,
      template_name: templateName,
      template_language: language,
      variable_mapping: Array.from({ length: count }, () => ({ source: "static", value: "" })),
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return setError("Give this rule a name.");
    if (!editing.trigger_keyword.trim()) return setError("Trigger keyword is required.");
    if (editing.response_kind === "text" && !editing.response_text.trim()) {
      return setError("Write a reply message.");
    }
    if (editing.response_kind === "template" && !editing.template_name) {
      return setError("Pick a template to send.");
    }

    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: editing.name.trim(),
        trigger_keyword: editing.trigger_keyword.trim(),
        match_type: editing.match_type,
        response_kind: editing.response_kind,
        cooldown_minutes: editing.cooldown_minutes,
        active: editing.active,
        priority: editing.priority,
        hours_json: editing.hours_enabled ? editing.hours : null,
      };
      if (editing.response_kind === "text") {
        payload.response_text = editing.response_text.trim();
      } else {
        payload.template_name = editing.template_name;
        payload.template_language = editing.template_language || "en_US";
        payload.variable_mapping = editing.variable_mapping;
      }

      const method = editing.id ? "PATCH" : "POST";
      const url = editing.id ? `/api/auto-replies/${editing.id}` : "/api/auto-replies";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed to save");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this auto-reply rule?")) return;
    await fetch(`/api/auto-replies/${id}`, { method: "DELETE" });
    setEditing(null);
    await load();
  }

  async function toggleActive(r: AutoReply) {
    await fetch(`/api/auto-replies/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    await load();
  }

  async function runTest() {
    if (!testMsg.trim()) return;
    const res = await fetch("/api/auto-replies/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testMsg }),
    });
    const j = await res.json();
    if (!res.ok) {
      setTestResult(`Error: ${j.error}`);
    } else if (!j.matched) {
      setTestResult(`No rule matched (checked ${j.checked} active rule${j.checked === 1 ? "" : "s"}).`);
    } else {
      setTestResult(
        `✓ Would fire rule "${j.matched.name}" (keyword "${j.matched.trigger_keyword}", ${j.matched.match_type}).`,
      );
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-3 py-3 md:px-6 md:py-4">
        <div className="min-w-0 flex-1">
          <div className="text-lg font-medium">Auto-reply rules</div>
          <div className="text-xs text-wa-textMuted">
            When a customer sends a message matching a keyword, auto-send a reply. Rules are
            checked in priority order — first match fires.
          </div>
        </div>
        <button
          onClick={startNew}
          className="flex-none rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + New rule
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="border-b border-wa-border bg-wa-panel p-4">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              Test a message
            </div>
            <div className="flex gap-2">
              <input
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runTest();
                }}
                placeholder='Type what a customer might send, e.g. "what are your hours?"'
                className="flex-1 rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
              />
              <button
                onClick={runTest}
                disabled={!testMsg.trim()}
                className="rounded bg-wa-greenDark px-4 py-2 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                Test
              </button>
            </div>
            {testResult && (
              <div className="mt-2 text-xs text-wa-text">{testResult}</div>
            )}
          </div>

          {rules.length === 0 && (
            <div className="p-8 text-center text-sm text-wa-textMuted">
              No rules yet. Click "+ New rule" to create one.
            </div>
          )}

          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-wa-textMuted">
                <th className="border-b border-wa-border px-6 py-2">On</th>
                <th className="border-b border-wa-border px-6 py-2">Name</th>
                <th className="border-b border-wa-border px-6 py-2">When message…</th>
                <th className="border-b border-wa-border px-6 py-2">Reply</th>
                <th className="border-b border-wa-border px-6 py-2">Cooldown</th>
                <th className="border-b border-wa-border px-6 py-2">Fired</th>
                <th className="border-b border-wa-border px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-wa-panel ${editing?.id === r.id ? "bg-wa-panel" : ""}`}
                >
                  <td className="border-b border-wa-border px-6 py-2">
                    <input
                      type="checkbox"
                      checked={!!r.active}
                      onChange={() => toggleActive(r)}
                    />
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 font-medium">{r.name}</td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">
                    {r.match_type === "exact"
                      ? "is exactly"
                      : r.match_type === "starts_with"
                        ? "starts with"
                        : "contains"}{" "}
                    <code className="rounded bg-wa-bubbleOut px-1.5 py-0.5 text-green-900">
                      {r.trigger_keyword}
                    </code>
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">
                    {r.response_kind === "text" ? (
                      <span className="truncate">
                        💬{" "}
                        {(r.response_text || "").slice(0, 60)}
                        {(r.response_text || "").length > 60 ? "…" : ""}
                      </span>
                    ) : (
                      <span>
                        📄 {r.template_name} ({r.template_language})
                      </span>
                    )}
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">
                    {r.cooldown_minutes}m
                  </td>
                  <td className="border-b border-wa-border px-6 py-2 text-xs">{r.fire_count}</td>
                  <td className="border-b border-wa-border px-6 py-2 text-right">
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded px-2 py-1 text-xs text-wa-text hover:bg-white"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing && (
          <aside className="w-[420px] flex-none overflow-y-auto border-l border-wa-border bg-wa-panel">
            <div className="flex items-center justify-between border-b border-wa-border bg-white px-4 py-3">
              <div className="text-sm font-medium">
                {editing.id ? "Edit rule" : "New rule"}
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-xs text-wa-textMuted hover:text-wa-text"
              >
                Close
              </button>
            </div>
            <div className="p-4 text-sm">
              <label className="mb-1 block text-xs text-wa-textMuted">Rule name (for you)</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Business hours reply"
                className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
              />

              <label className="mb-1 block text-xs text-wa-textMuted">
                Fire when the customer's message…
              </label>
              <div className="mb-2 flex gap-2">
                {(["contains", "exact", "starts_with"] as const).map((mt) => (
                  <button
                    key={mt}
                    onClick={() => setEditing({ ...editing, match_type: mt })}
                    className={`rounded border px-3 py-1 text-xs ${
                      editing.match_type === mt
                        ? "border-wa-greenDark bg-wa-bubbleOut"
                        : "border-wa-border bg-white"
                    }`}
                  >
                    {mt === "contains"
                      ? "contains"
                      : mt === "exact"
                        ? "is exactly"
                        : "starts with"}
                  </button>
                ))}
              </div>
              <input
                value={editing.trigger_keyword}
                onChange={(e) => setEditing({ ...editing, trigger_keyword: e.target.value })}
                placeholder="e.g. hours, price, hi"
                className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
              />
              <div className="mb-3 text-[11px] text-wa-textMuted">
                Matching is case-insensitive. "hours" matches "HOURS" and "Open hours?".
              </div>

              <label className="mb-1 block text-xs text-wa-textMuted">Reply type</label>
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => setEditing({ ...editing, response_kind: "text" })}
                  className={`flex-1 rounded border px-3 py-2 text-xs ${
                    editing.response_kind === "text"
                      ? "border-wa-greenDark bg-wa-bubbleOut"
                      : "border-wa-border bg-white"
                  }`}
                >
                  💬 Text message
                  <div className="text-[10px] text-wa-textMuted">
                    Free-form text (only valid within 24h window — always true for auto-replies)
                  </div>
                </button>
                <button
                  onClick={() => setEditing({ ...editing, response_kind: "template" })}
                  className={`flex-1 rounded border px-3 py-2 text-xs ${
                    editing.response_kind === "template"
                      ? "border-wa-greenDark bg-wa-bubbleOut"
                      : "border-wa-border bg-white"
                  }`}
                >
                  📄 Template
                  <div className="text-[10px] text-wa-textMuted">
                    Approved template (supports images, buttons)
                  </div>
                </button>
              </div>

              {editing.response_kind === "text" && (
                <>
                  <label className="mb-1 block text-xs text-wa-textMuted">Reply message</label>
                  <textarea
                    value={editing.response_text}
                    onChange={(e) => setEditing({ ...editing, response_text: e.target.value })}
                    rows={5}
                    placeholder="We're open Mon–Sat, 10am–7pm. How can we help?"
                    className="mb-3 w-full resize-none rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                  />
                </>
              )}

              {editing.response_kind === "template" && (
                <>
                  <label className="mb-1 block text-xs text-wa-textMuted">Template</label>
                  <select
                    value={
                      editing.template_name
                        ? `${editing.template_name}::${editing.template_language}`
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const [name, lang] = v.split("::");
                      setTemplateForRule(name, lang);
                    }}
                    className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
                  >
                    <option value="">— pick a template —</option>
                    {templates.map((t) => (
                      <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>

                  {editing.variable_mapping.length > 0 && (
                    <div className="mb-3 space-y-1">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                        Fill template variables
                      </div>
                      {editing.variable_mapping.map((m, vi) => (
                        <div key={vi} className="flex items-center gap-2">
                          <div className="w-12 text-xs text-wa-textMuted">{`{{${vi + 1}}}`}</div>
                          <select
                            value={m.source === "custom_field" ? `custom:${m.value}` : m.source}
                            onChange={(e) => {
                              const v = e.target.value;
                              const next = [...editing.variable_mapping];
                              if (v === "static") next[vi] = { source: "static", value: "" };
                              else if (v === "name") next[vi] = { source: "name", value: "" };
                              else if (v === "wa_id") next[vi] = { source: "wa_id", value: "" };
                              setEditing({ ...editing, variable_mapping: next });
                            }}
                            className="w-32 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                          >
                            <option value="static">Static text</option>
                            <option value="name">Contact name</option>
                            <option value="wa_id">Contact phone</option>
                          </select>
                          {m.source === "static" ? (
                            <input
                              value={m.value}
                              onChange={(e) => {
                                const next = [...editing.variable_mapping];
                                next[vi] = { source: "static", value: e.target.value };
                                setEditing({ ...editing, variable_mapping: next });
                              }}
                              placeholder="Value"
                              className="flex-1 rounded border border-wa-border px-2 py-1 text-xs outline-none"
                            />
                          ) : (
                            <div className="flex-1 rounded bg-white px-2 py-1 text-xs text-wa-textMuted">
                              {m.source === "name" ? "→ contact name" : "→ contact phone"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <label className="mb-1 block text-xs text-wa-textMuted">
                Cooldown (minutes before this rule can fire again for the same contact)
              </label>
              <input
                type="number"
                min={0}
                value={editing.cooldown_minutes}
                onChange={(e) =>
                  setEditing({ ...editing, cooldown_minutes: Number(e.target.value) || 0 })
                }
                className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
              />

              <label className="mb-1 block text-xs text-wa-textMuted">
                Priority (higher fires first when multiple rules match)
              </label>
              <input
                type="number"
                value={editing.priority}
                onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) || 0 })}
                className="mb-3 w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
              />

              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.hours_enabled}
                  onChange={(e) =>
                    setEditing({ ...editing, hours_enabled: e.target.checked })
                  }
                />
                Only fire during working hours
              </label>
              {editing.hours_enabled && (
                <div className="mb-3 rounded border border-wa-border bg-white p-3 text-xs">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-20 text-wa-textMuted">Timezone:</span>
                    <input
                      value={editing.hours.tz}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          hours: { ...editing.hours, tz: e.target.value },
                        })
                      }
                      placeholder="Asia/Kolkata"
                      className="flex-1 rounded border border-wa-border px-2 py-1"
                    />
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-20 text-wa-textMuted">From:</span>
                    <input
                      type="time"
                      value={editing.hours.start}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          hours: { ...editing.hours, start: e.target.value },
                        })
                      }
                      className="rounded border border-wa-border px-2 py-1"
                    />
                    <span className="text-wa-textMuted">to</span>
                    <input
                      type="time"
                      value={editing.hours.end}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          hours: { ...editing.hours, end: e.target.value },
                        })
                      }
                      className="rounded border border-wa-border px-2 py-1"
                    />
                  </div>
                  <div className="mb-1 text-wa-textMuted">Days:</div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { n: 1, l: "Mon" },
                      { n: 2, l: "Tue" },
                      { n: 3, l: "Wed" },
                      { n: 4, l: "Thu" },
                      { n: 5, l: "Fri" },
                      { n: 6, l: "Sat" },
                      { n: 0, l: "Sun" },
                    ].map((d) => {
                      const on = editing.hours.days.includes(d.n);
                      return (
                        <button
                          key={d.n}
                          type="button"
                          onClick={() => {
                            const next = on
                              ? editing.hours.days.filter((x) => x !== d.n)
                              : [...editing.hours.days, d.n].sort();
                            setEditing({
                              ...editing,
                              hours: { ...editing.hours, days: next },
                            });
                          }}
                          className={`rounded px-2 py-1 text-[10px] ${
                            on
                              ? "bg-wa-greenDark text-white"
                              : "border border-wa-border bg-white"
                          }`}
                        >
                          {d.l}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-wa-textMuted">
                    Outside this window the rule won't fire — useful for "we'll get back to
                    you tomorrow" style replies only during office hours.
                  </div>
                </div>
              )}

              <label className="mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Active
              </label>

              {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

              <div className="flex items-center justify-between border-t border-wa-border pt-3">
                <div>
                  {editing.id && (
                    <button
                      onClick={() => remove(editing.id!)}
                      className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
