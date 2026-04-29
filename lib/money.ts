/**
 * Money helpers for the CRM. Everything in the DB is stored as integer paise
 * to avoid float drift on currency totals. Display uses Indian-grouped lakhs
 * (e.g. ₹12,34,567.00).
 */

/** "1500" or "1,500" or "1,500.50" or "₹1,500" → 150050 (paise). Returns 0 on garbage input. */
export function parseRupeesToPaise(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input
    .replace(/[₹,\s]/g, "")
    .replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** 150050 → "1,500.50" (no currency symbol). Indian comma grouping. */
export function formatPaiseToRupees(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 150050 → "₹1,500.50". The standard "money on a screen" format. */
export function formatPaise(paise: number): string {
  return "₹" + formatPaiseToRupees(paise);
}

/** Compact pipeline-column total: 12345600 → "₹1.23 Cr", 250000 → "₹2.5 K" */
export function formatPaiseCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  if (abs >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(rupees / 1_000).toFixed(1)} K`;
  return `₹${rupees.toFixed(0)}`;
}
