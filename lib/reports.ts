/**
 * CRM reporting queries.
 *
 * Two scoping conventions matter here:
 *  - "Open" / "by stage" / "stalled" / "forecast" are SNAPSHOTS — current state
 *    of the deals table, NOT date-scoped.
 *  - "Won this period" / "Lost this period" / "by agent" / "monthly" are
 *    date-scoped to `deals.closed_at` falling within the range.
 *
 * Money is integer paise (matches the schema). All sums are returned as paise;
 * the UI converts via `formatPaise(...)` / `formatPaiseCompact(...)`.
 */
import { db } from "./db";

export type DateRange = { from: string; to: string };

export type ReportSummary = {
  open_value_paise: number;
  open_count: number;
  won_value_paise: number;
  won_count: number;
  lost_value_paise: number;
  lost_count: number;
  win_rate: number;
  avg_won_deal_paise: number;
};

export type StageReportRow = {
  stage_id: number | null;
  stage_name: string | null;
  color: string | null;
  is_won: number;
  is_lost: number;
  order_index: number;
  count: number;
  total_paise: number;
  probability: number; // 0..1, used for forecast weighting
  weighted_paise: number;
};

export type AgentReportRow = {
  user_id: number | null;
  name: string;
  open_count: number;
  open_paise: number;
  won_count: number;
  won_paise: number;
  lost_count: number;
  lost_paise: number;
  win_rate: number;
};

export type MonthlyRow = {
  month: string; // "YYYY-MM"
  won_count: number;
  won_paise: number;
};

export type StalledDeal = {
  id: number;
  title: string;
  value_paise: number;
  stage_name: string | null;
  stage_color: string | null;
  contact_name: string | null;
  contact_wa_id: string;
  owner_name: string | null;
  updated_at: string;
  days_idle: number;
};

/**
 * Forecast probabilities: simple linear ramp by stage `order_index` among
 * non-terminal stages. Won = 100%, Lost = 0%, unstaged = 5%. With 4 active
 * stages you get 20% / 40% / 60% / 80%. Sid can override later by switching
 * the ramp to a stored per-stage probability column.
 */
function probabilityFor(stage: {
  is_won: number;
  is_lost: number;
  order_index: number;
} | null, totalNonTerminal: number): number {
  if (!stage) return 0.05;
  if (stage.is_won) return 1;
  if (stage.is_lost) return 0;
  if (totalNonTerminal <= 0) return 0.5;
  // order_index of non-terminal stages starts at 0; map to (i+1)/(N+1)
  return (stage.order_index + 1) / (totalNonTerminal + 1);
}

export function getReportSummary(range: DateRange): ReportSummary {
  const open = db()
    .prepare(
      `SELECT COALESCE(SUM(value_paise), 0) AS total, COUNT(*) AS n
         FROM deals WHERE status = 'open'`,
    )
    .get() as { total: number; n: number };

  const won = db()
    .prepare(
      `SELECT COALESCE(SUM(value_paise), 0) AS total, COUNT(*) AS n
         FROM deals
         WHERE status = 'won' AND closed_at >= ? AND closed_at < ?`,
    )
    .get(range.from, range.to) as { total: number; n: number };

  const lost = db()
    .prepare(
      `SELECT COALESCE(SUM(value_paise), 0) AS total, COUNT(*) AS n
         FROM deals
         WHERE status = 'lost' AND closed_at >= ? AND closed_at < ?`,
    )
    .get(range.from, range.to) as { total: number; n: number };

  const closedTotal = won.n + lost.n;
  const winRate = closedTotal > 0 ? won.n / closedTotal : 0;
  const avgWon = won.n > 0 ? Math.round(won.total / won.n) : 0;

  return {
    open_value_paise: open.total,
    open_count: open.n,
    won_value_paise: won.total,
    won_count: won.n,
    lost_value_paise: lost.total,
    lost_count: lost.n,
    win_rate: winRate,
    avg_won_deal_paise: avgWon,
  };
}

/** Pipeline snapshot grouped by stage. Includes empty stages too. */
export function getStageReport(): StageReportRow[] {
  const stages = db()
    .prepare(
      `SELECT id, name, color, is_won, is_lost, order_index
         FROM deal_stages ORDER BY order_index ASC, id ASC`,
    )
    .all() as Array<{
    id: number;
    name: string;
    color: string;
    is_won: number;
    is_lost: number;
    order_index: number;
  }>;

  // Total non-terminal stage count for probability ramp denominator
  const nonTerminalCount = stages.filter((s) => !s.is_won && !s.is_lost).length;

  const counts = db()
    .prepare(
      `SELECT stage_id, COUNT(*) AS n, COALESCE(SUM(value_paise), 0) AS total
         FROM deals WHERE status = 'open'
         GROUP BY stage_id`,
    )
    .all() as Array<{ stage_id: number | null; n: number; total: number }>;
  const countMap = new Map<number | null, { n: number; total: number }>();
  for (const r of counts) countMap.set(r.stage_id, r);

  const rows: StageReportRow[] = stages.map((s) => {
    const c = countMap.get(s.id) || { n: 0, total: 0 };
    const probability = probabilityFor(s, nonTerminalCount);
    return {
      stage_id: s.id,
      stage_name: s.name,
      color: s.color,
      is_won: s.is_won,
      is_lost: s.is_lost,
      order_index: s.order_index,
      count: c.n,
      total_paise: c.total,
      probability,
      weighted_paise: Math.round(c.total * probability),
    };
  });

  // Unstaged bucket if any
  const unstaged = countMap.get(null);
  if (unstaged && unstaged.n > 0) {
    rows.push({
      stage_id: null,
      stage_name: "Unstaged",
      color: "#94a3b8",
      is_won: 0,
      is_lost: 0,
      order_index: 9999,
      count: unstaged.n,
      total_paise: unstaged.total,
      probability: 0.05,
      weighted_paise: Math.round(unstaged.total * 0.05),
    });
  }

  return rows;
}

