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

  return (
    <div className="flex h-full flex-row">
      <div className="w-[380px] flex-none">
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
      <div className="flex flex-1">
        <ChatView contactId={selectedId} onMessageSent={refresh} currentUser={user} />
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
