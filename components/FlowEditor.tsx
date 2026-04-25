"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type FlowApi = {
  id: number;
  name: string;
  description: string | null;
  active: number;
  trigger_type: string;
  trigger_config: string | null;
  nodes_json: string | null;
  edges_json: string | null;
};

type FlowRun = {
  id: number;
  contact_id: number;
  current_node_id: string | null;
  status: string;
  waiting_for: string | null;
  next_run_at: string | null;
  started_at: string;
  completed_at: string | null;
  last_error: string | null;
  wa_id: string;
  contact_name: string | null;
};

type NodeType =
  | "trigger"
  | "send_message"
  | "send_template"
  | "ask_question"
  | "wait"
  | "branch_keyword"
  | "branch_condition"
  | "set_tag"
  | "handoff_to_agent"
  | "end";

const NODE_META: Record<
  NodeType,
  { label: string; tone: string; description: string }
> = {
  trigger: {
    label: "Trigger",
    tone: "bg-purple-100 border-purple-400 text-purple-900",
    description: "Flow entry point (one per flow)",
  },
  send_message: {
    label: "Send message",
    tone: "bg-green-100 border-green-400 text-green-900",
    description: "Free-form text (only within 24h window)",
  },
  send_template: {
    label: "Send template",
    tone: "bg-emerald-100 border-emerald-400 text-emerald-900",
    description: "Approved template message (works anytime)",
  },
  ask_question: {
    label: "Ask question",
    tone: "bg-blue-100 border-blue-400 text-blue-900",
    description: "Send a prompt and wait for customer reply",
  },
  wait: {
    label: "Wait",
    tone: "bg-yellow-100 border-yellow-400 text-yellow-900",
    description: "Pause N minutes/hours/days",
  },
  branch_keyword: {
    label: "Branch by keyword",
    tone: "bg-orange-100 border-orange-400 text-orange-900",
    description: "Route based on their last reply",
  },
  branch_condition: {
    label: "Branch by condition",
    tone: "bg-amber-100 border-amber-400 text-amber-900",
    description: "Route based on tag / custom field / regex",
  },
  set_tag: {
    label: "Set tag",
    tone: "bg-pink-100 border-pink-400 text-pink-900",
    description: "Add or remove a tag on the contact",
  },
  handoff_to_agent: {
    label: "Hand off to agent",
    tone: "bg-rose-100 border-rose-400 text-rose-900",
    description: "Stop the bot, assign a human agent, tag the contact",
  },
  end: {
    label: "End",
    tone: "bg-gray-200 border-gray-500 text-gray-900",
    description: "Terminate the flow",
  },
};

function summarizeNode(type: NodeType, data: any): string {
  switch (type) {
    case "trigger":
      return "Start";
    case "send_message":
      return (data?.text || "").slice(0, 60) || "(empty)";
    case "send_template":
      return data?.template_name
        ? `template: ${data.template_name}`
        : "(no template)";
    case "ask_question":
      return `"${(data?.prompt || "").slice(0, 40)}" → {{${data?.variable || "answer"}}}`;
    case "wait": {
      const d = Number(data?.days || 0);
      const h = Number(data?.hours || 0);
      const m = Number(data?.minutes || 0);
      const parts: string[] = [];
      if (d) parts.push(`${d}d`);
      if (h) parts.push(`${h}h`);
      if (m) parts.push(`${m}m`);
      return parts.join(" ") || "0";
    }
    case "branch_keyword":
      return `${data?.match_type || "contains"} "${data?.keyword || ""}"`;
    case "branch_condition": {
      const f = data?.field || "tag";
      const o = data?.op || "has";
      const v = data?.value || "";
      const v2 = data?.value2 || "";
      if (f === "custom_field") return `${f}[${v}] ${o} "${v2}"`;
      return `${f} ${o} "${v}"`;
    }
    case "set_tag":
      return `${data?.action || "add"} "${data?.tag || ""}"`;
    case "handoff_to_agent":
      return data?.user_id ? `→ agent #${data.user_id}` : "→ any available agent";
    case "end":
      return "Stop";
  }
}

