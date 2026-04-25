/**
 * Phase 8: multi-condition segment evaluator.
 *
 * A segment is an array of conditions AND-ed together. Each condition targets
 * one field on the contact row (or a derived property). Used by broadcasts
 * to resolve a segment into a concrete recipient list, and by contacts-preview.
 *
 * Condition shape:
 *   { field: 'tag'|'custom_field'|'last_inbound_at'|'created_at'|'assigned_user_id'|'source_type',
 *     op: 'has'|'missing'|'equals'|'not_equals'|'contains'|'before'|'after',
 *     value: string,
 *     value2?: string }   // value2 used by custom_field equals/contains (value = field name)
 */
import { db } from "./db";

export type SegmentCondition = {
  field: string;
  op: string;
  value: string;
  value2?: string;
};

export type SegmentQuery = {
  conditions?: SegmentCondition[];
  // Legacy single-tag path still honoured
  tag?: string | null;
};

type ContactRow = {
  id: number;
  tags: string | null;
  custom_fields: string | null;
  last_inbound_at: string | null;
  created_at: string;
  assigned_user_id: number | null;
  source_json: string | null;
  unsubscribed_at: string | null;
};

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function evaluateCondition(c: SegmentCondition, row: ContactRow): boolean {
  try {
    if (c.field === "tag") {
      const tags = safeParse<string[]>(row.tags, []);
      if (c.op === "has") return tags.includes(c.value);
      if (c.op === "missing") return !tags.includes(c.value);
      return false;
    }
    if (c.field === "custom_field") {
      const fields = safeParse<Record<string, string>>(row.custom_fields, {});
      const v = fields[c.value] ?? "";
      const v2 = c.value2 ?? "";
      if (c.op === "has") return v.trim().length > 0;
      if (c.op === "missing") return v.trim().length === 0;
      if (c.op === "equals") return v === v2;
      if (c.op === "not_equals") return v !== v2;
      if (c.op === "contains") return v.toLowerCase().includes(v2.toLowerCase());
      return false;
    }
    if (c.field === "last_inbound_at" || c.field === "created_at") {
      const raw = c.field === "last_inbound_at" ? row.last_inbound_at : row.created_at;
      if (!raw) return c.op === "missing";
      const t = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z").getTime();
      const cmp = new Date(c.value).getTime();
      if (isNaN(t) || isNaN(cmp)) return false;
      if (c.op === "before") return t < cmp;
      if (c.op === "after") return t > cmp;
      return false;
    }
    if (c.field === "assigned_user_id") {
      const u = row.assigned_user_id;
      if (c.op === "has") return !!u;
      if (c.op === "missing") return !u;
      if (c.op === "equals") return Number(c.value) === u;
      return false;
    }
    if (c.field === "source_type") {
      const src = safeParse<{ source_type?: string }>(row.source_json, {});
      if (c.op === "has") return !!src.source_type;
      if (c.op === "missing") return !src.source_type;
      if (c.op === "equals") return (src.source_type || "") === c.value;
      return false;
    }
    if (c.field === "unsubscribed") {
      if (c.op === "has") return !!row.unsubscribed_at;
      if (c.op === "missing") return !row.unsubscribed_at;
      return false;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Resolve a segment query to a list of contact ids. Always excludes
 * unsubscribed contacts (STOP compliance) unless the query explicitly
 * opts in with `include_unsubscribed: true`.
 */
export function resolveSegment(
  query: SegmentQuery,
  opts: { include_unsubscribed?: boolean } = {},
): number[] {
  const rows = db()
    .prepare(
      `SELECT id, tags, custom_fields, last_inbound_at, created_at,
              assigned_user_id, source_json, unsubscribed_at
         FROM contacts
        WHERE ${opts.include_unsubscribed ? "1=1" : "unsubscribed_at IS NULL"}`,
    )
    .all() as ContactRow[];

  const conds = Array.isArray(query.conditions) ? query.conditions : [];
  const legacyTag = query.tag || null;

  return rows
    .filter((r) => {
      // Legacy single-tag path
      if (legacyTag) {
        const tags = safeParse<string[]>(r.tags, []);
        if (!tags.includes(legacyTag)) return false;
      }
      // AND all conditions
      for (const c of conds) {
        if (!evaluateCondition(c, r)) return false;
      }
      return true;
    })
    .map((r) => r.id);
}
