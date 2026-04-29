"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import { formatPhonePretty } from "@/lib/display";
import { CompanyEditDialog } from "./CompanyEditDialog";
import { ActivityTimeline } from "./ActivityTimeline";
import { DealDetailDialog } from "./DealDetailDialog";

type Company = {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  industry: string | null;
  notes: string | null;
  owner_user_id: number | null;
  owner_name: string | null;
  contact_count: number;
  open_deal_count: number;
  open_deal_value_paise: number;
  created_at: string;
  updated_at: string;
};

type Contact = {
  id: number;
  wa_id: string;
  name: string | null;
  wa_profile_name: string | null;
  unsubscribed_at: string | null;
};

type Deal = {
  id: number;
  title: string;
  value_paise: number;
  status: "open" | "won" | "lost";
  stage_id: number | null;
  stage_name: string | null;
  stage_color: string | null;
  expected_close_date: string | null;
  contact_id: number;
  contact_name: string | null;
  contact_wa_profile_name: string | null;
  contact_wa_id: string;
  owner_name: string | null;
};

type Stage = { id: number; name: string; color: string; is_won: number; is_lost: number };

type Tab = "overview" | "contacts" | "deals" | "activity";

export function CompanyDetailDialog({
  companyId,
  onClose,
  onChanged,
}: {
  companyId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [openDealId, setOpenDealId] = useState<number | null>(null);
  const [linkingContact, setLinkingContact] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        fetch(`/api/crm/companies/${companyId}`).then((r) => r.json()),
        fetch(`/api/crm/deal-stages`).then((r) => r.json()),
      ]);
      setCompany(d.company);
      setContacts(d.contacts || []);
      setDeals(d.deals || []);
      setStages(s.stages || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function detachContact(contactId: number) {
    if (!confirm("Remove this contact from the company?")) return;
    setBusy(true);
    try {
      await fetch(`/api/crm/companies/${companyId}/contacts?contact_id=${contactId}`, {
        method: "DELETE",
      });
      refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompany() {
    if (!company) return;
    if (
      !confirm(
        `Delete company "${company.name}"? Contacts will be detached but kept. This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/companies/${companyId}`, { method: "DELETE" });
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

  if (editing && company) {
    return (
      <CompanyEditDialog
        mode="edit"
        initial={company}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          refresh();
          onChanged();
        }}
      />
    );
  }

  if (linkingContact) {
    return (
      <ContactPickerDialog
        excludeIds={contacts.map((c) => c.id)}
        onClose={() => setLinkingContact(false)}
        onPick={async (contactId) => {
          setBusy(true);
          try {
            await fetch(`/api/crm/companies/${companyId}/contacts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contact_id: contactId }),
            });
            setLinkingContact(false);
            refresh();
            onChanged();
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-3xl flex-col bg-white shadow-xl sm:my-auto sm:max-h-[92vh] sm:overflow-y-auto sm:rounded-lg">
        {loading || !company ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Company
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{company.name}</h2>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  {company.industry && <span>{company.industry}</span>}
                  {company.website && (
                    <a
                      href={
                        company.website.startsWith("http")
                          ? company.website
                          : `https://${company.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {company.website}
                    </a>
                  )}
                  {company.phone && <span>📞 {company.phone}</span>}
                  {company.owner_name && <span>👤 {company.owner_name}</span>}
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

            <div className="grid grid-cols-3 gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3 text-sm">
              <Stat label="Contacts">{company.contact_count}</Stat>
              <Stat label="Open deals">{company.open_deal_count}</Stat>
              <Stat label="Open pipeline">
                {formatPaiseCompact(company.open_deal_value_paise)}
              </Stat>
            </div>

            <div className="flex flex-none border-b border-slate-200 px-4">
              <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
                Overview
              </TabBtn>
              <TabBtn active={tab === "contacts"} onClick={() => setTab("contacts")}>
                Contacts ({company.contact_count})
              </TabBtn>
              <TabBtn active={tab === "deals"} onClick={() => setTab("deals")}>
                Deals ({deals.length})
              </TabBtn>
              <TabBtn active={tab === "activity"} onClick={() => setTab("activity")}>
                Activity
              </TabBtn>
            </div>

            <div className="min-h-[200px] flex-1 overflow-y-auto px-6 py-4">
              {tab === "overview" && (
                <div className="space-y-4 text-sm">
                  {company.address && (
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Address
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-slate-700">
                        {company.address}
                      </div>
                    </div>
                  )}
                  {company.notes && (
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Notes
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-slate-700">
                        {company.notes}
                      </div>
                    </div>
                  )}
                  {!company.address && !company.notes && (
                    <div className="rounded border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                      No address or notes yet. Click Edit to add details.
                    </div>
                  )}
                </div>
              )}

              {tab === "contacts" && (
                <div>
                  <div className="mb-3 flex justify-end">
                    <button
                      onClick={() => setLinkingContact(true)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      + Link existing contact
                    </button>
                  </div>
                  {contacts.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
                      No contacts linked yet. Click "Link existing contact" to add one.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-slate-500">
                          <tr className="border-b border-slate-100">
                            <th className="py-2 text-left font-medium">Name</th>
                            <th className="py-2 text-left font-medium">Phone</th>
                            <th className="py-2 text-left font-medium">Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {contacts.map((c) => (
                            <tr key={c.id} className="border-b border-slate-100">
                              <td className="py-2 font-medium text-slate-800">
                                {c.name || c.wa_profile_name || formatPhonePretty(c.wa_id)}
                              </td>
                              <td className="py-2 text-slate-600">
                                {formatPhonePretty(c.wa_id)}
                              </td>
                              <td className="py-2">
                                {c.unsubscribed_at ? (
                                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                                    opted-out
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">active</span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                <button
                                  onClick={() => detachContact(c.id)}
                                  disabled={busy}
                                  className="text-[11px] text-slate-500 hover:text-red-600 hover:underline"
                                >
                                  Unlink
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === "deals" && (
                <div>
                  {deals.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
                      No deals yet for any contact in this company.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-slate-500">
                          <tr className="border-b border-slate-100">
                            <th className="py-2 text-left font-medium">Deal</th>
                            <th className="py-2 text-left font-medium">Contact</th>
                            <th className="py-2 text-left font-medium">Stage</th>
                            <th className="py-2 text-right font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deals.map((d) => (
                            <tr
                              key={d.id}
                              onClick={() => setOpenDealId(d.id)}
                              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                            >
                              <td className="py-2 font-medium text-slate-800">{d.title}</td>
                              <td className="py-2 text-slate-600">
                                {d.contact_name ||
                                  d.contact_wa_profile_name ||
                                  formatPhonePretty(d.contact_wa_id)}
                              </td>
                              <td className="py-2">
                                {d.stage_name && (
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                                    style={{ backgroundColor: d.stage_color || "#94a3b8" }}
                                  >
                                    {d.stage_name}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 text-right font-medium text-indigo-700">
                                {formatPaise(d.value_paise)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === "activity" && (
                <ActivityTimeline
                  endpoint={`/api/crm/companies/${companyId}/activity`}
                  showContactColumn
                />
              )}
            </div>

            <div className="flex justify-between border-t border-slate-200 px-6 py-3">
              <button
                onClick={deleteCompany}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Delete company
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

function ContactPickerDialog({
  excludeIds,
  onClose,
  onPick,
}: {
  excludeIds: number[];
  onClose: () => void;
  onPick: (contactId: number) => void;
}) {
  const [contacts, setContacts] = useState<
    Array<{ id: number; wa_id: string; name: string | null; wa_profile_name: string | null }>
  >([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((j) => setContacts(j.contacts || []));
  }, []);

  const exclude = new Set(excludeIds);
  const filtered = contacts.filter((c) => {
    if (exclude.has(c.id)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.wa_profile_name || "").toLowerCase().includes(q) ||
      c.wa_id.includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-md flex-col bg-white shadow-xl sm:my-auto sm:max-h-[92vh] sm:overflow-y-auto sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">Pick a contact to link</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="border-b border-slate-200 p-3">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="max-h-96 flex-1 overflow-y-auto">
          {filtered.slice(0, 100).map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span>{c.name || c.wa_profile_name || formatPhonePretty(c.wa_id)}</span>
              <span className="text-[11px] text-slate-500">{formatPhonePretty(c.wa_id)}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
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
      className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-indigo-500 text-indigo-700"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
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
