/**
 * Phase 6c — flow runner.
 *
 * A flow is a directed graph of nodes (trigger, send_message, send_template,
 * ask_question, wait, branch_keyword, set_tag, end). A flow_run tracks one
 * contact's position in one flow plus any variables they've answered.
 *
 * The runner advances a run as far as it can in one call, stopping when it
 * hits a node that needs to wait (ask_question, wait) or reaches an end
 * (explicit end node, or no outgoing edge).
 */
import { db, touchContact } from "./db";
import { sendText, sendTemplate, type TemplateSendComponent } from "./whatsapp";
import { logError } from "./audit";

// ---------------------------------------------------------------------------
// Types

export type FlowNode = {
  id: string;
  type: string; // 'trigger' | 'send_message' | 'send_template' | 'ask_question' | 'wait' | 'branch_keyword' | 'set_tag' | 'end'
  position?: { x: number; y: number };
  data: Record<string, any>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // branch_keyword uses handles like 'match' / 'default'
};

type FlowRow = {
  id: number;
  name: string;
  active: number;
  trigger_type: string;
  trigger_config: string | null;
  nodes_json: string | null;
  edges_json: string | null;
};

type RunRow = {
  id: number;
  flow_id: number;
  contact_id: number;
  current_node_id: string | null;
  status: string;
  variables: string | null;
  waiting_for: string | null;
  next_run_at: string | null;
};

type ContactRow = {
  id: number;
  wa_id: string;
  name: string | null;
  last_inbound_at: string | null;
  tags: string | null;
  custom_fields: string | null;
  source_json: string | null;
};

// ---------------------------------------------------------------------------
// Helpers

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function getContact(contactId: number): ContactRow | null {
  return (
    (db().prepare("SELECT * FROM contacts WHERE id = ?").get(contactId) as ContactRow) || null
  );
}

function getFlow(flowId: number): FlowRow | null {
  return (db().prepare("SELECT * FROM flows WHERE id = ?").get(flowId) as FlowRow) || null;
}

function parseGraph(flow: FlowRow): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: safeParse<FlowNode[]>(flow.nodes_json, []),
    edges: safeParse<FlowEdge[]>(flow.edges_json, []),
  };
}

function findNextNodeId(
  edges: FlowEdge[],
  fromNodeId: string,
  sourceHandle: string | null = null,
): string | null {
  for (const e of edges) {
    if (e.source !== fromNodeId) continue;
    if (sourceHandle && e.sourceHandle && e.sourceHandle !== sourceHandle) continue;
    if (sourceHandle && !e.sourceHandle) continue; // edge isn't handle-qualified but we need a specific handle
    return e.target;
  }
  return null;
}

function findTriggerNode(nodes: FlowNode[]): FlowNode | null {
  return nodes.find((n) => n.type === "trigger") || null;
}

/** Substitute {{var}} placeholders in a string using the run's variables + contact fields. */
function interpolate(
  template: string,
  vars: Record<string, string>,
  contact: ContactRow,
): string {
  const fields = safeParse<Record<string, string>>(contact.custom_fields, {});
  const pool: Record<string, string> = {
    ...fields,
    ...vars,
    name: contact.name || "",
    wa_id: contact.wa_id,
    phone: `+${contact.wa_id}`,
  };
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key) => pool[key] ?? "");
}

