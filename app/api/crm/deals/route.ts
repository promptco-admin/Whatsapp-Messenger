import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, clientIp } from "@/lib/audit";
import { listDeals } from "@/lib/deals";
import { parseRupeesToPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "all") as
    | "open"
    | "won"
    | "lost"
    | "all";
  const ownerId = url.searchParams.get("owner_id")
    ? Number(url.searchParams.get("owner_id"))
    : undefined;
  const stageId = url.searchParams.get("stage_id")
    ? Number(url.searchParams.get("stage_id"))
    : undefined;
  const contactId = url.searchParams.get("contact_id")
    ? Number(url.searchParams.get("contact_id"))
    : undefined;

  const deals = listDeals({ status, ownerId, stageId, contactId });
  return NextResponse.json({ deals });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = await req.json();
  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const contactId = Number(body.contact_id);
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const contact = db()
    .prepare("SELECT id, name, wa_id FROM contacts WHERE id = ?")
    .get(contactId) as { id: number; name: string | null; wa_id: string } | undefined;
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });

  // Default to first non-terminal stage if none specified.
  let stageId = body.stage_id != null ? Number(body.stage_id) : null;
  if (!stageId) {
    const first = db()
      .prepare(
        `SELECT id FROM deal_stages
           WHERE is_won = 0 AND is_lost = 0
           ORDER BY order_index ASC, id ASC LIMIT 1`,
      )
      .get() as { id: number } | undefined;
    stageId = first?.id ?? null;
  }

  const ownerId = body.owner_user_id != null ? Number(body.owner_user_id) : user.id;
  const value_paise = parseRupeesToPaise(body.value);

  const res = db()
    .prepare(
      `INSERT INTO deals (title, contact_id, owner_user_id, stage_id, value_paise,
                           expected_close_date, notes, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      contactId,
      ownerId,
      stageId,
      value_paise,
      body.expected_close_date || null,
      body.notes || null,
      user.id,
    );
  const id = Number(res.lastInsertRowid);

  logActivity({
    user: { id: user.id, name: user.name, role: user.role },
    action: "deal.create",
    entityType: "deal",
    entityId: id,
    contactId,
    summary: `Created deal "${title}" for ${contact.name || "+" + contact.wa_id}`,
    metadata: { title, value_paise, stage_id: stageId, owner_user_id: ownerId },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ id });
}
