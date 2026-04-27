import { NextResponse } from "next/server";
import { db, upsertContact } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ImportRow = Record<string, string>;

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
  const defaultTag: string | null = body.tag ? String(body.tag).trim() : null;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const lower: ImportRow = {};
    for (const [k, v] of Object.entries(row)) lower[k.toLowerCase().trim()] = String(v ?? "").trim();
    const phoneRaw = lower.phone || lower.wa_id || lower.number || lower.mobile || "";
    const name = lower.name || null;
    const digits = phoneRaw.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      skipped++;
      continue;
    }
    try {
      const existing = db().prepare("SELECT id, tags, custom_fields FROM contacts WHERE wa_id = ?").get(digits) as
        | { id: number; tags: string; custom_fields: string }
        | undefined;

      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(lower)) {
        if (["phone", "wa_id", "number", "mobile", "name", "tag", "tags"].includes(k)) continue;
        if (v) custom[k] = v;
      }
      const rowTags = (lower.tags || lower.tag || "")
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (defaultTag) rowTags.push(defaultTag);

      if (existing) {
        const existingTags: string[] = safeParse(existing.tags, []);
        const existingCustom: Record<string, string> = safeParse(existing.custom_fields, {});
        const mergedTags = Array.from(new Set([...existingTags, ...rowTags]));
        const mergedCustom = { ...existingCustom, ...custom };
        db()
          .prepare(
            "UPDATE contacts SET name = COALESCE(?, name), tags = ?, custom_fields = ? WHERE id = ?",
          )
          .run(name, JSON.stringify(mergedTags), JSON.stringify(mergedCustom), existing.id);
        updated++;
      } else {
        const id = upsertContact(digits, name);
        db()
          .prepare("UPDATE contacts SET tags = ?, custom_fields = ? WHERE id = ?")
          .run(JSON.stringify(rowTags), JSON.stringify(custom), id);
        created++;
      }
    } catch (e: any) {
      errors.push(`${phoneRaw}: ${e?.message || String(e)}`);
    }
  }

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "contact.import",
    summary: `CSV import: +${created} new, ${updated} updated, ${skipped} skipped${
      errors.length ? `, ${errors.length} errors` : ""
    }`,
    metadata: {
      created,
      updated,
      skipped,
      error_count: errors.length,
      tag: defaultTag,
      total_rows: rows.length,
    },
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ created, updated, skipped, errors });
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
