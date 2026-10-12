# Workflow operator guide

Vitris gives your coding agent the business context, design judgment, and verification process to build distinctive websites on a consistent technical foundation. The supported loop is the active agent already in the conversation:

```text
prepare -> read agent/CURRENT.md -> inspect required evidence -> perform allowed work
-> complete with the preparation id -> evaluate -> repeat
```

`workflow-config` defaults to `active-agent` and rejects `external-worker` mode. Do not launch a different paid agent CLI as a fallback. On Windows, use `npm.cmd` when forwarding arguments after `--`. Install Chromium once with `npx.cmd playwright install chromium` when a stage needs browser capture.

From Cursor, Claude, Codex, or Antigravity: run `npm.cmd run go -- --prepare`, follow `agent/CURRENT.md`, then `npm.cmd run go -- --complete --preparation PREPARATION_ID`. Continue until verified local preview or a concrete blocker. An active-agent review receipt is not proof of an independent reviewer. Cloudflare launch stays a separate explicit operation.

Optional design assistance, without changing the default off mode:

```text
npm.cmd run go -- --design-assist --prepare
```

`--design-assist` enables advisory creative, component, and composition checks. `--jev-mode off` or `--no-jev` still wins. The preset does not turn on delegated task removal. See `docs/CLI.md`.

The sequence is harvest; business and factual review; media accounting; shared narrative brief and review; versioned reference-analysis; art direction, optional private sketches, and study review; storyboard; copy and editorial review; representative home/interior implementation, browser capture, review, and a separate design-quality gate; remaining pages; full browser checks; visual and content critics; final aggregate acceptance. Node-local required skills are loaded into CURRENT.md. Knowledge stays under `agent/refs`; do not revive always-on `.cursor/skills`.

`npm run go -- --theme "Warm editorial, tactile materials, restrained motion"` starts a new direction and downstream run. It preserves captured evidence and the business interpretation. The theme describes composition, typography, density, media treatment, interiors and surfaces as well as color. Ordinary resume preserves retry counts. A new theme request gives affected stages a new budget.

Five local website versions: `npm run go -- --variants 5 --theme "Optional theme preference" --theme-scope one` runs a design-run coordinator. Shared harvest, business review, media, narrative, and reference-analysis are generated and reviewed, then frozen; the coordinator plans five evidenced business ideas, reviews diversity, quality-qualifies production homepage/interior representatives, and expands five candidate sites sequentially. `--theme-scope all` applies the operator theme to every variant; omit `--theme-scope` with `--theme` to default to one exploratory candidate without silently inventing a different rule. `--concept-preview` stops after five quality-qualified representatives and states that interiors and full functional acceptance are incomplete. Continue that run with `npm.cmd run go -- --design-run RUN_ID --resume` (omit `--concept-preview`) or `--continue-from-concept-preview`; expansion uses the exact qualified snapshots. `--variants 5` cannot succeed with a partial set of finished sites. The command pauses at `awaiting_design_feedback` after a local comparison of complete previews; that pause is success, releases the generation lock, and does not consume retry budget. A public static comparison bundle of compiled `dist/` trees is available for remote viewing (`--design-run RUN_ID --public-bundle [DEST]`); localhost iframes are not a public artifact. The command prints the local bundle path and exits nonzero if any candidate is incomplete or unsafe.

```
npm.cmd run go -- --variants 5 --theme "Optional theme preference"
npm.cmd run go -- --design-run RUN_ID --status
npm.cmd run go -- --design-run RUN_ID --review
npm.cmd run go -- --design-run RUN_ID --feedback feedback.json
npm.cmd run go -- --design-run RUN_ID --resume
npm.cmd run go -- --design-run RUN_ID --public-bundle
```

`--review` opens a loopback comparison page with a live iframe and an Open preview link per candidate. It does not collect choices or start a final build. Leave free-form feedback in Cursor. The agent loads page context through the vitris-design MCP (`npm run design-mcp`) or `GET /api/context` and `GET /api/page` on the comparison server, then writes validated feedback with `--feedback` or the `submit_feedback` tool. Drafts never start generation. `--promote` copies a finished synthesis into the original client root after hash checks; it never deploys.

