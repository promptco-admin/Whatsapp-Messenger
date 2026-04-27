"use client";

import { useState } from "react";
import { parseCSV } from "@/lib/csv";

export function ImportContactsDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  if (!open) return null;

  async function handleFile(f: File) {
    setError(null);
    setFileName(f.name);
    const text = await f.text();
    try {
      const parsed = parseCSV(text);
      setRows(parsed);
    } catch (e: any) {
      setError(e?.message || "Failed to parse CSV");
      setRows([]);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, tag: tag.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Import failed");
        return;
      }
      alert(
        `Import complete.\nCreated: ${j.created}\nUpdated: ${j.updated}\nSkipped: ${j.skipped}${
          j.errors?.length ? `\nErrors: ${j.errors.length}` : ""
        }`,
      );
      onImported();
      onClose();
      setRows([]);
      setTag("");
      setFileName(null);
    } finally {
      setBusy(false);
    }
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-2xl flex-col bg-white p-4 shadow-xl sm:my-auto sm:max-h-[92vh] sm:overflow-y-auto sm:rounded-lg sm:p-6">
        <div className="mb-2 text-lg font-medium">Import contacts from CSV</div>
        <div className="mb-4 text-xs text-wa-textMuted">
          Your CSV should have a <b>phone</b> column (with country code, digits only). Optional
          columns: <b>name</b>, <b>tags</b> (comma-separated), and any extras become custom fields.
          Example headers:{" "}
          <code className="rounded bg-wa-panel px-1">phone,name,tags,city,plan</code>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">Choose CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="block w-full text-sm"
          />
          {fileName && (
            <div className="mt-1 text-[11px] text-wa-textMuted">
              {fileName} — {rows.length} rows parsed
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-wa-textMuted">
            Optional: apply this tag to every imported contact
          </label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. solar_customers"
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wa-green/30"
          />
        </div>

        {rows.length > 0 && (
          <div className="mb-3 max-h-56 overflow-auto rounded border border-wa-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-wa-panel">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="border-b border-wa-border px-2 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    {headers.map((h) => (
                      <td key={h} className="border-b border-wa-border px-2 py-1">
                        {r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <div className="bg-wa-panel p-2 text-center text-[11px] text-wa-textMuted">
                …showing first 10 of {rows.length}
              </div>
            )}
          </div>
        )}

        {error && <div className="mb-2 text-xs text-red-600">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-wa-textMuted hover:bg-wa-panel"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || rows.length === 0}
            className="rounded bg-wa-greenDark px-4 py-1.5 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${rows.length} contacts`}
          </button>
        </div>
      </div>
    </div>
  );
}