/** Agent leaderboard. Won/Lost are date-scoped; Open is current snapshot. */
export function getAgentReport(range: DateRange): AgentReportRow[] {
  const users = db()
    .prepare(
      `SELECT id, name FROM users WHERE active = 1 ORDER BY role DESC, name ASC`,
    )
    .all() as Array<{ id: number; name: string }>;

  const open = db()
    .prepare(
      `SELECT owner_user_id, COUNT(*) AS n, COALESCE(SUM(value_paise), 0) AS total
         FROM deals WHERE status = 'open' GROUP BY owner_user_id`,
    )
    .all() as Array<{ owner_user_id: number | null; n: number; total: number }>;

  const won = db()
    .prepare(
      `SELECT owner_user_id, COUNT(*) AS n, COALESCE(SUM(value_paise), 0) AS total
         FROM deals WHERE status = 'won' AND closed_at >= ? AND closed_at < ?
         GROUP BY owner_user_id`,
    )
    .all(range.from, range.to) as Array<{
    owner_user_id: number | null;
    n: number;
    total: number;
  }>;

  const lost = db()
    .prepare(
      `SELECT owner_user_id, COUNT(*) AS n, COALESCE(SUM(value_paise), 0) AS total
         FROM deals WHERE status = 'lost' AND closed_at >= ? AND closed_at < ?
         GROUP BY owner_user_id`,
    )
    .all(range.from, range.to) as Array<{
    owner_user_id: number | null;
    n: number;
    total: number;
  }>;

  const openMap = new Map<number | null, { n: number; total: number }>();
  for (const r of open) openMap.set(r.owner_user_id, r);
  const wonMap = new Map<number | null, { n: number; total: number }>();
  for (const r of won) wonMap.set(r.owner_user_id, r);
  const lostMap = new Map<number | null, { n: number; total: number }>();
  for (const r of lost) lostMap.set(r.owner_user_id, r);

  const rows: AgentReportRow[] = users.map((u) => {
    const o = openMap.get(u.id) || { n: 0, total: 0 };
    const w = wonMap.get(u.id) || { n: 0, total: 0 };
    const l = lostMap.get(u.id) || { n: 0, total: 0 };
    const closed = w.n + l.n;
    return {
      user_id: u.id,
      name: u.name,
      open_count: o.n,
      open_paise: o.total,
      won_count: w.n,
      won_paise: w.total,
      lost_count: l.n,
      lost_paise: l.total,
      win_rate: closed > 0 ? w.n / closed : 0,
    };
  });

  // Append "Unassigned" row if there are any orphan deals
  const oUnassigned = openMap.get(null);
  const wUnassigned = wonMap.get(null);
  const lUnassigned = lostMap.get(null);
  if (oUnassigned || wUnassigned || lUnassigned) {
    const w = wUnassigned || { n: 0, total: 0 };
    const l = lUnassigned || { n: 0, total: 0 };
    const closed = w.n + l.n;
    rows.push({
      user_id: null,
      name: "Unassigned",
      open_count: oUnassigned?.n || 0,
      open_paise: oUnassigned?.total || 0,
      won_count: w.n,
      won_paise: w.total,
      lost_count: l.n,
      lost_paise: l.total,
      win_rate: closed > 0 ? w.n / closed : 0,
    });
  }

  // Sort by won revenue desc — leaderboard ordering
  rows.sort((a, b) => b.won_paise - a.won_paise);
  return rows;
}

/** Last 12 months of won totals (bucketed by closed_at month). */
export function getMonthlyWon(): MonthlyRow[] {
  const rows = db()
    .prepare(
      `SELECT substr(closed_at, 1, 7) AS month,
              COUNT(*) AS won_count,
              COALESCE(SUM(value_paise), 0) AS won_paise
         FROM deals
         WHERE status = 'won' AND closed_at IS NOT NULL
         GROUP BY substr(closed_at, 1, 7)
         ORDER BY month ASC`,
    )
    .all() as Array<{ month: string; won_count: number; won_paise: number }>;

  // Pad to last 12 months ending current month so the chart always has 12 bars.
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push(m);
  }
  const map = new Map(rows.map((r) => [r.month, r]));
  return months.map(
    (m) => map.get(m) || { month: m, won_count: 0, won_paise: 0 },
  );
}

/** Open deals with no updated_at touch in the last `days` days. */
export function getStalledDeals(days: number): StalledDeal[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db()
    .prepare(
      `SELECT d.id, d.title, d.value_paise, d.updated_at,
              s.name AS stage_name, s.color AS stage_color,
              c.name AS contact_name, c.wa_id AS contact_wa_id,
              u.name AS owner_name
         FROM deals d
         LEFT JOIN deal_stages s ON s.id = d.stage_id
         LEFT JOIN contacts c ON c.id = d.contact_id
         LEFT JOIN users u ON u.id = d.owner_user_id
         WHERE d.status = 'open'
           AND d.updated_at < ?
         ORDER BY d.updated_at ASC
         LIMIT 50`,
    )
    .all(cutoff) as Array<Omit<StalledDeal, "days_idle">>;

  const nowMs = Date.now();
  return rows.map((r) => {
    const safe = r.updated_at.includes("T")
      ? r.updated_at
      : r.updated_at.replace(" ", "T") + "Z";
    const t = new Date(safe).getTime();
    const days_idle = isNaN(t) ? days : Math.floor((nowMs - t) / (24 * 60 * 60 * 1000));
    return { ...r, days_idle };
  });
}
