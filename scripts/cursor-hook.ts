#!/usr/bin/env node
/**
 * Cursor project hook. Reads one JSON payload on stdin, appends a minimized
 * event when a trace is recording, and always exits 0 with an allow response.
 * Stdout is only that JSON response. It must not instruct the agent.
 */
import { handleCursorHook } from "../src/agent/cursor-hook.ts";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  if (typeof chunk === "string") chunks.push(Buffer.from(chunk, "utf8"));
  else chunks.push(Buffer.from(chunk));
}
const buf = Buffer.concat(chunks);
const raw = buf.toString("utf8").replace(/^\uFEFF/, "");

let payload: unknown = {};
let stdinGap: string | undefined;
try {
  payload = raw.trim() ? JSON.parse(raw) : {};
  if (!raw.trim()) stdinGap = "stdin_empty";
} catch {
  payload = {
    hook_event_name: "unknown",
    _stdinBytes: buf.length,
    _stdinEncoding: "utf8",
  };
  stdinGap = "stdin_unparsed";
}

if (payload && typeof payload === "object" && !Array.isArray(payload) && stdinGap) {
  (payload as Record<string, unknown>)._stdinGap = stdinGap;
  (payload as Record<string, unknown>)._stdinBytes = Buffer.byteLength(raw);
}

const result = handleCursorHook({ root: process.cwd(), payload });
process.stdout.write(JSON.stringify(result.response));
if (result.warning) process.stderr.write("TRACE_ERROR: cursor hook log failed\n");
process.exit(0);
