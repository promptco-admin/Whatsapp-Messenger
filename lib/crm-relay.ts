/**
 * Relays an Approve/Disapprove button tap (from the finalize-approval
 * WhatsApp message Prompt-Solar CRM sends) back into the CRM's own
 * Supabase project, via its wa-approval-callback edge function.
 *
 * Payload convention: quick-reply buttons on that template carry
 * "crm_approve:<leadId>" / "crm_disapprove:<leadId>" as their payload —
 * set by whatsapp-notify on the CRM side when it sends the template.
 */
const PAYLOAD_PATTERN = /^crm_(approve|disapprove):(.+)$/;

export function parseCrmApprovalPayload(payload: string | null | undefined): { action: "approve" | "disapprove"; leadId: string } | null {
  if (!payload) return null;
  const match = payload.match(PAYLOAD_PATTERN);
  if (!match) return null;
  return { action: match[1] as "approve" | "disapprove", leadId: match[2] };
}

export async function relayCrmApproval(payload: string): Promise<void> {
  const parsed = parseCrmApprovalPayload(payload);
  if (!parsed) return;

  const url = process.env.PROMPT_CRM_SUPABASE_URL;
  // Deliberately NOT the CRM's Supabase service_role key — that would give
  // this app (and anything that ever compromises it) full read/write access
  // to the entire CRM database. This is a narrow, single-purpose secret that
  // only unlocks the one wa-approval-callback function on the other end.
  const key = process.env.PROMPT_CRM_CALLBACK_KEY;
  if (!url || !key) {
    console.error("[crm-relay] PROMPT_CRM_SUPABASE_URL / PROMPT_CRM_CALLBACK_KEY not configured — dropping approval relay");
    return;
  }

  const res = await fetch(`${url}/functions/v1/wa-approval-callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ leadId: parsed.leadId, action: parsed.action }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CRM approval relay failed: HTTP ${res.status} ${text}`);
  }
}
