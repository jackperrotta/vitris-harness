#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseImageToolReads, parseStreamJsonUsage } from "../src/agent/design-usage.ts";
import type { UsageReceipt } from "../src/agent/artifacts.ts";

export interface NodeUsageAudit {
  file: string;
  nodeId: string;
  role: string;
  adapter: string;
  model?: string;
  status: string;
  durationMs: number;
  inputTokens: number | "unknown";
  outputTokens: number | "unknown";
  totalTokens: number | "unknown";
  cacheReadTokens: number | "unknown";
  cacheWriteTokens: number | "unknown";
  unknown: boolean;
  lowerBound?: boolean;
  logSizeBytes?: number;
  promptBytesEstimate?: number;
  toolReadsCount?: number;
  imageReadsCount?: number;
  streamUsageEventsCount?: number;
  streamHasCumulativeFinal?: boolean;
}

export interface WorkflowAuditSummary {
  runDirectory: string;
  auditedAt: string;
  totalReceipts: number;
  knownTokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  unknownUsageCount: number;
  unknownNodes: string[];
  byRole: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    nodeCount: number;
  }>;
  nodes: NodeUsageAudit[];
  notes: string[];
}

export function auditRunDirectory(dirPath: string): WorkflowAuditSummary {
  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const files = readdirSync(dirPath);
  const usageFiles = files.filter(f => f.endsWith(".usage.json")).sort((a, b) => {
    const numA = parseInt(a.split("-")[0] || "0", 10);
    const numB = parseInt(b.split("-")[0] || "0", 10);
    return numA - numB;
  });

  const nodeAudits: NodeUsageAudit[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let unknownCount = 0;
  const unknownNodes: string[] = [];
  const byRole: Record<string, { inputTokens: number; outputTokens: number; cacheReadTokens: number; nodeCount: number }> = {};
  const notes: string[] = [];

  for (const uFile of usageFiles) {
    const uPath = join(dirPath, uFile);
    let receipt: UsageReceipt;
    try {
      receipt = JSON.parse(readFileSync(uPath, "utf8"));
    } catch {
      continue;
    }

    const baseName = uFile.replace(/\.usage\.json$/, "");
    const logFile = files.find(f => f === `${baseName}.log`);
    let logContent = "";
    let logSize = 0;
    let toolReads = 0;
    let imageReads = 0;
    let promptBytes = 0;
    let streamUsageEventsCount = 0;
    let streamHasCumulativeFinal = false;

    if (logFile) {
      const logPath = join(dirPath, logFile);
      try {
        logContent = readFileSync(logPath, "utf8");
        logSize = Buffer.byteLength(logContent, "utf8");
        const lines = logContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("{")) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === "user" && parsed.message?.content) {
              const text = Array.isArray(parsed.message.content)
                ? parsed.message.content.map((c: any) => c.text || "").join("")
                : String(parsed.message.content);
              promptBytes += Buffer.byteLength(text, "utf8");
            }
            if (parsed.type === "result" || parsed.usage || parsed.message?.usage) {
              streamUsageEventsCount++;
              if (parsed.type === "result" && parsed.total_tokens !== undefined) {
                streamHasCumulativeFinal = true;
              }
            }
            if (parsed.type === "tool_call" || parsed.subtype === "started" || parsed.name?.includes("read")) {
              toolReads++;
            }
          } catch {
            // ignore non-json
          }
        }
        const img = parseImageToolReads(logContent);
        imageReads = img.length;
      } catch {
        // ignore
      }
    }

    const input = receipt.usage?.unknown ? "unknown" : (receipt.usage?.inputTokens ?? 0);
    const output = receipt.usage?.unknown ? "unknown" : (receipt.usage?.outputTokens ?? 0);
    const total = receipt.usage?.unknown ? "unknown" : (receipt.usage?.totalTokens ?? ((receipt.usage?.inputTokens || 0) + (receipt.usage?.outputTokens || 0)));
    const cacheRead = receipt.providerRaw?.cacheReadTokens !== undefined
      ? Number(receipt.providerRaw.cacheReadTokens)
      : (typeof receipt.usage?.cache?.cache_read_input_tokens === "number" ? receipt.usage.cache.cache_read_input_tokens : 0);
    const cacheWrite = receipt.providerRaw?.cacheWriteTokens !== undefined
      ? Number(receipt.providerRaw.cacheWriteTokens)
      : (typeof receipt.usage?.cache?.cache_creation_input_tokens === "number" ? receipt.usage.cache.cache_creation_input_tokens : 0);

    const auditItem: NodeUsageAudit = {
      file: uFile,
      nodeId: receipt.nodeId,
      role: receipt.role,
      adapter: receipt.adapter,
      model: receipt.model,
      status: receipt.status,
      durationMs: receipt.durationMs,
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      unknown: !!receipt.usage?.unknown,
      lowerBound: receipt.usage?.lowerBound,
      logSizeBytes: logSize || undefined,
      promptBytesEstimate: promptBytes || undefined,
      toolReadsCount: toolReads || undefined,
      imageReadsCount: imageReads || undefined,
      streamUsageEventsCount,
      streamHasCumulativeFinal,
    };

    nodeAudits.push(auditItem);

    if (receipt.usage?.unknown) {
      unknownCount++;
      unknownNodes.push(receipt.nodeId);
    } else {
      if (typeof input === "number") totalInput += input;
      if (typeof output === "number") totalOutput += output;
      if (typeof cacheRead === "number") totalCacheRead += cacheRead;
      if (typeof cacheWrite === "number") totalCacheWrite += cacheWrite;

      const roleKey = receipt.role || "unknown";
      byRole[roleKey] ||= { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, nodeCount: 0 };
      byRole[roleKey]!.inputTokens += typeof input === "number" ? input : 0;
      byRole[roleKey]!.outputTokens += typeof output === "number" ? output : 0;
      byRole[roleKey]!.cacheReadTokens += typeof cacheRead === "number" ? cacheRead : 0;
      byRole[roleKey]!.nodeCount += 1;
    }
  }

  notes.push(
    "Audited token counts distinguish known recorded tokens from unknown runs (e.g. unmetered tool steps or failed executions without telemetry). Unknown is not zero."
  );
  notes.push(
    "Cache reads are reported by the provider separately from fresh input tokens. Provider billing relationships (cache-read discounts vs full input tariff) depend on provider pricing."
  );

  return {
    runDirectory: dirPath,
    auditedAt: new Date().toISOString(),
    totalReceipts: usageFiles.length,
    knownTokens: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
    },
    unknownUsageCount: unknownCount,
    unknownNodes,
    byRole,
    nodes: nodeAudits,
    notes,
  };
}

