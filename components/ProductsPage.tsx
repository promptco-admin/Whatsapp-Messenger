"use client";

import { useEffect, useState } from "react";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";

type Product = {
  id: number;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price_paise: number;
  currency: string;
  active: number;
  order_index: number;
  meta_retailer_id: string | null;
  meta_catalog_synced_at: string | null;
};

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/products?all=1", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setProducts(j.products || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing) return;
    const url = editing.id ? `/api/products/${editing.id}` : "/api/products";
    const method = editing.id ? "PATCH" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editing,
        price_paise: editing.price_paise || 0,
      }),
    });
    if (r.ok) {
      setEditing(null);
      load();
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(p: Product) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: p.active ? 0 : 1 }),
    });
    load();
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-white">
      <div className="flex items-center justify-between border-b border-wa-border bg-wa-panel px-6 py-4">
        <div>
          <div className="text-lg font-medium">Product catalog</div>
          <div className="text-xs text-wa-textMuted">
            Maintain your products + services. Send the list to a customer with the
            &ldquo;Catalog&rdquo; button inside any chat.
          </div>
        </div>
        <button
          onClick={() =>
            setEditing({
              name: "",
              price_paise: 0,
              currency: "INR",
              active: 1,
              category: "",
              order_index: products.length,
            })
          }
          className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + Add product
        </button>
      </div>

      <div className="mx-auto w-full max-w-5xl p-6">
        {loading && <div className="p-4 text-xs text-wa-textMuted">Loading…</div>}
        {!loading && products.length === 0 && (
          <div className="rounded border border-dashed border-wa-border p-8 text-center text-sm text-wa-textMuted">
            No products yet. Add your first to start sending catalogs.
          </div>
        )}
        <div className="space-y-3">
          {products.map((p) => (
            <div
              key={p.id}
              className={`flex items-start gap-4 rounded border border-wa-border p-3 ${
                p.active ? "" : "opacity-60"
              }`}
            >
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt=""
                  className="h-20 w-20 flex-none rounded object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 flex-none items-center justify-center rounded bg-wa-panel text-3xl">
                  📦
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium">{p.name}</div>
                  {p.category && (
                    <span className="rounded bg-wa-panel px-1.5 py-0.5 text-[10px] text-wa-textMuted">
                      {p.category}
                    </span>
                  )}
                  {!p.active && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                      hidden
                    </span>
                  )}
                </div>
                <div className="text-xs text-wa-textMuted">
                  {p.sku && <span className="mr-2">SKU: {p.sku}</span>}
                  <b>{formatPaise(p.price_paise)}</b>
                </div>
                {p.description && (
                  <div className="mt-1 line-clamp-2 text-xs text-wa-text">{p.description}</div>
                )}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <button
                  onClick={() => setEditing(p)}
                  className="rounded border border-wa-border bg-white px-2 py-1 hover:bg-wa-panel"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(p)}
                  className="rounded border border-wa-border bg-white px-2 py-1 hover:bg-wa-panel"
                >
                  {p.active ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="rounded border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <ProductEditor
          value={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProductEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: Partial<Product>;
  onChange: (next: Partial<Product>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [rupeeText, setRupeeText] = useState(
    value.price_paise ? (value.price_paise / 100).toFixed(2) : "",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-base font-medium">
          {value.id ? "Edit product" : "New product"}
        </div>
        <div className="space-y-3">
          <input
            value={value.name || ""}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Name (e.g. Prompt RO Purifier — 10L)"
            className="w-full rounded border border-wa-border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={value.sku || ""}
              onChange={(e) => onChange({ ...value, sku: e.target.value })}
              placeholder="SKU (optional)"
              className="flex-1 rounded border border-wa-border px-3 py-2 text-sm"
            />
            <input
              value={value.category || ""}
              onChange={(e) => onChange({ ...value, category: e.target.value })}
              placeholder="Category (e.g. water-purifier)"
              className="flex-1 rounded border border-wa-border px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={value.description || ""}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            placeholder="Short description (1-2 lines)"
            rows={2}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm"
          />
          <input
            value={value.image_url || ""}
            onChange={(e) => onChange({ ...value, image_url: e.target.value })}
            placeholder="Image URL (optional)"
            className="w-full rounded border border-wa-border px-3 py-2 text-sm"
          />
          <div>
            <label className="mb-1 block text-[10px] uppercase text-wa-textMuted">Price (₹)</label>
            <input
              value={rupeeText}
              onChange={(e) => {
                setRupeeText(e.target.value);
                onChange({ ...value, price_paise: parseRupeesToPaise(e.target.value) });
              }}
              placeholder="0.00"
              className="w-full rounded border border-wa-border px-3 py-2 text-sm"
            />
          </div>
          <input
            value={value.meta_retailer_id || ""}
            onChange={(e) => onChange({ ...value, meta_retailer_id: e.target.value })}
            placeholder="Meta retailer_id (for future Catalog sync — optional)"
            className="w-full rounded border border-wa-border px-3 py-2 text-xs text-wa-textMuted"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded px-3 py-1.5 text-xs text-wa-textMuted hover:bg-wa-panel">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!value.name?.trim()}
            className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
