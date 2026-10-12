# Vitris Unified CLI & Automation Contracts

The `vitris` CLI (`@vitris/harness`) provides a unified, operator-friendly command line interface and automation harness for creating, running, refining, evaluating, sharing, and deploying static websites.

---

## 1. Installation & Binary

After the first registry release, install as a dependency or run via `npx`. Until then use the tarball instructions in [distribution](DISTRIBUTION.md):

```bash
npm install --save-dev @vitris/harness
npx vitris --help
```

Within the `@vitris/harness` repository itself:
```bash
npm run build:cli
node bin/vitris.js --help
```

---

## 2. Command Reference

### `vitris doctor`
Runs environment and preflight health checks.
```bash
vitris doctor [--site <dir>] [--provider cloudflare] [--operation pages|deploy] [--json]
```
Checks:
- Node.js runtime version (`>= 24`)
- Git availability and worktree cleanliness
- Wrangler installation and authentication
- Site configuration (`launch.json`, `package.json`, `agent/graph.yaml`, `agent/STATE.json`)
- Active process lock (`agent/RUN.lock`)
- Pending transaction recovery journals (`.journal.json`)
- Cloudflare dual authentication (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` or interactive OAuth via `wrangler whoami`)
- Scoped resource validation (Pages vs D1/R2)

---

### `vitris site create`
Scaffolds a new customer or project site repository with the workflow graph, agent kit, and configuration.
```bash
vitris site create --dir <target-path> --slug <site-slug> [--name <display-name>] [--from <source-url>] [--owner <email>] [--blank] [--force] [--dry-run]
```
Options:
- `--dir`: Target directory for the new site.
- `--harness`: Dependency spec (defaults to this package's exact version); before registry publication, use a tarball or explicit `file:` path relative to the new site.
- `--backend-origin`: Optional backend URL, saved as `launch.json.backendOrigin`. Legacy `--kernel` and `--kernel-origin` flags remain accepted.
- `--slug`: Unique identifier for the site (used in Cloudflare Pages project names).
- `--name`: Human-readable site name.
- `--from`: Live website URL to harvest and crawl.
- `--template`: Catalog template ID, display name, or hosted demo/preview URL. Records the supplied choice and continues through local preview without the selection artifact or adaptation/representative-feedback prompts. The choice is bound after harvest and media auditing so branding uses captured evidence. This route delegates section adaptation to the agent and uses existing, harvested, or stock media; AI image generation is disabled. Reference inventory, critic, fidelity, browser, and quality gates still apply. Missing content remains a visible fill-in and blocks launch.
- `--template-release`: Optional catalog revision for an ID/name; a hosted URL pins its revision automatically.
- `--content` / `--content-file`: Additional business content and instructions, supplied inline or from a UTF-8 file (up to 256 KB; choose one). Wording is preserved in `onboarding/additional-content.md`, survives harvesting, and is included in authoring and review dependencies.
- `--owner`: Site owner contact email.
- `--blank`: Initialize without a live source URL (skips initial crawl).
- `--force`: Overwrite existing files in non-empty directory.
- `--dry-run`: Preview directory scaffolding actions without touching disk.

Provide the source, template, and extra content together:

```bash
vitris site create --dir ../acme --slug acme --from https://old-site.example --template "Still & Field" --content-file ./acme-notes.md --harness file:../vitris-harness
```

Open the new site in your coding agent and continue the prepare/work/complete loop with `npm run go` until local preview is ready. The same inputs work with `vitris-create-site` and `npm run create-site -- ...`. When the initial chat already names a template and supplies content, the agent should pass them at setup and continue the workflow without asking the user to select that template again.

---

### `vitris run`
Executes single-variant or multi-variant site generation workflows.
```bash
vitris run [--site <dir>] [--variants 1|5] [--theme <theme-name>] [--theme-scope all|one] [--restart-from <node>] [--reason <text>] [--jev-mode off|shadow|assist] [--compact-packets] [--dry-run]
```
Options:
- `--site`: Path to the site repository (defaults to `.`).
- `--template`, `--template-release`, `--content`, `--content-file`: The same direct inputs as site creation, also accepted by `npm run go -- ...`. Supply them at run start or preparation, after finishing/canceling any active stage. An identical request preserves the selection identity and history; a revised choice uses normal downstream invalidation. Later explicit picker/chat choices take precedence until a new direct request is supplied. Dry runs validate inputs without saving them. Redesign inputs are rejected in preserve mode.
- `--variants`: Number of design directions to generate (`1` or `5`). Default: `1`.
- `--theme`: Explicit design theme or direction.
- `--theme-scope`: In 5-variant runs, apply theme to `all` variants or `one` variant.
- The active host supplies the author/model. Legacy `--adapter` and `--model` options do not provide unattended author execution. Configure an independent representative-quality reviewer explicitly in `agent/adapter.reviewer.json` if needed.
- `--restart-from`: Invalidate and restart from a specific graph node.
- `--reason`: Required rationale when using `--restart-from`.
- `--jev-mode`: Bounded semantic decision mode (`off`, `shadow`, `assist`). Default: `off`.
- `--design-assist`: One preset that sets mode to `assist` and enables `creativeScoring`, `componentSelection`, and `compositionCheck` when those capabilities were not explicitly set. `--jev-mode off` and `--no-jev` win. Explicit `"creativeScoring": "off"` in `agent/jev.json` stays off. This preset does not enable `workOwnership: delegated`.
- `--no-jev`: Force mode `off`.
- `--compact-packets`: Enable bounded context packet slicing and coverage manifests.
- `--dry-run`: Preview workflow execution plan without launching agent loops.

---

### Jev Decision Service & Evaluation Tooling

#### Usage Audit:
Audit recorded tokens, cache reads, and provider stream events across site runs:
```bash
node scripts/audit-workflow-usage.ts --runs <runs-directory> [--out <output-json>]
```

#### Evaluation Harness:
Run comparative benchmarking across the 3 treatments (baseline, compact packets, compact + Jev):
```bash
node scripts/eval-jev.ts [--mock|--live] [--runs <count>] [--out <output-json>]
```

#### Packet Expansion:
Expand a partitioned context item on demand during active-agent execution:
```bash
node scripts/eval-site.ts --site <dir> --expand-packet <expansion-id> --node <node-id>
```

---

### `vitris refine`
Performs targeted, post-launch site refinements using intelligent scope routing, layout preservation, and verifiable regression constraints.
```bash
vitris refine [--site <dir>] --request "<instruction>" [--scope copy|direction|pages|business] [--force] [--dry-run]
```
Options:
- `--request`: Natural language change request from operator.
- `--scope`: Optional explicit scope override. If omitted, the classifier automatically routes to `copy`, `direction`, `pages`, or `business`.
- `--force`: Bypass non-critical gate warnings.
- `--dry-run`: Preview classified scope, rationale, and proposed change plan.

Key Invariants:
- Never restarts harvest.
- Unchanged sections and navigation structure are preserved with AST-level integrity.
- Recoverable file replacement with rollback on validation failure.
- Violating navigation links or dropping media triggers fail-closed rejection (exit code 4).

---

### `vitris status`
Inspects the current state of a site workflow or design run.
```bash
vitris status [--site <dir>] [--run <run-id>] [--json]
```
Reports active node, attempt counts, preview status, and lock ownership without altering progress or acquiring locks.

---

### `vitris resume`
Resumes a paused, interrupted, or checkpointed workflow.
```bash
vitris resume [--site <dir>] [--run <run-id>] [--dry-run]
```

---

### `vitris cancel`
Safely terminates an active workflow run, releases process locks (`agent/RUN.lock`), and cleans up stale temporary files.
```bash
vitris cancel [--site <dir>] [--run <run-id>]
```

---

### `vitris feedback import`
Imports structured stakeholder feedback for multi-variant design review.
```bash
vitris feedback import [--site <dir>] [--run <run-id>] --file <feedback.json> [--dry-run]
```

---

### `vitris synthesize`
Synthesizes stakeholder feedback across 5 variants into a unified, high-quality final site candidate.
```bash
vitris synthesize [--site <dir>] [--run <run-id>] [--feedback <feedback.json>] [--dry-run]
```

---

### `vitris verify`
Evaluates build verification and all deterministic graph gates.
```bash
vitris verify [--site <dir>] [--json] [--dry-run]
```
Returns structured gate summaries and exit code `0` (pass) or `1` (gates failed).

---

### `vitris preview`
Serves the local static `dist/` bundle with Single-Page Application (SPA) routing, migration redirect emulation, and cookie compliance sandboxing.
```bash
vitris preview [--site <dir>] [--port <number>] [--dry-run]
```

---

### `vitris deploy`
Builds a verified production bundle and deploys it to Cloudflare Pages.
```bash
vitris deploy [--site <dir>] [--provider cloudflare] [--environment preview|production] [--branch <branch>] [--dry-run]
```
Workflow:
1. Scoped preflight check verifying Cloudflare credentials (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` or `wrangler login`).
2. Build verified static `dist/` bundle (aborts if build fails or is dirty).
3. Executes `npx wrangler pages deploy dist --project-name=<slug>`.
4. Executes automated remote smoke check against the deployed `*.pages.dev` URL.