// CLI entry point
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const runsIdx = args.indexOf("--runs");
  const runsPath = runsIdx >= 0 && args[runsIdx + 1] ? args[runsIdx + 1]! : resolve("agent/runs");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : undefined;

  try {
    const summary = auditRunDirectory(runsPath);
    console.log("=== WORKFLOW USAGE AUDIT ===");
    console.log(`Directory: ${summary.runDirectory}`);
    console.log(`Receipts: ${summary.totalReceipts} (Known: ${summary.totalReceipts - summary.unknownUsageCount}, Unknown: ${summary.unknownUsageCount})`);
    console.log(`Recorded Input Tokens:  ${summary.knownTokens.inputTokens.toLocaleString()}`);
    console.log(`Recorded Output Tokens: ${summary.knownTokens.outputTokens.toLocaleString()}`);
    console.log(`Total Recorded Tokens:  ${summary.knownTokens.totalTokens.toLocaleString()}`);
    console.log(`Cache Read Tokens:      ${summary.knownTokens.cacheReadTokens.toLocaleString()}`);
    console.log(`Cache Write Tokens:     ${summary.knownTokens.cacheWriteTokens.toLocaleString()}`);
    if (summary.unknownNodes.length) {
      console.log(`Nodes with Unknown Usage: ${summary.unknownNodes.join(", ")}`);
    }
    console.log("\n--- Breakdown By Role ---");
    for (const [role, data] of Object.entries(summary.byRole)) {
      console.log(`  ${role.padEnd(10)}: ${data.inputTokens.toLocaleString().padStart(10)} in | ${data.outputTokens.toLocaleString().padStart(8)} out | ${data.cacheReadTokens.toLocaleString().padStart(10)} cache-read (${data.nodeCount} nodes)`);
    }

    if (outPath) {
      mkdirSync(dirname(resolve(outPath)), { recursive: true });
      writeFileSync(resolve(outPath), JSON.stringify(summary, null, 2));
      console.log(`\nAudit saved to: ${resolve(outPath)}`);
    }
  } catch (err: any) {
    console.error(`Audit failed: ${err.message}`);
    process.exit(1);
  }
}
