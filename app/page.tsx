"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChatsPage } from "@/components/ChatsPage";
import { ContactsPage } from "@/components/ContactsPage";
import { BroadcastsPage } from "@/components/BroadcastsPage";
import { SequencesPage } from "@/components/SequencesPage";
import { AutoRepliesPage } from "@/components/AutoRepliesPage";
import { FlowsPage } from "@/components/FlowsPage";
import { FollowupsPage } from "@/components/FollowupsPage";
import { PipelinePage } from "@/components/PipelinePage";
import { AnalyticsPage } from "@/components/AnalyticsPage";
import { SettingsPage } from "@/components/SettingsPage";
import { PromptLogo } from "@/components/PromptLogo";

type Tab =
  | "chats"
  | "contacts"
  | "broadcasts"
  | "sequences"
  | "auto-replies"
  | "flows"
  | "followups"
  | "pipeline"
  | "analytics"
  | "settings";

export default function Home() {
  const [tab, setTab] = useState<Tab>("chats");
  const [followupBadge, setFollowupBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch("/api/followups/summary");
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) {
          setFollowupBadge((j.overdue || 0) + (j.due_today || 0));
        }
      } catch {}
    }
    poll();
    const t = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-wa-panel">
      <nav className="flex w-16 flex-none flex-col items-center gap-2 border-r border-wa-border bg-wa-greenDark py-4 text-white">
        <div className="mb-4" title="Prompt Group">
          <PromptLogo size={36} showText={false} />
        </div>
        <NavButton label="Chats" active={tab === "chats"} onClick={() => setTab("chats")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.5 3 2 6.6 2 11c0 2 1 3.8 2.6 5.1L4 21l5.3-1.4c.9.2 1.8.4 2.7.4 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
          </svg>
        </NavButton>
        <NavButton label="Contacts" active={tab === "contacts"} onClick={() => setTab("contacts")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" />
          </svg>
        </NavButton>
        <NavButton
          label="Follow-ups"
          active={tab === "followups"}
          onClick={() => setTab("followups")}
          badge={followupBadge}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm.5 5h-2v6.4l5 3 1-1.7-4-2.4z" />
          </svg>
        </NavButton>
        <NavButton label="Pipeline" active={tab === "pipeline"} onClick={() => setTab("pipeline")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 4h4v16H3zM10 4h4v10h-4zM17 4h4v6h-4z" />
          </svg>
        </NavButton>
        <NavButton label="Broadcasts" active={tab === "broadcasts"} onClick={() => setTab("broadcasts")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 10v4a2 2 0 0 0 2 2h1l3 4h2V4H9L6 8H5a2 2 0 0 0-2 2zm14.5 2c0-2-1-3.7-2.5-4.7v9.4c1.5-1 2.5-2.7 2.5-4.7zM14 3v2c3.4 1 6 4 6 7s-2.6 6-6 7v2c4.4-1 8-5 8-9s-3.6-8-8-9z" />
          </svg>
        </NavButton>
        <NavButton label="Sequences" active={tab === "sequences"} onClick={() => setTab("sequences")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 5h16v2H4V5zm0 4h10v2H4V9zm0 4h16v2H4v-2zm0 4h10v2H4v-2z" />
          </svg>
        </NavButton>
        <NavButton
          label="Auto-reply"
          active={tab === "auto-replies"}
          onClick={() => setTab("auto-replies")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
        </NavButton>
        <NavButton label="Flows" active={tab === "flows"} onClick={() => setTab("flows")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h6v4H3V3zm12 0h6v4h-6V3zM9 11h6v4H9v-4zM3 17h6v4H3v-4zm12 0h6v4h-6v-4zM6 7v4h5v2h2v-2h5V7h-2v2h-3v-2H8v2H5V7h1z" />
          </svg>
        </NavButton>
        <NavButton
          label="Analytics"
          active={tab === "analytics"}
          onClick={() => setTab("analytics")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 20h3v-8H4v8zm6.5 0h3V4h-3v16zM17 20h3v-12h-3v12z" />
          </svg>
        </NavButton>
        <div className="mt-auto" />
        <NavButton label="Settings" active={tab === "settings"} onClick={() => setTab("settings")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94a7.14 7.14 0 0 0 .05-.94 7.14 7.14 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.43l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.49a.5.5 0 0 0 .12.63L4.86 10.7a7.14 7.14 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96a7 7 0 0 0 1.62.94l.36 2.54a.5.5 0 0 0 .5.43h3.8a.5.5 0 0 0 .5-.43l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
          </svg>
        </NavButton>
      </nav>

      <div className="flex-1 overflow-hidden">
        {tab === "chats" && <ChatsPage />}
        {tab === "contacts" && <ContactsPage />}
        {tab === "followups" && <FollowupsPage />}
        {tab === "pipeline" && <PipelinePage />}
        {tab === "broadcasts" && <BroadcastsPage />}
        {tab === "sequences" && <SequencesPage />}
        {tab === "auto-replies" && <AutoRepliesPage />}
        {tab === "flows" && <FlowsPage />}
        {tab === "analytics" && <AnalyticsPage />}
        {tab === "settings" && <SettingsPage />}
      </div>
    </div>
  );
}

function NavButton({
  label,
  active,
  onClick,
  badge,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "relative flex h-12 w-12 flex-col items-center justify-center rounded-lg transition",
        active ? "bg-white/20" : "hover:bg-white/10",
      )}
    >
      {children}
      <span className="mt-0.5 text-[9px]">{label}</span>
      {badge ? (
        <span className="absolute right-0 top-0 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[9px] font-semibold leading-4 text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}
