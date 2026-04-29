"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPaiseCompact } from "@/lib/money";
import { CompanyEditDialog } from "./CompanyEditDialog";
import { CompanyDetailDialog } from "./CompanyDetailDialog";

type Company = {
  id: number;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  owner_name: string | null;
  contact_count: number;
  open_deal_count: number;
  open_deal_value_paise: number;
};

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/crm/companies").then((r) => r.json());
      setCompanies(j.companies || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const hay = `${c.name} ${c.industry || ""} ${c.website || ""} ${c.owner_name || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [companies, search]);

  const total = filtered.reduce((acc, c) => acc + c.open_deal_value_paise, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder-slate-400"
        />
        <div className="text-xs text-slate-500">
          {filtered.length} {filtered.length === 1 ? "company" : "companies"} · open pipeline{" "}
          {formatPaiseCompact(total)}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New company
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            Loading…
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">
                  Company
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">
                  Industry
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                  Contacts
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                  Open deals
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                  Open pipeline
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-left font-medium">
                  Owner
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    No companies yet. Click "+ New company" to add one.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="border-b border-slate-100 px-4 py-2 font-medium text-slate-800">
                    <div>{c.name}</div>
                    {c.website && (
                      <div className="text-[11px] text-slate-500">{c.website}</div>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-2 text-slate-600">
                    {c.industry || "—"}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-2 text-right text-slate-700">
                    {c.contact_count}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-2 text-right text-slate-700">
                    {c.open_deal_count}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-2 text-right font-medium text-indigo-700">
                    {formatPaiseCompact(c.open_deal_value_paise)}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-2 text-slate-600">
                    {c.owner_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <CompanyEditDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {openId != null && (
        <CompanyDetailDialog
          companyId={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