---

### `vitris share`
Launches an authenticated preview or interactive multi-variant comparison review server.
```bash
vitris share [--site <dir>] [--run <run-id>] [--port <number>] [--dry-run]
```

---

## 3. Automation Contracts

The `vitris` CLI is designed for programmatic execution in CI/CD pipelines, agent harnesses, and orchestration scripts.

### Stable Exit Codes

| Code | Constant | Meaning |
| :---: | :--- | :--- |
| `0` | `SUCCESS` | Command completed successfully. |
| `1` | `GATES_FAILED` | Graph evaluation or quality verification failed. |
| `2` | `CONFIG_OR_CLI_ERROR` | Missing or invalid arguments, configuration, or environment. |
| `3` | `PRECONDITION_FAILED` | Directory already exists, required predecessor not finished. |
| `4` | `REFINEMENT_REJECTED` | Proposed refinement caused a regression (e.g. dropped route or missing asset). |
| `5` | `ABORTED` | Execution canceled via signal (`SIGINT`, `SIGTERM`, `AbortSignal`). |
| `6` | `DEPLOYMENT_FAILED` | Cloudflare Pages deployment or remote smoke check failed. |

### Structured Output Modes

`--json` and `--events` are **strictly mutually exclusive**:
- `--json`: Emits exactly one valid JSON envelope to `stdout` upon completion.
- `--events`: Streams timestamped NDJSON events (`{"type": "...", "timestamp": "...", ...}`) to `stdout`.

