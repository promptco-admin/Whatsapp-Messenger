"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPaiseCompact, formatPaise } from "@/lib/money";
import { formatPhonePretty } from "@/lib/display";
import { DealEditDialog } from "./DealEditDialog";
import { DealDetailDialog } from "./DealDetailDialog";

type Stage = {
  id: number;
  name: string;
  order_index: number;
  color: string;
  is_won: number;
  is_lost: number;
};

type Deal = {
  id: number;
  title: string;
  contact_id: number;
  contact_name: string | null;
  contact_wa_profile_name: string | null;
  contact_wa_id: string;
  company_id: number | null;
  company_name: string | null;
  owner_user_id: number | null;
  owner_name: string | null;
  stage_id: number | null;
  stage_name: string | null;
  stage_color: string | null;
  value_paise: number;
  expected_close_date: string | null;
  status: "open" | "won" | "lost";
};

export function DealsPipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openDealId, setOpenDealId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverStageId, setHoverStageId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        fetch("/api/crm/deal-stages").then((r) => r.json()),
        fetch("/api/crm/deals?status=all").then((r) => r.json()),
      ]);
      setStages(s.stages || []);
      setDeals(d.deals || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (q) {
        const hay = `${d.title} ${d.contact_name || ""} ${d.contact_wa_profile_name || ""} ${d.contact_wa_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deals, search]);

  const dealsByStage = useMemo(() => {
    const m = new Map<number | null, Deal[]>();
    for (const s of stages) m.set(s.id, []);
    m.set(null, []);
    for (const d of filtered) {
      const arr = m.get(d.stage_id) || [];
      arr.push(d);
      m.set(d.stage_id, arr);
    }
    return m;
  }, [filtered, stages]);

  const onDrop = useCallback(
    async (dealId: number, newStageId: number) => {
      const deal = deals.find((d) => d.id === dealId);
      if (!deal || deal.stage_id === newStageId) return;
      // Optimistic update
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );
      const r = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId }),
      });
      if (!r.ok) {
        // rollback
        setDeals((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, stage_id: deal.stage_id } : d)),
        );
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Failed to move deal");
      } else {
        refresh();
      }
    },
    [deals, refresh],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals or contacts…"
          className="w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value as any)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All owners</option>
          <option value="mine">My deals</option>
        </select>
        <div className="text-xs text-slate-500">
          {filtered.length} of {deals.length} deals
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            + New deal
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          Loading deals…
        </div>
      ) : stages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-500">
          <div>No stages yet.</div>
          <div className="text-xs">Switch to the "Stages" tab to set up your pipeline.</div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-3 px-4 py-4" style={{ minWidth: "max-content" }}>
            {stages.map((s) => {
              const stageDeals = dealsByStage.get(s.id) || [];
              const total = stageDeals.reduce((acc, d) => acc + d.value_paise, 0);
              const isHover = hoverStageId === s.id;
              return (
                <div
                  key={s.id}
                  className="flex h-full w-72 flex-none flex-col rounded-lg bg-white shadow-sm"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverStageId(s.id);
                  }}
                  onDragLeave={() => setHoverStageId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setHoverStageId(null);
                    if (draggingId != null) onDrop(draggingId, s.id);
                  }}
                  style={{
                    boxShadow: isHover ? `inset 0 0 0 2px ${s.color}` : undefined,
                  }}
                >
                  <div
                    className="flex flex-none items-center justify-between rounded-t-lg px-3 py-2 text-xs font-medium text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    <span className="truncate">
                      {s.name}
                      {s.is_won ? " ✓" : s.is_lost ? " ✗" : ""}
                    </span>
                    <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                      {stageDeals.length}
                    </span>
                  </div>
                  <div className="flex-none border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">
                    {formatPaiseCompact(total)} total
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {stageDeals.length === 0 && (
                      <div className="rounded border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
                        Drop a deal here
                      </div>
                    )}
                    {stageDeals.map((d) => (
                      <DealCard
                        key={d.id}
                        deal={d}
                        onOpen={() => setOpenDealId(d.id)}
                        onDragStart={() => setDraggingId(d.id)}
                        onDragEnd={() => setDraggingId(null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Unstaged column for deals with no stage */}
            {(dealsByStage.get(null) || []).length > 0 && (
              <div
                className="flex h-full w-72 flex-none flex-col rounded-lg bg-white shadow-sm"
              >
                <div className="flex-none rounded-t-lg bg-slate-400 px-3 py-2 text-xs font-medium text-white">
                  Unstaged
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {(dealsByStage.get(null) || []).map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      onOpen={() => setOpenDealId(d.id)}
                      onDragStart={() => setDraggingId(d.id)}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {creating && (
        <DealEditDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {openDealId != null && (
        <DealDetailDialog
          dealId={openDealId}
          stages={stages}
          onClose={() => setOpenDealId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function DealCard({
  deal,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  deal: Deal;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const contactDisplay =
    deal.contact_name ||
    deal.contact_wa_profile_name ||
    formatPhonePretty(deal.contact_wa_id);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="mb-2 cursor-pointer rounded-md border border-slate-200 bg-white p-2.5 text-xs shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="line-clamp-2 font-medium text-slate-800">{deal.title}</div>
        <div className="flex-none text-right text-[11px] font-semibold text-indigo-700">
          {formatPaise(deal.value_paise)}
        </div>
      </div>
      <div className="truncate text-[11px] text-slate-500">{contactDisplay}</div>
      {deal.company_name && (
        <div className="mt-0.5 truncate text-[10px] text-slate-400">🏢 {deal.company_name}</div>
      )}
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{deal.owner_name || "Unassigned"}</span>
        {deal.expected_close_date && <span>📅 {deal.expected_close_date}</span>}
      </div>
    </div>
  );
}
