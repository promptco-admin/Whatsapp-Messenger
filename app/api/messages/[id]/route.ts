import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { listTemplates } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/messages/:id
 *
 * Currently only used to "annotate" ghost outbound messages (type='external')
 * created by the status webhook when another tool sent the message. The agent
 * picks which approved template was sent; we look up its body and write it
 * onto the row so the chat thread shows real content.
 *
 * Body: { template_name: string, language: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json();
  const tplName = String(body.template_name || "").trim();
  const language = String(body.language || "").trim();
  if (!tplName || !language) {
    return NextResponse.json(
      { error: "template_name + language required" },
      { status: 400 },
    );
  }

  const row = db()
    .prepare("SELECT id, type, direction FROM messages WHERE id = ?")
    .get(id) as { id: number; type: string; direction: string } | undefined;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.direction !== "outbound" || row.type !== "external") {
    return NextResponse.json(
      { error: "only external (ghost) outbound messages can be annotated" },
      { status: 400 },
    );
  }

  // Pull the template body from Meta's approved-template list.
  let templateBody = "";
  try {
    const tpls = await listTemplates();
    const match = tpls.find(
      (t) => t.name === tplName && t.language === language,
    );
    if (!match) {
      return NextResponse.json(
        { error: `template "${tplName}" (${language}) not found in approved list` },
        { status: 404 },
      );
    }
    const bodyComp = match.components.find((c) => c.type === "BODY");
    templateBody = bodyComp?.text || `[template: ${tplName}]`;
  } catch (e: any) {
    return NextResponse.json(
      { error: `failed to fetch templates: ${e?.message || String(e)}` },
      { status: 500 },
    );
  }

  db()
    .prepare(
      `UPDATE messages
          SET type = 'template',
              template_name = ?,
              body = ?
        WHERE id = ?`,
    )
    .run(tplName, templateBody, id);

  return NextResponse.json({ ok: true, body: templateBody });
}
