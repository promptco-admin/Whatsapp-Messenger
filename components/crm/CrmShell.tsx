"use client";

import clsx from "clsx";
import type { CurrentUser } from "@/lib/useCurrentUser";

type CrmTab = "pipeline" | "deals" | "companies" | "reports" | "stages";

export function CrmShell({
  tab,
  setTab,
  user,
  children,
}: {
  tab: CrmTab;
  setTab: (t: CrmTab) => void;
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-slate-50">
      <header className="flex h-14 flex-none items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm">
        <a
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          title="Back to WhatsApp"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-indigo-600 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </span>
          <span>Prompt CRM</span>
        </a>
        <nav className="flex items-center gap-1">
          <CrmTabBtn active={tab === "pipeline"} onClick={() => setTab("pipeline")}>
            Pipeline
          </CrmTabBtn>
          <CrmTabBtn active={tab === "deals"} onClick={() => setTab("deals")}>
            All Deals
          </CrmTabBtn>
          <CrmTabBtn active={tab === "companies"} onClick={() => setTab("companies")}>
            Companies
          </CrmTabBtn>
          <CrmTabBtn active={tab === "reports"} onClick={() => setTab("reports")}>
            Reports
          </CrmTabBtn>
          <CrmTabBtn active={tab === "stages"} onClick={() => setTab("stages")}>
            Stages
          </CrmTabBtn>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
          <span className="hidden sm:inline">
            Signed in as <b>{user.name}</b>
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
              {user.role}
            </span>
          </span>
          <a
            href="/"
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            ← WhatsApp
          </a>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function CrmTabBtn({
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
      className={clsx(
        "rounded-md px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}