// Custom node renderer. The branch_keyword node has two source handles (match / default).
function FlowNodeCard(props: NodeProps) {
  const type = (props.data?.__type as NodeType) || "send_message";
  const meta = NODE_META[type];
  const summary = summarizeNode(type, props.data);
  const isTrigger = type === "trigger";
  const isEnd = type === "end" || type === "handoff_to_agent";
  const isBranch = type === "branch_keyword" || type === "branch_condition";

  return (
    <div
      className={`rounded-md border-2 px-3 py-2 text-xs shadow ${meta.tone} ${
        props.selected ? "ring-2 ring-offset-1 ring-blue-500" : ""
      }`}
      style={{ minWidth: 180 }}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} />}
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {meta.label}
      </div>
      <div className="whitespace-pre-wrap break-words">{summary}</div>
      {isBranch ? (
        <>
          <Handle
            id="match"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%", background: "#22c55e" }}
          />
          <Handle
            id="default"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%", background: "#6b7280" }}
          />
          <div className="mt-1 flex justify-between text-[9px] opacity-70">
            <span>match</span>
            <span>default</span>
          </div>
        </>
      ) : isEnd ? null : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const nodeTypes = { flowNode: FlowNodeCard };

function triggerDefaultConfig(type: string): any {
  if (type === "keyword") return { match_type: "contains", keyword: "" };
  if (type === "from_ad") return {};
  return {};
}

export function FlowEditor({ flowId, onClose }: { flowId: number; onClose: () => void }) {
  const [flow, setFlow] = useState<FlowApi | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [triggerConfig, setTriggerConfig] = useState<any>({});
  const [active, setActive] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showRuns, setShowRuns] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/flows/${flowId}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    const f: FlowApi = j.flow;
    setFlow(f);
    setName(f.name);
    setDescription(f.description || "");
    setTriggerType(f.trigger_type);
    try {
      setTriggerConfig(f.trigger_config ? JSON.parse(f.trigger_config) : {});
    } catch {
      setTriggerConfig({});
    }
    setActive(!!f.active);
    let loadedNodes: Node[] = [];
    let loadedEdges: Edge[] = [];
    try {
      loadedNodes = f.nodes_json ? JSON.parse(f.nodes_json) : [];
    } catch {
      loadedNodes = [];
    }
    try {
      loadedEdges = f.edges_json ? JSON.parse(f.edges_json) : [];
    } catch {
      loadedEdges = [];
    }
    // Seed a trigger node if the flow is empty.
    if (loadedNodes.length === 0) {
      loadedNodes = [
        {
          id: "trigger-1",
          type: "flowNode",
          position: { x: 250, y: 50 },
          data: { __type: "trigger" },
        },
      ];
    }
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setRuns(j.runs || []);
  }, [flowId]);

  useEffect(() => {
    load();
  }, [load]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: "smoothstep" }, eds)),
    [],
  );

  function addNode(type: NodeType) {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const n: Node = {
      id,
      type: "flowNode",
      position: { x: 300, y: 150 + nodes.length * 80 },
      data: { __type: type },
    };
    setNodes((nds) => [...nds, n]);
    setSelectedNodeId(id);
  }

  function updateSelectedNodeData(patch: Record<string, any>) {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
    );
    setSelectedNodeId(null);
  }

  async function save() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/flows/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          active,
          nodes,
          edges,
        }),
      });
      if (res.ok) {
        setSaveMsg("Saved");
        setTimeout(() => setSaveMsg(""), 1500);
      } else {
        const j = await res.json().catch(() => ({}));
        setSaveMsg(`Error: ${j.error || "save failed"}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  if (!flow) {
    return <div className="flex h-full items-center justify-center">Loading…</div>;
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-full w-full flex-col bg-white">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-wa-border bg-wa-panel px-4 py-2">
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs hover:bg-wa-panelDark"
          >
            ← Back
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-wa-border bg-white px-2 py-1 text-sm font-medium"
          />
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active
          </label>
          <button
            onClick={() => setShowRuns((v) => !v)}
            className="rounded px-2 py-1 text-xs hover:bg-wa-panelDark"
          >
            Runs ({runs.length})
          </button>
          <span className="text-xs text-wa-textMuted">{saveMsg}</span>
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-wa-greenDark px-3 py-1 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Trigger config bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-wa-border bg-wa-panel/50 px-4 py-2 text-xs">
          <span className="font-medium">Trigger:</span>
          <select
            value={triggerType}
            onChange={(e) => {
              const t = e.target.value;
              setTriggerType(t);
              setTriggerConfig(triggerDefaultConfig(t));
            }}
            className="rounded border border-wa-border bg-white px-2 py-1"
          >
            <option value="manual">Manual (enroll from chat)</option>
            <option value="keyword">Keyword in inbound message</option>
            <option value="new_contact">New contact (first inbound)</option>
            <option value="from_ad">Customer came from a CTWA ad</option>
          </select>
          {triggerType === "keyword" && (
            <>
              <select
                value={triggerConfig.match_type || "contains"}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, match_type: e.target.value })
                }
                className="rounded border border-wa-border bg-white px-2 py-1"
              >
                <option value="contains">contains</option>
                <option value="exact">exactly</option>
                <option value="starts_with">starts with</option>
              </select>
              <input
                value={triggerConfig.keyword || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, keyword: e.target.value })
                }
                placeholder="keyword (e.g. hi, order, price)"
                className="rounded border border-wa-border bg-white px-2 py-1"
              />
            </>
          )}
          {triggerType === "from_ad" && (
            <input
              value={triggerConfig.source_id || ""}
              onChange={(e) =>
                setTriggerConfig({ ...triggerConfig, source_id: e.target.value })
              }
              placeholder="optional: specific ad source_id (leave blank for any ad)"
              className="min-w-[280px] rounded border border-wa-border bg-white px-2 py-1"
            />
          )}
          <span className="ml-4 text-wa-textMuted">
            Description:
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional note"
            className="min-w-[240px] rounded border border-wa-border bg-white px-2 py-1"
          />
        </div>

        {/* Main area: palette + canvas + side panel */}
        <div className="flex min-h-0 flex-1">
          {/* Palette */}
          <div className="w-44 flex-none overflow-y-auto border-r border-wa-border bg-white p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-wa-textMuted">
              Add nodes
            </div>
            {(
              [
                "send_message",
                "send_template",
                "ask_question",
                "wait",
                "branch_keyword",
                "branch_condition",
                "set_tag",
                "handoff_to_agent",
                "end",
              ] as NodeType[]
            ).map((t) => (
              <button
                key={t}
                onClick={() => addNode(t)}
                className={`mb-2 block w-full rounded border-2 px-2 py-1.5 text-left text-xs ${NODE_META[t].tone} hover:opacity-80`}
                title={NODE_META[t].description}
              >
                + {NODE_META[t].label}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_e, n) => setSelectedNodeId(n.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>

          {/* Config panel */}
          {selectedNode && (
            <div className="w-80 flex-none overflow-y-auto border-l border-wa-border bg-wa-panel/40 p-4">
              <NodeConfigPanel
                node={selectedNode}
                update={updateSelectedNodeData}
                remove={deleteSelectedNode}
              />
            </div>
          )}

          {/* Runs panel */}
          {showRuns && !selectedNode && (
            <div className="w-80 flex-none overflow-y-auto border-l border-wa-border bg-wa-panel/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Recent runs</div>
                <button
                  onClick={() => setShowRuns(false)}
                  className="text-xs text-wa-textMuted"
                >
                  Close
                </button>
              </div>
              {runs.length === 0 ? (
                <div className="text-xs text-wa-textMuted">No runs yet.</div>
              ) : (
                runs.map((r) => (
                  <div
                    key={r.id}
                    className="mb-2 rounded border border-wa-border bg-white p-2 text-xs"
                  >
                    <div className="flex justify-between">
                      <b>{r.contact_name || `+${r.wa_id}`}</b>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          r.status === "completed"
                            ? "bg-gray-200"
                            : r.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-green-100 text-green-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="text-wa-textMuted">
                      Node: <code>{r.current_node_id || "—"}</code>
                    </div>
                    {r.waiting_for && (
                      <div className="text-wa-textMuted">
                        Waiting for: <code>{r.waiting_for}</code>
                      </div>
                    )}
                    {r.last_error && (
                      <div className="text-red-600">Error: {r.last_error}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function NodeConfigPanel({
  node,
  update,
  remove,
}: {
  node: Node;
  update: (patch: Record<string, any>) => void;
  remove: () => void;
}) {
  const type = (node.data?.__type as NodeType) || "send_message";
  const data: Record<string, any> = node.data || {};
  const isTrigger = type === "trigger";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-wa-textMuted">
            {NODE_META[type].label}
          </div>
          <div className="text-xs text-wa-textMuted">{NODE_META[type].description}</div>
        </div>
        {!isTrigger && (
          <button
            onClick={remove}
            className="rounded border border-red-300 px-2 py-1 text-[10px] text-red-700 hover:bg-red-50"
          >
            Delete node
          </button>
        )}
      </div>

      {type === "send_message" && (
        <div>
          <label className="text-[10px] font-medium text-wa-textMuted">Message text</label>
          <textarea
            value={String(data.text || "")}
            onChange={(e) => update({ text: e.target.value })}
            rows={6}
            placeholder={"Type a message. Use {{name}}, {{phone}}, or any variable captured earlier (e.g. {{answer}})."}
            className="mt-1 w-full rounded border border-wa-border bg-white p-2 text-xs"
          />
          <div className="mt-1 text-[10px] text-wa-textMuted">
            Only runs if the 24h customer-service window is open. Use a template node
            otherwise.
          </div>
        </div>
      )}

      {type === "send_template" && (
        <div className="space-y-2">
          <Field label="Template name">
            <input
              value={String(data.template_name || "")}
              onChange={(e) => update({ template_name: e.target.value })}
              placeholder="e.g. water_purufier_health_en"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <Field label="Language code">
            <input
              value={String(data.language || "en_US")}
              onChange={(e) => update({ language: e.target.value })}
              placeholder="en_US"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <Field label={"Body variables (one per line — supports {{name}}, {{answer}}, etc.)"}>
            <textarea
              value={(Array.isArray(data.variables) ? data.variables : []).join("\n")}
              onChange={(e) =>
                update({ variables: e.target.value.split("\n").filter((x) => x.length > 0) })
              }
              rows={4}
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
        </div>
      )}

      {type === "ask_question" && (
        <div className="space-y-2">
          <Field label="Prompt to send">
            <textarea
              value={String(data.prompt || "")}
              onChange={(e) => update({ prompt: e.target.value })}
              rows={4}
              placeholder="e.g. What's your pincode?"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <Field label="Save reply into variable">
            <input
              value={String(data.variable || "answer")}
              onChange={(e) => update({ variable: e.target.value })}
              placeholder="answer"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <div className="text-[10px] text-wa-textMuted">
            Reference later as <code>{`{{${data.variable || "answer"}}}`}</code>.
          </div>
        </div>
      )}

      {type === "wait" && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Days">
              <input
                type="number"
                min="0"
                value={data.days || 0}
                onChange={(e) => update({ days: Number(e.target.value) })}
                className="w-full rounded border border-wa-border bg-white p-2 text-xs"
              />
            </Field>
            <Field label="Hours">
              <input
                type="number"
                min="0"
                value={data.hours || 0}
                onChange={(e) => update({ hours: Number(e.target.value) })}
                className="w-full rounded border border-wa-border bg-white p-2 text-xs"
              />
            </Field>
            <Field label="Minutes">
              <input
                type="number"
                min="0"
                value={data.minutes || 0}
                onChange={(e) => update({ minutes: Number(e.target.value) })}
                className="w-full rounded border border-wa-border bg-white p-2 text-xs"
              />
            </Field>
          </div>
          <div className="text-[10px] text-wa-textMuted">
            Flow pauses; scheduler resumes it on the next tick after the wait.
          </div>
        </div>
      )}

      {type === "branch_keyword" && (
        <div className="space-y-2">
          <Field label="Match type">
            <select
              value={data.match_type || "contains"}
              onChange={(e) => update({ match_type: e.target.value })}
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            >
              <option value="contains">contains</option>
              <option value="exact">exactly</option>
              <option value="starts_with">starts with</option>
            </select>
          </Field>
          <Field label="Keyword">
            <input
              value={String(data.keyword || "")}
              onChange={(e) => update({ keyword: e.target.value })}
              placeholder="yes"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <div className="text-[10px] text-wa-textMuted">
            Looks at the contact's most recent inbound message. The green handle is the
            "match" path; gray is the "default" fallthrough.
          </div>
        </div>
      )}

      {type === "branch_condition" && (
        <div className="space-y-2">
          <Field label="Field">
            <select
              value={data.field || "tag"}
              onChange={(e) => update({ field: e.target.value })}
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            >
              <option value="tag">Tag</option>
              <option value="custom_field">Custom field</option>
              <option value="last_inbound">Last inbound message</option>
              <option value="unsubscribed">Unsubscribed status</option>
              <option value="source_type">Contact source (ad / manual)</option>
            </select>
          </Field>
          <Field label="Operator">
            <select
              value={data.op || "has"}
              onChange={(e) => update({ op: e.target.value })}
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            >
              {(data.field === "tag" || data.field === "unsubscribed") && (
                <>
                  <option value="has">has / is set</option>
                  <option value="missing">missing / not set</option>
                </>
              )}
              {data.field === "custom_field" && (
                <>
                  <option value="has">field has any value</option>
                  <option value="missing">field is empty</option>
                  <option value="equals">equals</option>
                  <option value="not_equals">does not equal</option>
                  <option value="contains">contains</option>
                  <option value="regex">matches regex</option>
                </>
              )}
              {data.field === "last_inbound" && (
                <>
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="regex">matches regex</option>
                </>
              )}
              {data.field === "source_type" && (
                <>
                  <option value="has">has a source</option>
                  <option value="missing">no source</option>
                  <option value="equals">equals</option>
                </>
              )}
            </select>
          </Field>
          <Field label={data.field === "custom_field" ? "Custom field name" : "Value"}>
            <input
              value={String(data.value || "")}
              onChange={(e) => update({ value: e.target.value })}
              placeholder={
                data.field === "tag"
                  ? "interested-solar"
                  : data.field === "custom_field"
                    ? "pincode"
                    : data.field === "source_type"
                      ? "ad"
                      : "pattern or text"
              }
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          {data.field === "custom_field" &&
            ["equals", "not_equals", "contains", "regex"].includes(String(data.op)) && (
              <Field label="Expected value">
                <input
                  value={String(data.value2 || "")}
                  onChange={(e) => update({ value2: e.target.value })}
                  placeholder="e.g. 411001"
                  className="w-full rounded border border-wa-border bg-white p-2 text-xs"
                />
              </Field>
            )}
          <div className="text-[10px] text-wa-textMuted">
            Green handle = condition matched. Gray handle = didn't match. Regex is
            case-insensitive.
          </div>
        </div>
      )}

      {type === "set_tag" && (
        <div className="space-y-2">
          <Field label="Action">
            <select
              value={data.action || "add"}
              onChange={(e) => update({ action: e.target.value })}
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            >
              <option value="add">Add tag</option>
              <option value="remove">Remove tag</option>
            </select>
          </Field>
          <Field label="Tag">
            <input
              value={String(data.tag || "")}
              onChange={(e) => update({ tag: e.target.value })}
              placeholder="e.g. interested-solar"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
        </div>
      )}

      {type === "handoff_to_agent" && (
        <div className="space-y-2">
          <Field label="Acknowledgement message (optional)">
            <textarea
              value={String(data.message || "")}
              onChange={(e) => update({ message: e.target.value })}
              rows={3}
              placeholder="One moment — connecting you with an agent."
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <Field label="Tag to add">
            <input
              value={String(data.tag ?? "needs-human")}
              onChange={(e) => update({ tag: e.target.value })}
              placeholder="needs-human"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <Field label="Assign to agent (user id, optional)">
            <input
              type="number"
              value={data.user_id ?? ""}
              onChange={(e) =>
                update({ user_id: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="Leave blank → tag only"
              className="w-full rounded border border-wa-border bg-white p-2 text-xs"
            />
          </Field>
          <div className="text-[10px] text-wa-textMuted">
            Ends the flow and hands the conversation to a human. The tagged contact shows up
            in the chats list for whoever filters by this tag.
          </div>
        </div>
      )}

      {type === "end" && (
        <div className="text-xs text-wa-textMuted">
          Ends the flow for this contact. No outgoing connections.
        </div>
      )}

      {type === "trigger" && (
        <div className="text-xs text-wa-textMuted">
          The trigger is configured at the top of the page. Connect this node to the first
          step of your flow.
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-wa-textMuted">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
