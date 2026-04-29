"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPaise, formatPaiseToRupees } from "@/lib/money";
import { formatPhonePretty } from "@/lib/display";
import { DealEditDialog } from "./DealEditDialog";
import { ActivityTimeline } from "./ActivityTimeline";

type Stage = { id: number; name: string; color: string; is_won: number; is_lost: number };

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
  notes: string | null;
  status: "open" | "won" | "lost";
  won_lost_reason: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

type LineItem = {
  id: number;
  name: string;
  description: string | null;
  kind: "product" | "service";
  quantity: number;
  unit_price_paise: number;
};

export function DealDetailDialog({
  dealId,
  stages,
  onClose,
  onChanged,
}: {
  dealId: number;
  stages: Stage[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addLine, setAddLine] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("");
  const [newKind, setNewKind] = useState<"product" | "service">("product");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/deals/${dealId}`);
      const j = await r.json();
      setDeal(j.deal);
      setLineItems(j.line_items || []);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function changeStage(newStageId: number) {
    if (!deal) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Failed to change stage");
        return;
      }
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addLineItem() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/deals/${dealId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          quantity: Number(newQty) || 1,
          unit_price: newPrice,
          kind: newKind,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Add failed");
        return;
      }
      setNewName("");
      setNewDesc("");
      setNewQty("1");
      setNewPrice("");
      setNewKind("product");
      setAddLine(false);
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeLineItem(id: number) {
    if (!confirm("Remove this line item?")) return;
    setBusy(true);
    try {
      await fetch(`/api/crm/deals/${dealId}/line-items/${id}`, { method: "DELETE" });
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function deleteDeal() {
    if (!confirm(`Delete deal "${deal?.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/deals/${dealId}`, { method: "DELETE" });
      if (!r.ok) {
        alert("Delete failed");
        return;
      }
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (editing && deal) {
    return (
      <DealEditDialog
        mode="edit"
        initial={{
          id: deal.id,
          title: deal.title,
          contact_id: deal.contact_id,
          owner_user_id: deal.owner_user_id,
          stage_id: deal.stage_id,
          value: formatPaiseToRupees(deal.value_paise),
          expected_close_date: deal.expected_close_date,
          notes: deal.notes,
        }}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          refresh();
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-2xl flex-col bg-white shadow-xl sm:my-auto sm:max-h-[92vh] sm:overflow-y-auto sm:rounded-lg">
        {loading || !deal ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-medium uppercase text-white"
                    style={{ backgroundColor: deal.stage_color || "#94a3b8" }}
                  >
                    {deal.stage_name || "no stage"}
                  </span>
                  {deal.status === "won" && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase text-green-700">
                      Won
                    </span>
                  )}
                  {deal.status === "lost" && (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                      Lost
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{deal.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>
                    {deal.contact_name ||
                      deal.contact_wa_profile_name ||
                      formatPhonePretty(deal.contact_wa_id)}
                  </span>
                  <span>·</span>
                  <span>{formatPhonePretty(deal.contact_wa_id)}</span>
                  {deal.company_name && (
                    <>
                      <span>·</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        🏢 {deal.company_name}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  Edit
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-b border-slate-200 px-6 py-4 text-sm sm:grid-cols-4">
              <Stat label="Value">{formatPaise(deal.value_paise)}</Stat>
              <Stat label="Owner">{deal.owner_name || "—"}</Stat>
              <Stat label="Close date">{deal.expected_close_date || "—"}</Stat>
              <Stat label="Created">
                {new Date(deal.created_at).toLocaleDateString("en-IN")}
              </Stat>
            </div>

            <div className="border-b border-slate-200 px-6 py-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Move to stage
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((s) => (
                  <button
                    key={s.id}
                    disabled={busy || s.id === deal.stage_id}
                    onClick={() => changeStage(s.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-white transition disabled:opacity-50"
                    style={{
                      backgroundColor: s.id === deal.stage_id ? s.color : `${s.color}99`,
                      outline: s.id === deal.stage_id ? "2px solid #1e293b" : undefined,
                      outlineOffset: 1,
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-slate-200 px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Line items
                </div>
                {!addLine && (
                  <button
                    onClick={() => setAddLine(true)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    + Add item
                  </button>
                )}
              </div>
              {lineItems.length === 0 && !addLine && (
                <div className="rounded border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                  No line items yet. Add products or services to break down this deal.
                </div>
              )}
              {lineItems.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="py-1 text-left font-medium">Item</th>
                        <th className="py-1 text-right font-medium">Qty</th>
                        <th className="py-1 text-right font-medium">Unit ₹</th>
                        <th className="py-1 text-right font-medium">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li) => (
                        <tr key={li.id} className="border-b border-slate-100">
                          <td className="py-1.5">
                            <div className="font-medium text-slate-800">{li.name}</div>
                            {li.description && (
                              <div className="text-[11px] text-slate-500">{li.description}</div>
                            )}
                            <span className="mt-0.5 inline-block rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">
                              {li.kind}
                            </span>
                          </td>
                          <td className="py-1.5 text-right">{li.quantity}</td>
                          <td className="py-1.5 text-right">{formatPaise(li.unit_price_paise)}</td>
                          <td className="py-1.5 text-right font-medium">
                            {formatPaise(Math.round(li.quantity * li.unit_price_paise))}
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <button
                              onClick={() => removeLineItem(li.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {addLine && (
                <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Item name"
                      className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-3"
                    />
                    <select
                      value={newKind}
                      onChange={(e) => setNewKind(e.target.value as any)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                    </select>
                    <input
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      placeholder="Qty"
                      inputMode="decimal"
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <input
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="Unit ₹"
                      inputMode="decimal"
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setAddLine(false);
                        setNewName("");
                        setNewDesc("");
                        setNewQty("1");
                        setNewPrice("");
                      }}
                      className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addLineItem}
                      disabled={busy}
                      className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            {deal.notes && (
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Notes
                </div>
                <div className="whitespace-pre-wrap text-sm text-slate-700">{deal.notes}</div>
              </div>
            )}

            <div className="border-b border-slate-200 bg-slate-50/40 px-6 py-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Activity
              </div>
              <ActivityTimeline endpoint={`/api/crm/deals/${dealId}/activity`} />
            </div>

            <div className="flex justify-between px-6 py-4">
              <button
                onClick={deleteDeal}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Delete deal
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-800">{children}</div>
    </div>
  );
}
