"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template } from "@/lib/types";

type HeaderMediaType = "image" | "video" | "document";

type HeaderMedia = {
  type: HeaderMediaType;
  media_id?: string;
  link?: string;
  filename?: string;
};

function extractVarCount(tpl: Template): number {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const m = body.text.match(/\{\{(\d+)\}\}/g) || [];
  const nums = new Set(m.map((s) => Number(s.replace(/[^\d]/g, ""))));
  return nums.size;
}

function render(tpl: Template, vars: string[]): string {
  const body = tpl.components.find((c) => c.type === "BODY");
  if (!body?.text) return "";
  return body.text.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] ?? `{{${n}}}`);
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

function sampleHeaderUrl(tpl: Template): string | null {
  const h = tpl.components.find((c) => c.type === "HEADER") as any;
  return h?.example?.header_handle?.[0] || null;
}

type ButtonSpec = {
  index: number;
  sub_type: "flow" | "url" | "quick_reply" | "copy_code";
  text?: string;
};

function getDynamicButtons(tpl: Template): ButtonSpec[] {
  const group = tpl.components.find((c) => c.type === "BUTTONS") as any;
  if (!group?.buttons) return [];
  const out: ButtonSpec[] = [];
  group.buttons.forEach((b: any, i: number) => {
    const t = (b.type || "").toUpperCase();
    if (t === "FLOW") out.push({ index: i, sub_type: "flow", text: b.text });
    else if (t === "URL" && typeof b.url === "string" && b.url.includes("{{")) {
      out.push({ index: i, sub_type: "url", text: b.text });
    } else if (t === "QUICK_REPLY") out.push({ index: i, sub_type: "quick_reply", text: b.text });
    else if (t === "COPY_CODE") out.push({ index: i, sub_type: "copy_code", text: b.text });
  });
  return out;
}

