"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import { formatPhonePretty } from "@/lib/display";
import { DealEditDialog } from "./DealEditDialog";
import { DealDetailDialog } from "./DealDetailDialog";

type Stage = { id: number; name: string; color: string; is_won: number; is_lost: number };

type Deal = {
  id: number;
  title: string;
  contact_id: number;
  contact_name: string | null;
  contact_wa_profile_name: string | null;
  contact_wa_id: string;
  owner_user_id: number | null;
  owner_name: string | null;
  stage_id: number | null;
  stage_name: string | null;
  stage_color: string | null;
  value_paise: number;
  expected_close_date: string | null;
  status: "open" | "won" | "lost";
  updated_at: string;
};

export function DealsListPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "won" | "lost">("all");
  const [search, setSearch] = useState("");
  const [openDealId, setOpenDealId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const [s, d] = await Promise.all([
      fetch("/api/crm/deal-stages").then((r) => r.json()),
      fetch(`/api/crm/deals?status=${statusFilter}`).then((r) => r.json()),
    ]);
    setStages(s.stages || []);
    setDeals(d.deals || []);
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d) => {
      const hay = `${d.title} ${d.contact_name || ""} ${d.contact_wa_profile_name || ""} ${d.contact_wa_id} ${d.owner_name || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [deals, search]);

  const totals = useMemo(() => {
    const total = filtered.reduce((acc, d) => acc + d.value_paise, 0);
    const open = filtered.filter((d) => d.status === "open").reduce((a, d) => a + d.value_paise, 0);
    const won = filtered.filter((d) => d.status === "won").reduce((a, d) => a + d.value_paise, 0);
    return { total, open, won, count: filtered.length };
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals…"
          className="w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder-slate-400"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <div className="text-xs text-slate-500">
          {totals.count} deals · open {formatPaiseCompact(totals.open)} · won{" "}
          {formatPaiseCompact(totals.won)}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New deal
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">Deal</th>
              <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">Contact</th>
              <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">Stage</th>
              <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">Value</th>
              <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">Owner</th>
              <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">Close</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No deals match your filters.
                </td>
              </tr>
            )}
            {filtered.map((d) => (
              <tr
                key={d.id}
                onClick={() => setOpenDealId(d.id)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="border-b border-slate-100 px-4 py-2 font-medium text-slate-800">
                  {d.title}
                </td>
                <td className="border-b border-slate-100 px-4 py-2 text-slate-600">
                  {d.contact_name ||
                    d.contact_wa_profile_name ||
                    formatPhonePretty(d.contact_wa_id)}
                </td>
                <td className="border-b border-slate-100 px-4 py-2">
                  {d.stage_name && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: d.stage_color || "#94a3b8" }}
                    >
                      {d.stage_name}
                    </span>
                  )}
                </td>
                <td className="border-b border-slate-100 px-4 py-2 text-right font-medium text-indigo-700">
                  {formatPaise(d.value_paise)}
                </td>
                <td className="border-b border-slate-100 px-4 py-2 text-slate-600">
                  {d.owner_name || "—"}
                </td>
                <td className="border-b border-slate-100 px-4 py-2 text-slate-600">
                  {d.expected_close_date || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