Use `--once` for one tool/stage advance and `--max N` for a per-command iteration budget. The default node limit is four attempts. Two identical completed failures block further execution; repair the cause, then use `--restart-from NODE --reason "explanation"` to explicitly reopen that work. Resume preserves attempts and spend.

The active agent performs authoring and reviews through preparations. `--timeout-ms` bounds subprocesses, not time spent in an interactive host. An optional `agent/adapter.reviewer.json` can explicitly configure the representative-quality reviewer; no author CLI is dispatched. Reviewer adapters may set `maxTokensPerCall` (default 250000). Every dispatch is reserved before launch and settled under `agent/runs/invocations`, including failures. Usage streamed by the reviewer stops a call at its reservation; delayed provider reports can overshoot, so this is not a provider billing cap. `--max-cumulative-tokens` prevents a reservation larger than the remaining known budget; unknown prior usage blocks a budgeted dispatch. Unknown active-agent usage cannot establish a total-cost cap. Receipts preserve cache fields separately.

Parent design stages use the same preparation, lease, write checks, and transactional completion as site stages. Follow the resume command in CURRENT.md: parent-stage completion is performed by `--design-run RUN_ID --resume`. Child stages use their own preparation IDs. Review provenance receipts distinguish `active_agent` and `independent_model`; neither means human approval.

`agent/runs` stores subprocess outputs, failures, elapsed time, and usage receipts. Never edit STATE to pretend an evaluation passed. Optional Cursor-chat tracing is off by default: `npm run go -- --trace-start` records prompt snapshots and harness events under `agent/runs/traces/<traceId>/` without changing stage selection or gates. See `docs/tracing.md`.

Input/output hashes invalidate stale stages on resume. Representative implementation/render/review are historical checkpoints once full pages start; final browser and critic stages own current-source acceptance. Changes to their skill contracts still invalidate historical checkpoints. Automated critics are checked for modifications to source and upstream artifacts. Hashes detect accidental staleness; they are not a security boundary against an adversarial agent with filesystem access.

Builds use a fresh staging directory, verify local asset references, copy media and public files, then swap the output into dist. Previous and failed staged builds remain alongside dist for diagnosis; clean them up when no longer needed. Browser evidence includes phone/desktop renders and route checks. Local preview acceptance does not prove a live backend received a lead, and the copy must not promise a booked appointment unless that integration exists.

