import { db } from "./db";

export type CompanyRow = {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  industry: string | null;
  notes: string | null;
  owner_user_id: number | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  contact_count: number;
  open_deal_count: number;
  open_deal_value_paise: number;
};

const COMPANY_SELECT = `
  SELECT co.id, co.name, co.website, co.phone, co.address, co.industry,
         co.notes, co.owner_user_id, u.name AS owner_name,
         co.created_at, co.updated_at,
         (SELECT COUNT(*) FROM contacts WHERE company_id = co.id) AS contact_count,
         (SELECT COUNT(*) FROM deals d
            JOIN contacts c ON c.id = d.contact_id
            WHERE c.company_id = co.id AND d.status = 'open') AS open_deal_count,
         (SELECT COALESCE(SUM(d.value_paise), 0) FROM deals d
            JOIN contacts c ON c.id = d.contact_id
            WHERE c.company_id = co.id AND d.status = 'open') AS open_deal_value_paise
    FROM companies co
    LEFT JOIN users u ON u.id = co.owner_user_id
`;

export function listCompanies(): CompanyRow[] {
  return db().prepare(COMPANY_SELECT + " ORDER BY co.name ASC").all() as CompanyRow[];
}

export function getCompany(id: number): CompanyRow | null {
  const row = db().prepare(COMPANY_SELECT + " WHERE co.id = ?").get(id) as CompanyRow | undefined;
  return row || null;
}

export function getCompanyContactIds(companyId: number): number[] {
  const rows = db()
    .prepare("SELECT id FROM contacts WHERE company_id = ? ORDER BY name ASC")
    .all(companyId) as Array<{ id: number }>;
  return rows.map((r) => r.id);
}
