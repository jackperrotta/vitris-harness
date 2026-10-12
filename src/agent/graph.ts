/** Minimal YAML subset parser for agent/graph.yaml (no dependency). */

export type GraphNode = {
  id: string;
  needs: string[];
  tools: string[];
  writes: string[];
  eval: string;
  maxAttempts: number;
  refs: string[];
  optional?: boolean;
  inputs?: string[];
  optionalInputs?: string[];
  optionalRefs?: string[];
  kind?: "agent" | "tool" | "critic";
  command?: string[];
  repair?: string;
  historicalAfter?: string;
  subjectPaths?: string[];
};

export type SkillGraph = {
  version: number;
  stop_at: string;
  nodes: GraphNode[];
};

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseInlineList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(",").map((p) => unquote(p.trim())).filter(Boolean);
}

/** Parse the Vitris agent graph YAML (intentionally small surface). */
export function parseGraphYaml(text: string): SkillGraph {
  if (text.trimStart().startsWith("{")) {
    const graph = JSON.parse(text) as SkillGraph;
    validateGraph(graph);
    return graph;
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let version = 1;
  let stopAt = "preview_ready";
  const nodes: GraphNode[] = [];
  let current: Partial<GraphNode> | null = null;
  let listKey: "needs" | "tools" | "writes" | "refs" | null = null;

  const flush = () => {
    if (!current?.id) return;
    nodes.push({
      id: current.id,
      needs: current.needs || [],
      tools: current.tools || [],
      writes: current.writes || [],
      eval: current.eval || current.id,
      maxAttempts: current.maxAttempts ?? 3,
      refs: current.refs || [],
      optional: current.optional,
    });
    current = null;
    listKey = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "");
    if (!line.trim()) continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;

    if (indent === 0 && line.startsWith("version:")) {
      version = Number(unquote(line.slice("version:".length))) || 1;
      continue;
    }
    if (indent === 0 && line.startsWith("stop_at:")) {
      stopAt = unquote(line.slice("stop_at:".length));
      continue;
    }
    if (indent === 0 && line.startsWith("nodes:")) {
      continue;
    }

    if (/^\s*-\s+id:/.test(line)) {
      flush();
      current = { id: unquote(line.replace(/^\s*-\s+id:/, "")) };
      listKey = null;
      continue;
    }
    if (!current) continue;

    if (indent >= 4 && listKey && /^\s*-\s+/.test(line)) {
      const val = unquote(line.replace(/^\s*-\s+/, ""));
      current[listKey] = [...(current[listKey] || []), val];
      continue;
    }

    const m = line.match(/^\s+([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const rest = m[2]!.trim();

    if (key === "needs" || key === "tools" || key === "writes" || key === "refs") {
      if (rest.startsWith("[")) {
        current[key] = parseInlineList(rest);
        listKey = null;
      } else if (!rest) {
        current[key] = [];
        listKey = key;
      } else {
        current[key] = [unquote(rest)];
        listKey = null;
      }
      continue;
    }
    listKey = null;
    if (key === "eval") current.eval = unquote(rest);
    if (key === "maxAttempts") current.maxAttempts = Number(unquote(rest)) || 3;
    if (key === "optional") current.optional = rest === "true";
  }
  flush();

  const graph = { version, stop_at: stopAt, nodes };
  validateGraph(graph);
  return graph;
}

export type NodeStatus = "pending" | "in_progress" | "done" | "failed";

export type CumulativeSpend = {
  iterations: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  jevCalls?: number;
  jevInputTokens?: number;
  jevOutputTokens?: number;
  agentTokensMeasured?: boolean;
  hasUnmeteredStages?: boolean;
  toolCalls?: number;
  toolDurationMs?: number;
  reviewer?: { calls: number; inputTokens: number; outputTokens: number; tokens: number; durationMs: number; reservedTokens: number; unknownCalls: number };
};

export type AgentState = {
  version: number;
  status: string;
  current: string | null;
  preview_ready: boolean;
  launched: boolean;
  iteration: number;
  cumulativeSpend?: CumulativeSpend;
  limits?: { iterations: number; tokens?: number; durationMs?: number };
  consecutiveFailures?: Record<string, number>;
  nodes: Record<string, { status: NodeStatus; attempts: number; invocationBaseline?: number; inputHash?: string; outputHash?: string; skillHash?: string; failures?: string[]; themeSelectionHash?: string | null }>;
};

export function nextNode(graph: SkillGraph, state: AgentState, opts?: { includeOptional?: boolean }): GraphNode | null {
  if (state.status === "repeated_failure_blocked") throw new Error("Repeated failure blocked. Repair the cause, then use --restart-from NODE --reason to explicitly reopen the stage.");
  for (const node of graph.nodes) {
    if (node.optional && !opts?.includeOptional) continue;
    const st = state.nodes[node.id];
    if (st?.status === "done") continue;
    const ready = node.needs.every((n) => state.nodes[n]?.status === "done");
    if (ready) {
      if ((st?.attempts || 0) >= node.maxAttempts) throw new Error(`Node ${node.id} exhausted ${node.maxAttempts} attempts`);
      return node;
    }
  }
  return null;
}

export function isPreviewReady(graph: SkillGraph, state: AgentState): boolean {
  const stop = graph.stop_at === "preview_ready" ? "preview" : graph.stop_at;
  return graph.nodes.filter(n => !n.optional).every(n => state.nodes[n.id]?.status === "done") && state.nodes[stop]?.status === "done";
}

export function validateGraph(graph: SkillGraph): void {
  if (![1, 2, 3].includes(graph.version) || !Array.isArray(graph.nodes) || !graph.nodes.length) throw new Error("Invalid graph version/nodes");
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!/^[a-z][a-z0-9-]*$/.test(node.id) || ids.has(node.id)) throw new Error(`Invalid/duplicate node: ${node.id}`);
    ids.add(node.id);
    if (!Number.isInteger(node.maxAttempts) || node.maxAttempts < 1) throw new Error(`Invalid attempts: ${node.id}`);
    if (!Array.isArray(node.needs) || !Array.isArray(node.refs) || !Array.isArray(node.writes)) throw new Error(`Invalid node contract: ${node.id}`);
    if (graph.version >= 2 && node.kind && !["tool", "agent", "critic"].includes(node.kind)) throw new Error(`Invalid node kind: ${node.id}`);
    if (node.kind === "tool" && (!Array.isArray(node.command) || !node.command.length || node.command.some(a => typeof a !== "string"))) throw new Error(`Invalid tool command: ${node.id}`);
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string): void {
    if (!ids.has(id)) throw new Error(`Unknown dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`Cycle: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of graph.nodes.find(n => n.id === id)!.needs) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const node of graph.nodes) {
    visit(node.id);
    if (!node.optional && node.needs.some(id => graph.nodes.find(n => n.id === id)?.optional)) throw new Error(`Required node depends on optional node: ${node.id}`);
    if (node.repair && !ids.has(node.repair)) throw new Error(`Unknown repair target: ${node.repair}`);
    if (node.historicalAfter && !ids.has(node.historicalAfter)) throw new Error(`Unknown historical successor: ${node.historicalAfter}`);
  }
  if (!ids.has(graph.stop_at === "preview_ready" ? "preview" : graph.stop_at)) throw new Error("Unknown stop target");
}

export function initialState(graph: SkillGraph): AgentState {
  return {
    version: graph.version,
    status: "pending",
    current: null,
    preview_ready: false,
    launched: false,
    iteration: 0,
    cumulativeSpend: { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 },
    nodes: Object.fromEntries(graph.nodes.map(n => [n.id, { status: "pending", attempts: 0 }])),
  };
}

export function invalidate(graph: SkillGraph, state: AgentState, id: string): void {
  const affected = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) {
      if (!affected.has(node.id) && node.needs.some(n => affected.has(n))) {
        // Historical checkpoints whose successors have already executed are not reinvalidated by downstream checks
        const isHistorical = node.historicalAfter && (state.nodes[node.historicalAfter]?.attempts || 0) > 0 && state.nodes[node.id]?.status === "done";
        if (!isHistorical) {
          affected.add(node.id);
          changed = true;
        }
      }
    }
  }
  for (const key of affected) {
    const previous = state.nodes[key];
    state.nodes[key] = { status: "pending", attempts: previous?.attempts || 0, ...(previous?.invocationBaseline !== undefined ? { invocationBaseline: previous.invocationBaseline } : {}) };
  }
  state.preview_ready = false;
  state.launched = false;
  state.status = "in_progress";
}
