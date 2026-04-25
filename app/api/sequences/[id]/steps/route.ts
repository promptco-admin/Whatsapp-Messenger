import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type StepInput = {
  template_name: string;
  language: string;
  variable_mapping?: any[];
  header_json?: any | null;
  delay_days?: number;
  delay_hours?: number;
  delay_minutes?: number;
};

// Replaces the full ordered step list for the sequence.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const seqId = Number(params.id);
  if (!seqId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { steps } = (await req.json()) as { steps: StepInput[] };
  if (!Array.isArray(steps)) {
    return NextResponse.json({ error: "steps array required" }, { status: 400 });
  }

  const database = db();
  const tx = database.transaction((list: StepInput[]) => {
    database.prepare("DELETE FROM sequence_steps WHERE sequence_id = ?").run(seqId);
    const insert = database.prepare(
      `INSERT INTO sequence_steps
         (sequence_id, order_index, template_name, language, variable_mapping, header_json,
          delay_days, delay_hours, delay_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    list.forEach((s, i) => {
      insert.run(
        seqId,
        i,
        String(s.template_name || ""),
        String(s.language || "en_US"),
        s.variable_mapping ? JSON.stringify(s.variable_mapping) : null,
        s.header_json ? JSON.stringify(s.header_json) : null,
        Number(s.delay_days || 0),
        Number(s.delay_hours || 0),
        Number(s.delay_minutes || 0),
      );
    });
  });
  tx(steps);

  return NextResponse.json({ ok: true, count: steps.length });
}
