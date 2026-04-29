"use client";

import { useEffect, useState } from "react";
import { CrmShell } from "@/components/crm/CrmShell";
import { DealsPipelinePage } from "@/components/crm/DealsPipelinePage";
import { DealsListPage } from "@/components/crm/DealsListPage";
import { DealStagesManager } from "@/components/crm/DealStagesManager";
import { CompaniesPage } from "@/components/crm/CompaniesPage";
import { ReportsPage } from "@/components/crm/ReportsPage";
import { useCurrentUser } from "@/lib/useCurrentUser";

type CrmTab = "pipeline" | "deals" | "companies" | "reports" | "stages";

export default function CrmHome() {
  const [tab, setTab] = useState<CrmTab>("pipeline");
  const me = useCurrentUser();

  useEffect(() => {
    if (!me.loading && !me.user) {
      window.location.href = "/login?next=/crm";
    }
  }, [me.loading, me.user]);

  if (me.loading || !me.user) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <CrmShell tab={tab} setTab={setTab} user={me.user}>
      {tab === "pipeline" && <DealsPipelinePage />}
      {tab === "deals" && <DealsListPage />}
      {tab === "companies" && <CompaniesPage />}
      {tab === "reports" && <ReportsPage />}
      {tab === "stages" && <DealStagesManager />}
    </CrmShell>
  );
}
