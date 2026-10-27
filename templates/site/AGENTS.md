# __NAME__ site agent

This site uses the Vitris active-agent workflow. The active local agent executes workflow stages directly. The harness prepares context in `agent/CURRENT.md`, executes deterministic tools, evaluates artifacts, and advances the graph.

## Active-Agent Loop

If the initial request provides a source URL, template, and additional content, record them when scaffolding with `vitris site create --from URL --template "ID or name or hosted URL" --content "exact text"` (or `--content-file FILE`). Existing sites accept `vitris run` or `npm run go -- --template ... --content-file ...` before preparing a stage. Read `onboarding/additional-content.md` alongside source evidence throughout the build. A direct template request authorizes automatic section adaptation and continuation through local preview, using existing/stock media with AI imagery disabled. Do not stop to show the template picker, ask adaptation-policy questions, or solicit representative feedback on this route. Complete the actual reference, browser, critic and quality gates; retain visible fill-ins for unsupported missing content and do not claim human design approval. With no supplied template, the interactive selection workflow still applies.

1. Run `npm run go` (or `npm run go -- --prepare`) to prepare the next eligible stage.
2. Read the stage instructions and bounds in `agent/CURRENT.md`.
3. Perform the work specified by editing allowed files in `pages/`, `components/`, `onboarding/`, or writing reviews in `agent/reviews/`.
4. Complete the stage using the command shown in `agent/CURRENT.md`:
   `npm run go -- --complete --preparation <PREPARATION_ID>`
   (Optionally report host-provided agent token usage with `--agent-input-tokens <N> --agent-output-tokens <N>`).
5. Repeat until preview is ready. The workflow advances through:
   harvest → business + review → media → narrative + review → reference analysis → direction + review → storyboard → copy + review → representative + browser + review → pages → browser → visual + content reviews → preview.

## Refinement (CLI & Chat Editing)

When making later-life changes in Cursor or chat:
1. **Discover Memory & Prepare**:
   Run `npm run go -- --change "..." --prepare` to analyze impact, detect memory drift, and capture a baseline in `agent/requests/<requestId>/baseline.json`.
2. **Edit Source Directly**:
   Target sections by `id`, `data-slot`, or `slot`. Always protect notes (`.note`), captions (`.caption`), and action CTAs (`.btn`, `.cta`) from accidental body-copy overwriting. Do not invent business facts without source evidence.
3. **Verify by Impact**:
   Run `npm run go -- --complete --preparation <PREPARATION_ID>` to evaluate that stage, then continue preparing/completing the remaining stages. Browser tool stages compile and check the site. Site memory is updated after final regression checks pass.

## Operator Guardrails

- Never mark checks passed by hand. Skip deployment review gates only when the user explicitly requests quick publish, using `vitris deploy --quick` (production requires `--environment production`); record this as build-only verification.
- Site-specific preferences belong in `agent/request.json` or site memory.
- Plan managed-kit updates with `vitris upgrade --site . --plan`, inspect conflicts, then use `--apply`. `npm run refresh-agent` is a compatibility alias. Package defaults are selected only when their recorded hashes match `agent/managed-files.json`; place site-specific instructions under `agent/overrides/`. Unknown copied-kit edits remain conflicts. `launch.json`, authored files, `agent/STATE.json`, preparations, leases, and receipts are preserved.
- Cloudflare deployment is explicit via `vitris deploy` (or `wrangler deploy`).

Two identical failures block automatic continuation. Fix the cause and use an explicit restart with a reason; ordinary resume does not reset attempts or spend. Follow parent design-stage resume instructions exactly. Active-agent reviews and independent-model reviews are labeled separately; neither implies human approval.
