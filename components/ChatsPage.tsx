"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatList } from "./ChatList";
import { ChatView } from "./ChatView";
import { NewChatDialog } from "./NewChatDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Conversation = {
  id: number;
  wa_id: string;
  name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  unread_count: number;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  source_json: string | null;
};

export type ChatFilter = "all" | "mine" | "unassigned";

export function ChatsPage() {
  const { user } = useCurrentUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>("all");

  const refresh = useCallback(async () => {
    const qs = filter === "all" ? "" : `?filter=${filter}`;
    const res = await fetch(`/api/conversations${qs}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setConversations(j.conversations || []);
  }, [filter]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // On mobile (< md / 768px) we show ONE pane at a time:
  // - no chat selected → list takes the full screen
  // - chat selected → chat view takes the full screen, list is hidden
  // On desktop we keep the classic two-pane layout with a fixed-width sidebar.
  const showListOnMobile = selectedId === null;

  return (
    <div className="flex h-full flex-row">
      <div
        className={`${
          showListOnMobile ? "flex" : "hidden"
        } h-full w-full flex-col md:flex md:w-[380px] md:flex-none md:border-r md:border-wa-border`}
      >
        <ChatList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setShowNew(true)}
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          currentUser={user}
        />
      </div>
      <div
        className={`${
          showListOnMobile ? "hidden" : "flex"
        } h-full w-full flex-1 md:flex`}
      >
        <ChatView
          contactId={selectedId}
          onMessageSent={refresh}
          currentUser={user}
          onBack={() => setSelectedId(null)}
        />
      </div>

      <NewChatDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => {
          refresh();
          setSelectedId(id);
        }}
      />
    </div>
  );
}
