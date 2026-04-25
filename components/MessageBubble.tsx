"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Template } from "@/lib/types";

export type MessageRow = {
  id: number;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  template_name: string | null;
  status: string;
  error: string | null;
  created_at: string;
  media_id?: string | null;
  media_mime?: string | null;
  media_url?: string | null;
  media_filename?: string | null;
};

function StatusTicks({ status }: { status: string }) {
  if (status === "failed")
    return <span className="text-[10px] font-medium text-red-600">failed</span>;
  const color = status === "read" ? "text-sky-500" : "text-wa-textMuted";
  const doubleTick = status === "delivered" || status === "read";
  return (
    <span className={clsx("ml-1 inline-flex items-center", color)}>
      {doubleTick ? (
        <svg width="16" height="10" viewBox="0 0 16 11" fill="currentColor">
          <path d="M11.071.653a.5.5 0 0 1 .02.707l-6.5 6.75a.5.5 0 0 1-.72 0L.93 4.818a.5.5 0 1 1 .714-.7l2.589 2.633L10.364.673a.5.5 0 0 1 .707-.02Z" />
          <path d="M15.071.653a.5.5 0 0 1 .02.707l-6.5 6.75a.5.5 0 0 1-.72 0l-.5-.51a.5.5 0 0 1 .714-.7l.146.149L14.364.673a.5.5 0 0 1 .707-.02Z" />
        </svg>
      ) : (
        <svg width="12" height="10" viewBox="0 0 16 11" fill="currentColor">
          <path d="M11.071.653a.5.5 0 0 1 .02.707l-6.5 6.75a.5.5 0 0 1-.72 0L.93 4.818a.5.5 0 1 1 .714-.7l2.589 2.633L10.364.673a.5.5 0 0 1 .707-.02Z" />
        </svg>
      )}
    </span>
  );
}

function MediaAttachment({ msg }: { msg: MessageRow }) {
  const hasMedia = Boolean(msg.media_id || msg.media_url);
  if (!hasMedia) return null;
  const src = `/api/media/${msg.id}`;
  const mime = msg.media_mime || "";
  const t = msg.type;

  if (t === "image" || mime.startsWith("image/")) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="mb-1 block">
        <img
          src={src}
          alt={msg.body || "image"}
          className="max-h-80 w-full max-w-sm rounded-md object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  if (t === "video" || mime.startsWith("video/")) {
    return (
      <video
        src={src}
        controls
        className="mb-1 max-h-80 w-full max-w-sm rounded-md"
        preload="metadata"
      />
    );
  }
  if (t === "audio" || mime.startsWith("audio/")) {
    return <audio src={src} controls className="mb-1 w-full max-w-sm" preload="metadata" />;
  }
  if (t === "sticker") {
    return <img src={src} alt="sticker" className="mb-1 h-32 w-32 object-contain" loading="lazy" />;
  }
  // Document / fallback
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded border border-wa-border bg-white/60 px-2 py-2 text-xs hover:bg-white"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-wa-greenDark">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-wa-text">
          {msg.media_filename || "Download"}
        </div>
        <div className="text-[10px] text-wa-textMuted">{mime || "file"}</div>
      </div>
    </a>
  );
}

export function MessageBubble({ msg, onAnnotated }: { msg: MessageRow; onAnnotated?: () => void }) {
  const out = msg.direction === "outbound";
  const isExternalGhost = msg.type === "external";
  const createdIso = msg.created_at.includes("T")
    ? msg.created_at
    : msg.created_at.replace(" ", "T") + "Z";
  const time = new Date(createdIso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className={clsx("flex w-full", out ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "relative max-w-[75%] rounded-lg px-3 py-2 shadow-sm",
          out ? "bg-wa-bubbleOut" : "bg-wa-bubbleIn",
          out ? "rounded-tr-none" : "rounded-tl-none",
          isExternalGhost && "ring-1 ring-amber-300",
        )}
      >
        {msg.template_name && (
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
            Template · {msg.template_name}
          </div>
        )}
        {isExternalGhost && (
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
            External send
          </div>
        )}
        <MediaAttachment msg={msg} />
        {msg.body ? (
          <div
            className={clsx(
              "whitespace-pre-wrap text-sm",
              isExternalGhost ? "italic text-wa-textMuted" : "text-wa-text",
            )}
          >
            {msg.body}
          </div>
        ) : null}
        {msg.error && <div className="mt-1 text-[11px] text-red-600">{msg.error}</div>}
        {isExternalGhost && (
          <ExternalGhostAnnotator messageId={msg.id} onAnnotated={onAnnotated} />
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-wa-textMuted">
          <span>{time}</span>
          {out && <StatusTicks status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

function ExternalGhostAnnotator({
  messageId,
  onAnnotated,
}: {
  messageId: number;
  onAnnotated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || templates) return;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setTemplates(j.templates || []))
      .catch(() => setTemplates([]));
  }, [open, templates]);

  async function save() {
    if (!picked) return;
    const [name, lang] = picked.split("::");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: name, language: lang }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Failed to annotate");
        return;
      }
      setOpen(false);
      onAnnotated?.();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 text-[10px] text-amber-700 underline hover:text-amber-900"
      >
        Mark which template was sent
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
      <div className="mb-1 text-[10px] text-amber-900">
        Pick the approved template that was sent. We&apos;ll fill in the body for the chat history.
      </div>
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        className="mb-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
      >
        <option value="">
          {templates === null ? "Loading…" : "— Select template —"}
        </option>
        {(templates || []).map((t) => (
          <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
            {t.name} ({t.language}) · {t.category}
          </option>
        ))}
      </select>
      {err && <div className="mb-1 text-[10px] text-red-700">{err}</div>}
      <div className="flex gap-1">
        <button
          onClick={save}
          disabled={!picked || busy}
          className="rounded bg-wa-greenDark px-2 py-0.5 text-[10px] font-medium text-white hover:bg-wa-green disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded px-2 py-0.5 text-[10px] text-wa-textMuted hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
