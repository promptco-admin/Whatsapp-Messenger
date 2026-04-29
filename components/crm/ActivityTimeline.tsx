"use client";

import { useEffect, useState } from "react";

type ActivityKind = "message_in" | "message_out" | "note" | "audit";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  contact_id: number;
  contact_name: string | null;
  title: string;
  body: string | null;
  user_name: string | null;
  meta: Record<string, any> | null;
};

export function ActivityTimeline({
  endpoint,
  showContactColumn = false,
}: {
  /** Where to GET the timeline from. e.g. /api/crm/deals/123/activity */
  endpoint: string;
  /** When this is a multi-contact feed (company), show which contact each item is about. */
  showContactColumn?: boolean;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "messages" | "notes" | "events">("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setItems(j.activity || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const visible = items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "messages") return i.kind === "message_in" || i.kind === "message_out";
    if (filter === "notes") return i.kind === "note";
    if (filter === "events") return i.kind === "audit";
    return true;
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterBtn>
        <FilterBtn active={filter === "messages"} onClick={() => setFilter("messages")}>
          Messages
        </FilterBtn>
        <FilterBtn active={filter === "notes"} onClick={() => setFilter("notes")}>
          Notes
        </FilterBtn>
        <FilterBtn active={filter === "events"} onClick={() => setFilter("events")}>
          Events
        </FilterBtn>
        <span className="ml-2 text-[11px] text-slate-400">
          {visible.length} item{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading timeline…</div>
      ) : visible.length === 0 ? (
        <div className="rounded border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
          No activity yet.
        </div>
      ) : (
        <div className="relative">
          <div className="absolute bottom-1 left-3 top-1 w-px bg-slate-200" />
          {visible.map((it) => (
            <TimelineRow key={it.id} item={it} showContact={showContactColumn} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function TimelineRow({ item, showContact }: { item: ActivityItem; showContact: boolean }) {
  const dot = dotFor(item.kind);
  return (
    <div className="relative mb-3 flex gap-3 pl-1">
      <div className="z-10 mt-1 flex-none">
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium text-white shadow-sm"
          style={{ backgroundColor: dot.bg }}
          title={kindLabel(item.kind)}
        >
          {dot.icon}
        </div>
      </div>
      <div className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="font-medium text-slate-800">{item.title}</span>
          {showContact && item.contact_name && (
            <span className="text-[11px] text-slate-500">· {item.contact_name}</span>
          )}
          {item.user_name && (
            <span className="text-[11px] text-slate-500">· {item.user_name}</span>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{formatRelative(item.at)}</span>
        </div>
        {item.body && (
          <div className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600">
            {truncate(item.body, 400)}
          </div>
        )}
      </div>
    </div>
  );
}

function dotFor(kind: ActivityKind): { bg: string; icon: string } {
  switch (kind) {
    case "message_in":
      return { bg: "#10b981", icon: "↓" };
    case "message_out":
      return { bg: "#3b82f6", icon: "↑" };
    case "note":
      return { bg: "#f59e0b", icon: "✎" };
    case "audit":
      return { bg: "#94a3b8", icon: "•" };
  }
}

function kindLabel(kind: ActivityKind): string {
  switch (kind) {
    case "message_in":
      return "Inbound message";
    case "message_out":
      return "Outbound message";
    case "note":
      return "Internal note";
    case "audit":
      return "Event";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatRelative(iso: string): string {
  // SQLite default timestamps are space-separated and naive UTC; ISO strings
  // from JS are Z-suffixed. Normalise both before parsing.
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const t = new Date(safe).getTime();
  if (isNaN(t)) return iso;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(safe).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