export function TemplatePicker({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (args: {
    template_name: string;
    language: string;
    variables: string[];
    rendered_body: string;
    header?: HeaderMedia;
    buttons?: Array<{
      index: number;
      sub_type: "flow" | "url" | "quick_reply" | "copy_code";
      flow_token?: string;
      payload?: string;
      text?: string;
    }>;
  }) => Promise<void> | void;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [vars, setVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [headerUrl, setHeaderUrl] = useState("");
  const [headerMediaId, setHeaderMediaId] = useState<string | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [headerFilename, setHeaderFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/templates")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed to load templates");
        setTemplates(j.templates || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = useMemo(
    () =>
      templates?.find(
        (t) => t.name === selectedName && (selectedLang ? t.language === selectedLang : true),
      ) || null,
    [templates, selectedName, selectedLang],
  );

  useEffect(() => {
    if (!selected) return;
    const count = extractVarCount(selected);
    setVars(Array.from({ length: count }, () => ""));
    setHeaderUrl("");
    setHeaderMediaId(null);
    setHeaderPreview(null);
    setHeaderFilename(null);
    setUploadError(null);
  }, [selected]);

  if (!open) return null;

  const body = selected?.components.find((c) => c.type === "BODY")?.text || "";
  const preview = selected ? render(selected, vars) : "";
  const hdrFormat = selected ? headerFormat(selected) : null;
  const needsHeaderMedia = hdrFormat === "image" || hdrFormat === "video" || hdrFormat === "document";
  const headerReady = !needsHeaderMedia || !!headerMediaId || headerUrl.trim().length > 0;
  const allFilled = vars.every((v) => v.trim().length > 0) && headerReady;

  async function handleFileUpload(file: File) {
    setUploadError(null);
    setUploading(true);
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
      setUploadError(e.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    try {
      const header: HeaderMedia | undefined = needsHeaderMedia
        ? {
            type: hdrFormat as HeaderMediaType,
            media_id: headerMediaId || undefined,
            link: !headerMediaId && headerUrl.trim() ? headerUrl.trim() : undefined,
            filename: hdrFormat === "document" ? headerFilename || undefined : undefined,
          }
        : undefined;
      const dynamicButtons = getDynamicButtons(selected).map((b) => ({
        index: b.index,
        sub_type: b.sub_type,
        text: b.text,
      }));
      await onSend({
        template_name: selected.name,
        language: selected.language,
        variables: vars,
        rendered_body: render(selected, vars),
        header,
        buttons: dynamicButtons.length ? dynamicButtons : undefined,
      });
      onClose();
      setSelectedName(null);
      setSelectedLang(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[640px] max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex w-64 flex-none flex-col border-r border-wa-border bg-wa-panel">
          <div className="border-b border-wa-border p-3 text-sm font-medium">Approved Templates</div>
          <div className="scroll-thin flex-1 overflow-y-auto">
            {loading && <div className="p-4 text-xs text-wa-textMuted">Loading…</div>}
            {error && <div className="p-4 text-xs text-red-600">{error}</div>}
            {templates?.length === 0 && (
              <div className="p-4 text-xs text-wa-textMuted">No approved templates.</div>
            )}
            {templates?.map((t) => {
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
                  <div className="truncate text-sm font-medium text-wa-text">{t.name}</div>
                  <div className="text-[10px] text-wa-textMuted">
                    {t.language} · {t.category}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-wa-border p-3">
            <div className="text-sm font-medium">
              {selected ? `${selected.name} (${selected.language})` : "Select a template"}
            </div>
            <button onClick={onClose} className="text-xs text-wa-textMuted hover:text-wa-text">
              Close
            </button>
          </div>

          {!selected && (
            <div className="flex-1 p-6 text-sm text-wa-textMuted">
              Pick a template on the left to fill in variables and preview.
            </div>
          )}

          {selected && (
            <div className="flex-1 overflow-y-auto p-4">
              {needsHeaderMedia && (
                <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3">
                  <div className="mb-2 text-xs font-medium text-amber-900">
                    This template needs a header {hdrFormat}. Upload one or paste a public URL.
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
                          if (f) handleFileUpload(f);
                        }}
                      />
                    </label>
                    <span className="text-xs text-wa-textMuted">or</span>
                    <input
                      value={headerUrl}
                      onChange={(e) => {
                        setHeaderUrl(e.target.value);
                        setHeaderMediaId(null);
                        setHeaderPreview(null);
                      }}
                      placeholder={`Public ${hdrFormat} URL (https://…)`}
                      className="flex-1 rounded border border-wa-border px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-wa-green/30"
                    />
                  </div>

                  {headerMediaId && (
                    <div className="text-[11px] text-green-700">
                      ✓ Uploaded{headerFilename ? ` (${headerFilename})` : ""}
                    </div>
                  )}
                  {uploadError && <div className="text-[11px] text-red-600">{uploadError}</div>}
                  {headerPreview && hdrFormat === "image" && (
                    <img src={headerPreview} alt="preview" className="mt-2 max-h-40 rounded border" />
                  )}
                  {!headerMediaId && sampleHeaderUrl(selected) && hdrFormat === "image" && (
                    <div className="mt-2 text-[11px] text-wa-textMuted">
                      Tip: the template's sample image (from Meta) may or may not be reusable. Safer
                      to upload your own.
                    </div>
                  )}
                </div>
              )}

              <div className="mb-4 rounded border border-wa-border bg-wa-panel p-3">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                  Template body
                </div>
                <div className="whitespace-pre-wrap text-sm">{body}</div>
              </div>

              {vars.length > 0 && (
                <div className="mb-4 space-y-2">
                  <div className="text-xs font-medium text-wa-textMuted">Variables</div>
                  {vars.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-16 text-xs text-wa-textMuted">{`{{${i + 1}}}`}</div>
                      <input
                        value={v}
                        onChange={(e) => {
                          const next = [...vars];
                          next[i] = e.target.value;
                          setVars(next);
                        }}
                        className="flex-1 rounded border border-wa-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
                        placeholder={`Value for {{${i + 1}}}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded border border-wa-green/40 bg-wa-bubbleOut p-3">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                  Preview
                </div>
                <div className="whitespace-pre-wrap text-sm">{preview}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-wa-border p-3">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
            >
              Cancel
            </button>
            <button
              disabled={!selected || !allFilled || sending || uploading}
              onClick={handleSend}
              className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
