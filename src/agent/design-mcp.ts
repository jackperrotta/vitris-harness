import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { currentRunId, runDir, submitFeedback } from "./design-run.ts";
import { loadAgentComparison, loadAgentPage, resolveDesignSite } from "./design-context.ts";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

type McpCtx = { parent: string; kernel: string; runId?: string };

const TOOLS = [
  {
    name: "design_status",
    description: "Design-run status, comparison hashes, live preview URLs, and section maps for A–E. Use before asking the operator questions or synthesizing a final site.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site root that contains agent/design-runs" },
        runId: { type: "string" },
      },
    },
  },
  {
    name: "list_candidates",
    description: "List comparison candidates with labels A–E, concepts, preview URLs, and routes.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string" },
        runId: { type: "string" },
      },
    },
  },
  {
    name: "get_page_context",
    description: "HTML and section index for one candidate route (A–E or candidate-a). Use when the operator refers to a page or section.",
    inputSchema: {
      type: "object",
      required: ["candidate"],
      properties: {
        site: { type: "string" },
        runId: { type: "string" },
        candidate: { type: "string", description: "A–E or candidate-a" },
        route: { type: "string", description: "Route path, default /" },
      },
    },
  },
  {
    name: "save_notes",
    description: "Store operator free-form notes from Cursor chat. Does not start synthesis.",
    inputSchema: {
      type: "object",
      required: ["notes"],
      properties: {
        site: { type: "string" },
        runId: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "submit_feedback",
    description: "Submit validated structured design-run feedback after interpreting Cursor chat. Same path as --feedback. Drafts do not start generation.",
    inputSchema: {
      type: "object",
      required: ["feedback"],
      properties: {
        site: { type: "string" },
        runId: { type: "string" },
        feedback: { type: "object" },
      },
    },
  },
];

export function handleMcpRequest(req: JsonRpc, ctx: McpCtx): Record<string, unknown> {
  const id = req.id ?? null;
  try {
    if (req.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "vitris-design", version: "0.1.0" },
        },
      };
    }
    if (req.method === "notifications/initialized" || req.method === "initialized") return {};
    if (req.method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (req.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (req.method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
    if (req.method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
    if (req.method === "tools/call") {
      const name = req.params?.name || "";
      const args = req.params?.arguments || {};
      const text = JSON.stringify(callTool(name, args, ctx), null, 2);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } };
    }
    if (id === null || id === undefined) return {};
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${req.method}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (id === null || id === undefined) return {};
    if (req.method === "tools/call") {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } };
    }
    return { jsonrpc: "2.0", id, error: { code: -32603, message } };
  }
}

function callTool(name: string, args: Record<string, unknown>, ctx: McpCtx): unknown {
  const parent = resolveDesignSite(ctx.parent, typeof args.site === "string" ? args.site : undefined);
  const runId = String(args.runId || ctx.runId || currentRunId(parent) || "");
  if (!runId) throw new Error("No design-run. Pass runId or create one with --variants 5.");
  if (name === "design_status") return loadAgentComparison(parent, runId);
  if (name === "list_candidates") {
    const comparison = loadAgentComparison(parent, runId);
    return comparison.candidates.map(c => ({
      candidateId: c.candidateId,
      label: c.label,
      concept: c.concept,
      previewUrl: c.previewUrl,
      previewReady: c.previewReady,
      routes: c.routes.map(r => r.path),
    }));
  }
  if (name === "get_page_context") {
    if (typeof args.candidate !== "string") throw new Error("candidate is required");
    return loadAgentPage(parent, runId, args.candidate, typeof args.route === "string" ? args.route : "/");
  }
  if (name === "save_notes") {
    if (typeof args.notes !== "string" || !args.notes.trim()) throw new Error("notes is required");
    const dest = join(runDir(parent, runId), "feedback/operator-notes.md");
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, args.notes.endsWith("\n") ? args.notes : `${args.notes}\n`);
    return { ok: true, path: dest, startedSynthesis: false };
  }
  if (name === "submit_feedback") {
    if (!args.feedback || typeof args.feedback !== "object") throw new Error("feedback object is required");
    const result = submitFeedback(parent, runId, args.feedback);
    return { ok: true, duplicate: result.duplicate, summary: result.summary, startedSynthesis: result.feedback.submission !== "draft" };
  }
  throw new Error(`Unknown tool ${name}`);
}

export async function serveDesignMcp(opts: { kernel: string; site?: string }): Promise<void> {
  const parent = resolveDesignSite(process.cwd(), opts.site);
  const ctx: McpCtx = { parent, kernel: resolve(opts.kernel), runId: currentRunId(parent) };
  let buffer: Uint8Array = new Uint8Array(0);
  process.stdin.on("data", (chunk: Uint8Array) => {
    buffer = concatBytes(buffer, chunk);
    while (true) {
      const parsed = readMessage(buffer);
      if (!parsed) break;
      buffer = parsed.rest;
      const response = handleMcpRequest(parsed.message, ctx);
      if (response.jsonrpc) writeMessage(response);
    }
  });
  await new Promise<void>(resolvePromise => process.stdin.on("end", () => resolvePromise()));
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out: Uint8Array = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function indexOfBytes(buf: Uint8Array, seq: number[]): number {
  outer: for (let i = 0; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

function decodeUtf8(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

function readMessage(buf: Uint8Array): { message: JsonRpc; rest: Uint8Array } | null {
  const headerEnd = indexOfBytes(buf, [13, 10, 13, 10]);
  if (headerEnd >= 0) {
    const header = decodeUtf8(buf.slice(0, headerEnd));
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) return { message: {}, rest: buf.slice(headerEnd + 4) };
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buf.length < start + length) return null;
    return { message: JSON.parse(decodeUtf8(buf.slice(start, start + length))) as JsonRpc, rest: buf.slice(start + length) };
  }
  const nl = indexOfBytes(buf, [10]);
  if (nl < 0) return null;
  const line = decodeUtf8(buf.slice(0, nl)).trim();
  const rest = buf.slice(nl + 1);
  if (!line) return { message: {}, rest };
  return { message: JSON.parse(line) as JsonRpc, rest };
}

function writeMessage(message: Record<string, unknown>): void {
  const json = new TextEncoder().encode(JSON.stringify(message));
  process.stdout.write(`Content-Length: ${json.length}\r\n\r\n`);
  process.stdout.write(json);
}