Refresh from the harness with `npm run refresh-agent -- --site CLIENT_DIRECTORY` (or the site's refresh-agent script). It backs up the old kit under agent-backups, preserves launch.json, adapter config (including reviewer adapter), request history, and site memory, and migrates prior STATE as audit history without claiming new gates passed. Workflow v3 adds narrative, reference-analysis, and representative-quality nodes; existing sites get an actionable migration message and new gates start pending. Refresh does not overwrite client pages. Resume reconciles updated contracts.

Cloudflare/GitHub launch remains optional and separate. Normal go stops at local preview. See EVALUATION.md for benchmark and human preference calibration.

For subsequent updates use `npm run go -- --change "Requested change"`. Omitted `--change-scope` classifies the instruction (`copy`, `direction`, `business`, `pages`, or `media`) instead of restarting from business. A headline edit stays in copy. Replacing an image starts at media fit, not a new direction. Explicit `--change-scope business|copy|pages|direction|media|auto` still wins. A later-life change never restarts harvest. The runner seeds `agent/site-memory.json`, snapshots `agent/refine-baseline/`, invalidates only the start node and its dependents, and writes `agent/refine-report.json` next to the working preview. Copy edits skip a pages rewrite when layout hashes are unchanged, but still run content checks. Operator likes, dislikes, and preserve constraints are stored at website, page, section, and element grain. Refresh-agent preserves site memory, request history, and requests.

Harvest saves crawl-progress.json before each navigation and after each result. Interrupted runs resume the pending URL queue; a completed capture is reused on retries. Download receipts are keyed to captured page content. Use `npm run harvest -- --fresh` to explicitly recrawl a changed source. Checkpoint write failures stay persistence errors: they are retried and never treated as a Playwright launch failure, so a Windows rename lock cannot discard the crawl into fetch fallback. HTTP 4xx and crawler-invented relative URLs are classified in `onboarding/harvest-inventory.json`; they do not fail harvest unless they are transient or unvisited. Record an operator bound in `onboarding/harvest-scope.json` when a crawl is intentionally incomplete. These caches support resumability; they do not imply the remote website has stayed unchanged.

A dispatched worker receives VITRIS_WORKER_NODE and VITRIS_RUNNER_PID. Its parent owns the lock; the worker must never start another runner. For a deliberately new budget after a workflow correction, use `--restart-from NODE --reason "explanation"`. This archives prior state under agent/run-history before invalidating that node and its dependents. Ordinary retry/resume never resets budgets.

Successful go starts or reuses a loopback-only local preview server and prints its URL. `npm run preview` serves an existing dist directly. Use --no-preview-server for CI. The server receipt is agent/preview-server.json; the server stays available for local review. Storyboard redirect/consolidation decisions compile into _redirects, and the local server applies those redirects during verification and review.

Design workers produce HTML studies; they do not need permission to launch a browser. The direction-render tool stage produces real screenshots, and the next critic reviews those images. This keeps renderer access out of model subprocess configuration.

Review packets state the checkpoint's evidence boundary. Editorial review checks the truthfulness of planned actions before implementation; final content review checks the rendered destinations and available behavior evidence. Representative review covers its designated pages, while full-site review covers the complete plan. A reviewer must not require downstream artifacts that its own pass is needed to create.

Scoped changes keep per-stage request pointers under agent/requests and immutable operator evidence under agent/request-history. A later page-only request cannot replace evidence for an earlier business fact or invalidate unrelated business/copy stages on resume. The latest agent/change-request.json is an operator convenience, not a factual citation target. Status during an active run returns a read-only snapshot without taking its lock.

Use `node HARNESS/bin/vitris-eval.js --site . --hash onboarding/business.json` for artifact fingerprints; repeat --hash for multiple paths. This works without constructing platform-specific module imports. Review --subject remains the shortcut for the exact current review subject.

## Jev Lifecycle Integration & Stage Gates

Default is `mode=off`, `workOwnership=agent`. Jev inference runs only in `shadow` or `assist`. Lexical MMR / TF-IDF ranking is not Jev. Unimplemented registry tasks do not change critic gates. Delegated packet reduction requires a harness calibration artifact, not a site `eligible:true` flag.

```
+-----------------------------------------------------------------------------------+
| 1. STAGE PREPARATION (prepareStageContext)                                         |
|    - off: no Jev; CURRENT.md unchanged                                             |
|    - shadow: may infer and record receipts; consumed packet identical to off       |
|    - assist + agent: may attach grounding preflight; obligations stay with critic  |
|    - assist + delegated: only a calibrated complete task may drop covered work     |
|    - Compact packets (optional): lexical ranking + obligation partitions + manifest|
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. ACTIVE AGENT EXECUTION                                                         |
|    - Worker loads CURRENT.md                                                       |
|    - On-demand expansion re-hashes disk bytes against the coverage manifest        |
|    - Service failure / incomplete coverage restores the full critic obligation     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. STAGE COMPLETION (completeStage)                                               |
|    - Validate output identity, schemas, artifact hashes, and tool evidence        |
|    - Verify task manifests against receipts when assist grounding ran             |
|    - Apply existing critic review gate: accept, request repair, or escalate       |
|    - Commit STATE.json, append usage receipts, and update Evidence Ledger         |
+-----------------------------------------------------------------------------------+
```

### Key Stage Gates

1. **The critic stage retains full authority.** Assist preflight is supplementary. The critic review schema still accepts, requests repair, or escalates. `off` and `shadow` do not change that packet.
2. **Delegated reduction is fail-closed.** A named obligation is removed from CURRENT.md only when harness calibration, applicability, coverage, current manifests, remaining budget, and `workOwnership=delegated` all pass. Every other path restores the work.
3. **Task execution verification.** Assist-mode complete checks saved manifests against receipts (model, question semantics, `stateHash` ∈ `batchStateHashes`). Missing or stale manifests fail closed.
4. **Code helpers that are not Jev-delegated gates:** `auditExtractionCompleteness`, `traceClaimLineage` / `detectBrokenLineage`, and `verifyRepairResolution` exist and have unit tests. They are not production lifecycle callers and do not authorize delegation.