#### Standard JSON Envelope Schema
```json
{
  "ok": true,
  "exitCode": 0,
  "summary": "Human-readable summary message",
  "data": {},
  "failures": [],
  "error": "Error message if ok is false"
}
```

### Security & Credential Isolation

- Tokens, passwords, and API secrets are **never** logged to stdout, stderr, or event streams.
- Credentials are **never** written into `launch.json`, prompts, or artifacts.
- Subprocesses receive environment variables directly via secure process inheritance.

---

## 4. Programmatic TypeScript API

The CLI features are also exported as an ES Module TypeScript API:

```typescript
import {
  createSite,
  runDoctor,
  runSite,
  refineSite,
  statusSite,
  resumeSite,
  cancelSite,
  importFeedback,
  synthesizeSite,
  verifySite,
  previewSite,
  deploySite,
  shareSite,
  EXIT_CODES,
} from "@vitris/harness/cli";

// Example: Run doctor preflight
const doctorResult = await runDoctor({ site: "./my-site", provider: "cloudflare" });
if (!doctorResult.ok) {
  console.error("Doctor failed:", doctorResult.summary);
}

// Example: Refine copy with AbortController
const controller = new AbortController();
const refineResult = await refineSite({
  site: "./my-site",
  request: "Update homepage headline to emphasize local reliability.",
  signal: controller.signal,
});
```


### Reproducible harness checks and trials

`npm run test:freeze` runs typecheck, CLI build, the full tests, a packed install/build smoke check, and source archive round-trip verification. It writes a new baseline under `artifacts/official-test/`. See [official test protocol](OFFICIAL-TEST.md) for trial creation, active-agent continuation, spend limitations, and outcome labeling.
