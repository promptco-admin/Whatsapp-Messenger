import { db } from "./db";

export type DealRow = {
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
  currency: string;
  expected_close_date: string | null;
  status: "open" | "won" | "lost";
  won_lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type DealLineItem = {
  id: number;
  deal_id: number;
  name: string;
  description: string | null;
  kind: "product" | "service";
  quantity: number;
  unit_price_paise: number;
  order_index: number;
};

const DEAL_SELECT = `
  SELECT d.id, d.title, d.contact_id,
         c.name AS contact_name,
         c.wa_profile_name AS contact_wa_profile_name,
         c.wa_id AS contact_wa_id,
         c.company_id AS company_id,
         co.name AS company_name,
         d.owner_user_id,
         u.name AS owner_name,
         d.stage_id,
         s.name AS stage_name,
         s.color AS stage_color,
         d.value_paise, d.currency, d.expected_close_date, d.status,
         d.won_lost_reason, d.notes,
         d.created_at, d.updated_at, d.closed_at
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN companies co ON co.id = c.company_id
    LEFT JOIN users u ON u.id = d.owner_user_id
    LEFT JOIN deal_stages s ON s.id = d.stage_id
`;

export function listDeals(filters: {
  status?: "open" | "won" | "lost" | "all";
  ownerId?: number;
  stageId?: number;
  contactId?: number;
} = {}): DealRow[] {
  const where: string[] = [];
  const params: any[] = [];
  if (filters.status && filters.status !== "all") {
    where.push("d.status = ?");
    params.push(filters.status);
  }
  if (filters.ownerId) {
    where.push("d.owner_user_id = ?");
    params.push(filters.ownerId);
  }
  if (filters.stageId) {
    where.push("d.stage_id = ?");
    params.push(filters.stageId);
  }
  if (filters.contactId) {
    where.push("d.contact_id = ?");
    params.push(filters.contactId);
  }
  const sql =
    DEAL_SELECT +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY d.updated_at DESC`;
  return db().prepare(sql).all(...params) as DealRow[];
}

export function getDeal(id: number): DealRow | null {
  const row = db().prepare(DEAL_SELECT + " WHERE d.id = ?").get(id) as DealRow | undefined;
  return row || null;
}

export function getDealLineItems(dealId: number): DealLineItem[] {
  return db()
    .prepare(
      `SELECT id, deal_id, name, description, kind, quantity, unit_price_paise, order_index
         FROM deal_line_items WHERE deal_id = ? ORDER BY order_index ASC, id ASC`,
    )
    .all(dealId) as DealLineItem[];
}

/**
 * Recompute the deal's `value_paise` from its line items. Called whenever line
 * items change so pipeline totals stay consistent without manual entry.
 */
export function recomputeDealValue(dealId: number): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(quantity * unit_price_paise), 0) as total
         FROM deal_line_items WHERE deal_id = ?`,
    )
    .get(dealId) as { total: number };
  const total = Math.round(row.total);
  db()
    .prepare(
      "UPDATE deals SET value_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run(total, dealId);
  return total;
}