function withinWindow(lastInbound: string | null): boolean {
  if (!lastInbound) return false;
  const s = lastInbound.includes("T") ? lastInbound : lastInbound.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Run persistence

function updateRun(
  runId: number,
  patch: {
    current_node_id?: string | null;
    status?: string;
    variables?: Record<string, string>;
    waiting_for?: string | null;
    next_run_at?: string | null;
    last_error?: string | null;
    completed_at?: string | null;
  },
) {
  const cols: string[] = [];
  const vals: any[] = [];
  if ("current_node_id" in patch) {
    cols.push("current_node_id = ?");
    vals.push(patch.current_node_id);
  }
  if ("status" in patch) {
    cols.push("status = ?");
    vals.push(patch.status);
  }
  if ("variables" in patch) {
    cols.push("variables = ?");
    vals.push(JSON.stringify(patch.variables));
  }
  if ("waiting_for" in patch) {
    cols.push("waiting_for = ?");
    vals.push(patch.waiting_for);
  }
  if ("next_run_at" in patch) {
    cols.push("next_run_at = ?");
    vals.push(patch.next_run_at);
  }
  if ("last_error" in patch) {
    cols.push("last_error = ?");
    vals.push(patch.last_error);
  }
  if ("completed_at" in patch) {
    cols.push("completed_at = ?");
    vals.push(patch.completed_at);
  }
  if (cols.length === 0) return;
  vals.push(runId);
  db()
    .prepare(`UPDATE flow_runs SET ${cols.join(", ")} WHERE id = ?`)
    .run(...vals);
}

// ---------------------------------------------------------------------------
// Node execution

async function executeNode(
  node: FlowNode,
  run: RunRow,
  flow: FlowRow,
  contact: ContactRow,
  vars: Record<string, string>,
): Promise<{
  /** null = this node was terminal (end/failure); we stop advancing. */
  nextNodeId: string | null;
  /** true = node was executed, runner loop can continue. */
  didExecute: boolean;
  /** true = node is a hard stop (waiting for reply or time). Runner persists state and exits. */
  isHalting: boolean;
  /** Fields to patch onto the run row. */
  patch: Parameters<typeof updateRun>[1];
}> {
  const edges = safeParse<FlowEdge[]>(flow.edges_json, []);
  const data = node.data || {};

  switch (node.type) {
    case "trigger": {
      // Trigger is the entry; just move to the first connected node.
      const next = findNextNodeId(edges, node.id);
      return { nextNodeId: next, didExecute: true, isHalting: false, patch: {} };
    }

    case "send_message": {
      const body = interpolate(String(data.text || ""), vars, contact);
      if (!body.trim()) {
        return {
          nextNodeId: findNextNodeId(edges, node.id),
          didExecute: true,
          isHalting: false,
          patch: {},
        };
      }
      if (!withinWindow(contact.last_inbound_at)) {
        // Can't send free-form text outside the 24h window — skip this node
        // (treat as no-op, move on). Alternative: fail the run. Noop is friendlier.
        return {
          nextNodeId: findNextNodeId(edges, node.id),
          didExecute: true,
          isHalting: false,
          patch: {
            last_error: "skipped send_message: 24h window closed",
          },
        };
      }
      const { messageId } = await sendText(contact.wa_id, body);
      db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
           VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
        )
        .run(messageId, contact.id, body);
      touchContact(contact.id);
      return {
        nextNodeId: findNextNodeId(edges, node.id),
        didExecute: true,
        isHalting: false,
        patch: {},
      };
    }

    case "send_template": {
      const templateName = String(data.template_name || "").trim();
      const language = String(data.language || "en_US");
      const rawVars: string[] = Array.isArray(data.variables) ? data.variables : [];
      const interpolated = rawVars.map((v) => interpolate(String(v), vars, contact));
      if (!templateName) {
        return {
          nextNodeId: findNextNodeId(edges, node.id),
          didExecute: true,
          isHalting: false,
          patch: { last_error: "send_template: missing template_name" },
        };
      }
      const components: TemplateSendComponent[] = [];
      if (interpolated.length > 0) {
        components.push({
          type: "body",
          parameters: interpolated.map((v) => ({ type: "text", text: v })),
        });
      }
      const { messageId } = await sendTemplate(contact.wa_id, templateName, language, components);
      db()
        .prepare(
          `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, template_name, template_variables, status)
           VALUES (?, ?, 'outbound', 'template', ?, ?, ?, 'sent')`,
        )
        .run(
          messageId,
          contact.id,
          `[template: ${templateName}]`,
          templateName,
          JSON.stringify(interpolated),
        );
      touchContact(contact.id);
      return {
        nextNodeId: findNextNodeId(edges, node.id),
        didExecute: true,
        isHalting: false,
        patch: {},
      };
    }

    case "ask_question": {
      const prompt = interpolate(String(data.prompt || ""), vars, contact);
      if (prompt.trim() && withinWindow(contact.last_inbound_at)) {
        const { messageId } = await sendText(contact.wa_id, prompt);
        db()
          .prepare(
            `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
             VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
          )
          .run(messageId, contact.id, prompt);
        touchContact(contact.id);
      }
      // Pause here until the contact replies (webhook re-enters the runner).
      const varName = String(data.variable || "answer");
      return {
        nextNodeId: null,
        didExecute: true,
        isHalting: true,
        patch: {
          current_node_id: node.id,
          status: "waiting_for_reply",
          waiting_for: varName,
        },
      };
    }

    case "wait": {
      const minutes =
        Number(data.minutes || 0) +
        Number(data.hours || 0) * 60 +
        Number(data.days || 0) * 24 * 60;
      const runAt = new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
      const nextId = findNextNodeId(edges, node.id);
      return {
        nextNodeId: null,
        didExecute: true,
        isHalting: true,
        patch: {
          current_node_id: nextId, // advance on the next tick
          status: "waiting",
          next_run_at: runAt,
          waiting_for: null,
        },
      };
    }

    case "branch_keyword": {
      const matchType: "contains" | "exact" | "starts_with" = data.match_type || "contains";
      const keyword = String(data.keyword || "").toLowerCase();
      const lastInbound = (vars.__last_inbound || "").toLowerCase();
      let matched = false;
      if (keyword) {
        if (matchType === "exact") matched = lastInbound === keyword;
        else if (matchType === "starts_with") matched = lastInbound.startsWith(keyword);
        else matched = lastInbound.includes(keyword);
      }
      const handle = matched ? "match" : "default";
      const next = findNextNodeId(edges, node.id, handle) || findNextNodeId(edges, node.id);
      return { nextNodeId: next, didExecute: true, isHalting: false, patch: {} };
    }

    case "branch_condition": {
      // Evaluate a single condition against contact state / last inbound.
      //   field:    tag | custom_field | last_inbound | unsubscribed | source_type
      //   op:       has | missing | equals | not_equals | contains | regex | any
      //   value:    depends on field (tag name, field name, pattern, etc.)
      //   value2:   for custom_field we need fieldName in `value` and expected in `value2`
      const field = String(data.field || "tag");
      const op = String(data.op || "has");
      const value = String(data.value ?? "");
      const value2 = String(data.value2 ?? "");

      let tags: string[] = [];
      let customFields: Record<string, string> = {};
      try { tags = JSON.parse(contact.tags || "[]"); } catch {}
      try { customFields = JSON.parse(contact.custom_fields || "{}"); } catch {}

      let matched = false;
      try {
        if (field === "tag") {
          if (op === "has") matched = tags.includes(value);
          else if (op === "missing") matched = !tags.includes(value);
        } else if (field === "custom_field") {
          const v = customFields[value] ?? "";
          if (op === "equals") matched = v === value2;
          else if (op === "not_equals") matched = v !== value2;
          else if (op === "contains") matched = v.toLowerCase().includes(value2.toLowerCase());
          else if (op === "has") matched = v.trim().length > 0;
          else if (op === "missing") matched = v.trim().length === 0;
          else if (op === "regex") matched = new RegExp(value2, "i").test(v);
        } else if (field === "last_inbound") {
          const s = vars.__last_inbound || "";
          if (op === "contains") matched = s.toLowerCase().includes(value.toLowerCase());
          else if (op === "equals") matched = s.toLowerCase() === value.toLowerCase();
          else if (op === "regex") matched = new RegExp(value, "i").test(s);
        } else if (field === "unsubscribed") {
          // op ignored; 'has' means is unsubscribed
          const row = db()
            .prepare("SELECT unsubscribed_at FROM contacts WHERE id = ?")
            .get(contact.id) as { unsubscribed_at: string | null } | undefined;
          matched = !!row?.unsubscribed_at;
        } else if (field === "source_type") {
          const src = safeParse<{ source_type?: string }>(contact.source_json, {});
          if (op === "equals") matched = (src.source_type || "") === value;
          else if (op === "has") matched = !!src.source_type;
          else if (op === "missing") matched = !src.source_type;
        }
      } catch (e: any) {
        // bad regex, bad JSON — fall through to default branch with error logged
        console.error("[flow] branch_condition error", e?.message || e);
      }

      const handle = matched ? "match" : "default";
      const next = findNextNodeId(edges, node.id, handle) || findNextNodeId(edges, node.id);
      return { nextNodeId: next, didExecute: true, isHalting: false, patch: {} };
    }

    case "set_tag": {
      const action: "add" | "remove" = data.action || "add";
      const tag = String(data.tag || "").trim();
      if (tag) {
        const row = db()
          .prepare("SELECT tags FROM contacts WHERE id = ?")
          .get(contact.id) as { tags: string | null } | undefined;
        let tags: string[] = safeParse<string[]>(row?.tags || null, []);
        if (action === "add" && !tags.includes(tag)) tags.push(tag);
        else if (action === "remove") tags = tags.filter((t) => t !== tag);
        db().prepare("UPDATE contacts SET tags = ? WHERE id = ?").run(JSON.stringify(tags), contact.id);
      }
      return {
        nextNodeId: findNextNodeId(edges, node.id),
        didExecute: true,
        isHalting: false,
        patch: {},
      };
    }

    case "handoff_to_agent": {
      // Bot steps aside: assign the contact to an agent, tag them, and optionally
      // send a "connecting you with an agent" message. The flow then ends.
      const agentUserId = data.user_id ? Number(data.user_id) : null;
      const handoffTag = String(data.tag || "needs-human").trim();
      const handoffMessage = interpolate(
        String(data.message || "One moment — connecting you with an agent."),
        vars,
        contact,
      );

      // Tag the contact
      if (handoffTag) {
        const row = db()
          .prepare("SELECT tags FROM contacts WHERE id = ?")
          .get(contact.id) as { tags: string | null } | undefined;
        const tags: string[] = safeParse<string[]>(row?.tags || null, []);
        if (!tags.includes(handoffTag)) tags.push(handoffTag);
        db()
          .prepare("UPDATE contacts SET tags = ? WHERE id = ?")
          .run(JSON.stringify(tags), contact.id);
      }

      // Assign an agent if specified
      if (agentUserId) {
        db()
          .prepare("UPDATE contacts SET assigned_user_id = ? WHERE id = ?")
          .run(agentUserId, contact.id);
      }

      // Send the acknowledgement, if in the 24h window
      if (handoffMessage.trim() && withinWindow(contact.last_inbound_at)) {
        try {
          const { messageId } = await sendText(contact.wa_id, handoffMessage);
          db()
            .prepare(
              `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status)
               VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
            )
            .run(messageId, contact.id, handoffMessage);
          touchContact(contact.id);
        } catch (e) {
          console.error("[flow] handoff message failed", e);
        }
      }

      return {
        nextNodeId: null,
        didExecute: true,
        isHalting: true,
        patch: {
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: "handed off to agent",
        },
      };
    }

    case "end": {
      return {
        nextNodeId: null,
        didExecute: true,
        isHalting: true,
        patch: { status: "completed", completed_at: new Date().toISOString() },
      };
    }

    default: {
      // Unknown node type: skip, move on.
      return {
        nextNodeId: findNextNodeId(edges, node.id),
        didExecute: false,
        isHalting: false,
        patch: { last_error: `unknown node type: ${node.type}` },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Driver loop

/**
 * Advance a flow run as far as it can go in one pass. Stops on:
 *   - ask_question (sets waiting_for_reply)
 *   - wait (sets waiting + next_run_at)
 *   - end (sets completed)
 *   - no outgoing edge (also completes)
 */
export async function advanceRun(runId: number, maxSteps = 50): Promise<void> {
  const run = db().prepare("SELECT * FROM flow_runs WHERE id = ?").get(runId) as RunRow | undefined;
  if (!run) return;
  if (run.status === "completed" || run.status === "failed") return;

  const flow = getFlow(run.flow_id);
  const contact = getContact(run.contact_id);
  if (!flow || !contact) {
    updateRun(runId, { status: "failed", last_error: "flow or contact missing" });
    return;
  }

  const { nodes } = parseGraph(flow);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  let currentId = run.current_node_id;
  const vars = safeParse<Record<string, string>>(run.variables, {});

  // If run hasn't started yet, begin at the trigger's successor.
  if (!currentId) {
    const trigger = findTriggerNode(nodes);
    if (!trigger) {
      updateRun(runId, { status: "failed", last_error: "no trigger node" });
      return;
    }
    const first = findNextNodeId(safeParse<FlowEdge[]>(flow.edges_json, []), trigger.id);
    currentId = first;
  }

  for (let step = 0; step < maxSteps && currentId; step++) {
    const node = nodesById.get(currentId);
    if (!node) {
      updateRun(runId, {
        status: "completed",
        completed_at: new Date().toISOString(),
        current_node_id: null,
      });
      return;
    }
    try {
      const result = await executeNode(node, run, flow, contact, vars);
      updateRun(runId, { ...result.patch, current_node_id: currentId });
      if (result.isHalting) {
        // Leave run in the state the node requested.
        return;
      }
      currentId = result.nextNodeId;
    } catch (e: any) {
      const msg = e?.message || String(e);
      updateRun(runId, {
        status: "failed",
        last_error: msg,
        completed_at: new Date().toISOString(),
      });
      logError({
        source: "flow.advance",
        message: msg,
        context: { run_id: runId, node_id: currentId },
        contactId: contact.id,
      });
      return;
    }
  }

  if (!currentId) {
    updateRun(runId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      current_node_id: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Trigger handlers (called from webhook + manual enroll)

/**
 * Create a new run for (flowId, contactId) and kick it off.
 * Refuses to duplicate an active run for the same (flow, contact).
 */
export async function enrollInFlow(
  flowId: number,
  contactId: number,
  seedVars: Record<string, string> = {},
): Promise<number | null> {
  const existing = db()
    .prepare(
      `SELECT id FROM flow_runs
        WHERE flow_id = ? AND contact_id = ?
          AND status NOT IN ('completed', 'failed')`,
    )
    .get(flowId, contactId) as { id: number } | undefined;
  if (existing) return existing.id;

  const res = db()
    .prepare(
      `INSERT INTO flow_runs (flow_id, contact_id, status, variables)
       VALUES (?, ?, 'active', ?)`,
    )
    .run(flowId, contactId, JSON.stringify(seedVars));
  const runId = Number(res.lastInsertRowid);
  await advanceRun(runId).catch((e) => console.error("[flow] advance error", e));
  return runId;
}

/**
 * Called from webhook on every inbound message. Handles three things:
 *  1. If this contact has a run `waiting_for_reply`, feed them the message
 *     as the awaited variable and resume.
 *  2. Fire keyword-trigger flows whose rule matches.
 *  3. Fire new-contact flows on a contact's first inbound.
 *  4. Fire from-ad flows when a contact's source_json is set and recent.
 */
export async function handleInboundForFlows(
  contactId: number,
  messageBody: string,
  isFirstInbound: boolean,
): Promise<void> {
  const msg = (messageBody || "").trim();

  // 1. Resume waiting runs
  const waitingRuns = db()
    .prepare(
      `SELECT * FROM flow_runs
        WHERE contact_id = ? AND status = 'waiting_for_reply'
        ORDER BY id ASC`,
    )
    .all(contactId) as RunRow[];

  for (const run of waitingRuns) {
    try {
      const vars = safeParse<Record<string, string>>(run.variables, {});
      const varName = run.waiting_for || "answer";
      vars[varName] = msg;
      vars.__last_inbound = msg;
      // Step off the ask_question node to its successor before advancing.
      const flow = getFlow(run.flow_id);
      if (!flow) continue;
      const edges = safeParse<FlowEdge[]>(flow.edges_json, []);
      const next = run.current_node_id ? findNextNodeId(edges, run.current_node_id) : null;
      updateRun(run.id, {
        variables: vars,
        status: "active",
        waiting_for: null,
        current_node_id: next,
      });
      await advanceRun(run.id);
    } catch (e) {
      console.error("[flow] resume error", e);
    }
  }

  // 2. Keyword-trigger flows
  const keywordFlows = db()
    .prepare(
      `SELECT * FROM flows
        WHERE active = 1 AND trigger_type = 'keyword'`,
    )
    .all() as FlowRow[];
  for (const flow of keywordFlows) {
    const cfg = safeParse<{ match_type?: string; keyword?: string }>(flow.trigger_config, {});
    const kw = (cfg.keyword || "").toLowerCase();
    if (!kw) continue;
    const lower = msg.toLowerCase();
    let matched = false;
    if (cfg.match_type === "exact") matched = lower === kw;
    else if (cfg.match_type === "starts_with") matched = lower.startsWith(kw);
    else matched = lower.includes(kw);
    if (matched) {
      await enrollInFlow(flow.id, contactId, { __last_inbound: msg, __trigger: "keyword" });
    }
  }

  // 3. New-contact flows
  if (isFirstInbound) {
    const nc = db()
      .prepare(
        `SELECT * FROM flows WHERE active = 1 AND trigger_type = 'new_contact'`,
      )
      .all() as FlowRow[];
    for (const flow of nc) {
      await enrollInFlow(flow.id, contactId, {
        __last_inbound: msg,
        __trigger: "new_contact",
      });
    }
  }

  // 4. From-ad flows — only on the FIRST inbound from this contact (which is
  // when Meta delivers the referral), and only if source_json is set.
  if (isFirstInbound) {
    const contact = getContact(contactId);
    if (contact?.source_json) {
      const src = safeParse<{ source_id?: string }>(contact.source_json, {});
      const adFlows = db()
        .prepare(`SELECT * FROM flows WHERE active = 1 AND trigger_type = 'from_ad'`)
        .all() as FlowRow[];
      for (const flow of adFlows) {
        const cfg = safeParse<{ source_id?: string }>(flow.trigger_config, {});
        if (cfg.source_id && cfg.source_id !== src.source_id) continue;
        await enrollInFlow(flow.id, contactId, {
          __last_inbound: msg,
          __trigger: "from_ad",
        });
      }
    }
  }
}

/** Scheduler tick — advance any runs whose wait expired. */
export async function runFlowTick(): Promise<void> {
  const nowIso = new Date().toISOString();
  const due = db()
    .prepare(
      `SELECT id FROM flow_runs
        WHERE status = 'waiting' AND next_run_at IS NOT NULL AND next_run_at <= ?
        ORDER BY next_run_at ASC
        LIMIT 50`,
    )
    .all(nowIso) as Array<{ id: number }>;
  for (const row of due) {
    // Mark active first so we don't re-pick it if advance is slow
    db()
      .prepare("UPDATE flow_runs SET status = 'active', next_run_at = NULL WHERE id = ?")
      .run(row.id);
    await advanceRun(row.id).catch((e) => console.error("[flow] tick error", e));
  }
}
