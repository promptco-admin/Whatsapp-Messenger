"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { displayContactName, parseContactSource } from "@/lib/display";
import type { CurrentUser } from "@/lib/useCurrentUser";
import type { ChatFilter } from "./ChatsPage";

type SortKey = "recent" | "unread" | "name_asc";

function tsCL(s: string | null | undefined): number {
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

type Conversation = {
  id: number;
  wa_id: string;
  name: string | null;
  wa_profile_name?: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  unread_count: number;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  source_json: string | null;
};

function initials(s: string) {
  const parts = s.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso.includes("Z") || iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
}

export function ChatList({
  conversations,
  selectedId,
  onSelect,
  onNew,
  search,
  setSearch,
  filter,
  setFilter,
  currentUser,
  loaded = true,
}: {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  search: string;
  setSearch: (s: string) => void;
  filter: ChatFilter;
  setFilter: (f: ChatFilter) => void;
  currentUser: CurrentUser | null;
  /** False until the first /api/conversations response lands. Hides the
   * "No conversations here" empty state during the initial fetch. */
  loaded?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("recent");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = conversations.filter((c) => {
      if (!q) return true;
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.wa_profile_name || "").toLowerCase().includes(q) ||
        c.wa_id.includes(q)
      );
    });
    list = list.slice().sort((a, b) => {
      switch (sort) {
        case "recent":
          return tsCL(b.last_message_at) - tsCL(a.last_message_at);
        case "unread":
          if ((b.unread_count > 0 ? 1 : 0) !== (a.unread_count > 0 ? 1 : 0)) {
            return (b.unread_count > 0 ? 1 : 0) - (a.unread_count > 0 ? 1 : 0);
          }
          if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
          return tsCL(b.last_message_at) - tsCL(a.last_message_at);
        case "name_asc":
          return (a.name || a.wa_profile_name || a.wa_id || "").localeCompare(
            b.name || b.wa_profile_name || b.wa_id || "",
          );
      }
    });
    return list;
  }, [conversations, search, sort]);

  return (
    <div className="flex h-full w-full flex-col border-r border-wa-border bg-white">
      <div className="flex items-center justify-between bg-wa-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-greenDark font-semibold text-white">
            {currentUser ? initials(currentUser.name) : "ME"}
          </div>
          <div>
            <div className="text-sm font-medium text-wa-text">Business Inbox</div>
            {currentUser && (
              <div className="text-[10px] text-wa-textMuted">{currentUser.name}</div>
            )}
          </div>
        </div>
        <button
          onClick={onNew}
          className="rounded-full bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + New chat
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-wa-border bg-white px-3 py-2">
        {(["all", "mine", "unassigned"] as ChatFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "rounded-full px-3 py-1 text-xs",
              filter === f
                ? "bg-wa-greenDark text-white"
                : "bg-wa-panel text-wa-text hover:bg-wa-panelDark",
            )}
          >
            {f === "all" ? "All" : f === "mine" ? "Mine" : "Unassigned"}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto rounded border border-wa-border bg-white px-2 py-1 text-[11px] outline-none"
          title="Sort conversations"
        >
          <option value="recent">Recent first</option>
          <option value="unread">Unread first</option>
          <option value="name_asc">Name A → Z</option>
        </select>
      </div>

      <div className="border-b border-wa-border bg-white px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or start new chat"
          className="w-full rounded-lg bg-wa-panel px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
        />
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {!loaded && conversations.length === 0 && (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded p-2"
              >
                <div className="h-10 w-10 flex-none rounded-full bg-wa-panelDark/40" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-wa-panelDark/40" />
                  <div className="h-3 w-5/6 rounded bg-wa-panelDark/30" />
                </div>
              </div>
            ))}
          </div>
        )}
        {loaded && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-wa-textMuted">
            No conversations here.
          </div>
        )}
        {filtered.map((c) => {
          const display = displayContactName(c, currentUser);
          const preview = c.last_message_preview || "No messages yet";
          const active = selectedId === c.id;
          const source = parseContactSource(c.source_json);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={clsx(
                "flex w-full items-center gap-3 border-b border-wa-border px-4 py-3 text-left hover:bg-wa-panel",
                active && "bg-wa-panel",
              )}
            >
              <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gradient-to-br from-wa-green to-wa-greenDark font-semibold text-white">
                {initials(display)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-1">
                    <div className="truncate text-sm font-medium text-wa-text">{display}</div>
                    {source && (
                      <span
                        className="flex-none text-[10px]"
                        title={`Came from ad: ${source.headline || source.source_id || "ad"}`}
                      >
                        📣
                      </span>
                    )}
                  </div>
                  <div className="ml-2 flex-none text-[11px] text-wa-textMuted">
                    {formatTime(c.last_message_at)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="truncate text-xs text-wa-textMuted">
                    {c.last_message_direction === "outbound" ? "You: " : ""}
                    {preview}
                  </div>
                  {c.unread_count > 0 && (
                    <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-wa-green px-1.5 text-[11px] font-medium text-white">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                {c.assigned_user_name && (
                  <div className="mt-0.5 text-[10px] text-wa-textMuted">
                    → {c.assigned_user_name}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
