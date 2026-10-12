# Cursor chat workflow tracing

Temporary, opt-in records for website builds performed in an interactive Cursor chat. Tracing is **off by default**. It does not change stage selection, retry budgets, evaluators, or allowed-write guards.

Do not add a background model worker or a Cursor CLI/API key. Cursor chat still performs agent and critic stages; the kernel still prepares `agent/CURRENT.md`, runs deterministic tool stages, and evaluates completion.

## Start and stop

From a site repo:

```bash
npm run go -- --trace-start --trace-label "pilot-1"
npm run go -- --prepare
# follow agent/CURRENT.md in Cursor chat
npm run go -- --complete --preparation <id>
npm run go -- --trace-attach path/to/exported-chat.md [--preparation <id>]
npm run go -- --trace-stop
npm run go -- --trace-summary
```

`--trace-summary` without `--trace` uses the **active** recording session if one exists, otherwise the **most recently stopped** (or superseded) trace via `agent/runs/traces/last.json`. After the documented stop command, that no-ID summary is the normal operator flow. Pass `--trace <id>` when `last.json` is missing, the pointed-at trace was removed, or you need a different session.

`--trace-stop` writes `summary.md` / `summary.json`, prints the summary path, and leaves the stopped trace on disk for later `--trace-attach` and review. `--status` / `--trace-status` are read-only. After `--trace-start`, later `go`, `--prepare`, and `--complete` calls join the same session without repeating a flag. An interrupted process resumes that session. `--trace-start` again closes the previous recording session (evidence is kept) and mints a new ID.

Equivalent kernel script:

```bash
node --experimental-strip-types <kernel>/scripts/trace.ts --site . start --trace-label "pilot-1"
node --experimental-strip-types <kernel>/scripts/trace.ts --site . attach exported.md
node --experimental-strip-types <kernel>/scripts/trace.ts --site . stop
node --experimental-strip-types <kernel>/scripts/trace.ts --site . summary
node --experimental-strip-types <kernel>/scripts/trace.ts --site . cleanup --trace <traceId>
```

## What is stored

Private local files under `agent/runs/traces/<traceId>/`:

| Path | Contents |
| --- | --- |
| `manifest.json` | Schema version, trace ID, site, times, kernel revision, status, Cursor export paths, owned preparation IDs, prompt snapshot hashes, warnings |
| `events.jsonl` | `stage_prepared`, `stage_completed`, `tool_completed`, `stage_invalidated`, plus lifecycle metadata `run_finished` / `cursor_attached` |
| `prompts/<preparationId>.md` | Bytes copied from `agent/CURRENT.md` at snapshot time, with a hash compared to `StagePreparation.promptHash` |
| `cursor/` | Operator-attached Markdown exports (raw bytes + hashes) |
| `cursor-events.jsonl` | Minimized Cursor hook events, only while a trace is recording |
| `summary.json` / `summary.md` | Derived timeline for **this trace only**, retries, hook coverage, prompt-integrity warnings |

`agent/runs/traces/active.json` is the recording pointer. `agent/runs/traces/last.json` remembers the most recently stopped or superseded trace so a no-ID summary still works.

Each summary is isolated to that trace's stage events and the preparation IDs it recorded. It does not ingest every file in `agent/preparations/`. Stop and export-attachment events are lifecycle metadata, not stage rows. If a trace owns a preparation and the completion event is missing, the report merges the authoritative preparation record into that same stage and labels the missing event.

Tool attempts are keyed by receipt path (or iteration receipt identity), not by duration or exit code. Two real attempts with the same duration and exit both appear; replaying one receipt appears once. Each tool row links its own receipt and log.

## Prompt snapshot integrity

A matching snapshot is labeled `verified`. If `CURRENT.md` changed between publication and snapshot, the report records a **WARNING** with preparation ID, expected hash, actual hash, and snapshot path. That prompt's fidelity is `unverified` in both JSON and Markdown. The file is **not** labeled as the prompt Cursor consumed. Tracing is diagnostic: a snapshot mismatch does not change the workflow evaluator's result.

## Keep traces local

New sites ignore `agent/runs/traces/` via `templates/site/.gitignore`. Existing sites should add:

```
agent/runs/traces/
```

Trace data may include customer details, URLs, prompts, source excerpts, and terminal output. It is not part of public design bundles or deploy artifacts. Refresh-agent already strips `agent/runs`. Remove one session with `--trace-cleanup --trace <id>`; this never deletes all of `agent/runs`.

See `docs/plans/cursor-export-capability-report.md` for Cursor Markdown export coverage. That report is not a live UI export: no Export Transcript file was produced. Kernel traces currently show the prepared prompt, evaluator result, inferred file changes, and deterministic tool receipts. Cursor tool calls stay unobserved unless opt-in project hooks are installed.

## Opt-in Cursor hooks

Hooks are not installed on new sites. On a disposable site:

```bash
node --experimental-strip-types <kernel>/scripts/trace.ts --site . cursor-hooks install
npm run go -- --trace-start
# open Cursor on this site, then run the build
npm run go -- --trace-stop
npm run go -- --trace-summary
node --experimental-strip-types <kernel>/scripts/trace.ts --site . cursor-hooks remove
```

Start the trace before the build prompt so the first tool call can join it. The hook process reads `agent/runs/traces/active.json` and exits successfully without writing when nothing is recording. Events go to `cursor-events.jsonl` for that trace only.

Hook rows are labeled `observed_by_cursor_hook`. They do not replace the kernel prompt, evaluator result, state transition, or deterministic tool receipt. A hook event is tied to a preparation only when that preparation was active at the event time. File contents, secrets, email, hidden reasoning, and full terminal output are omitted. Prompt text is off unless `VITRIS_TRACE_PROMPT_TEXT=1`. A `transcript_path` is recorded only as existence, a path hash, and coverage `uninspected`; the transcript is not copied. Agent token usage stays `unknown` unless measured counters are supplied for the same conversation. Prompt length remains a proxy.

See `docs/plans/cursor-hook-capability-report.md` for fields observed from Cursor 3.21.13. MCP calls were not exercised in that pilot. The record is not a complete model transcript.

Cursor's Enterprise OpenTelemetry export can report token and organization-level tool totals, but those tool metrics are not per conversation. It is optional and is not a substitute for these local hook events. See [Cursor OpenTelemetry Export](https://cursor.com/docs/enterprise/opentelemetry-export).

`--trace-cleanup --trace <id>` removes that trace and does not change `.cursor/hooks.json`. `cursor-hooks remove` drops only Vitris-managed hook entries and leaves trace files in place.
