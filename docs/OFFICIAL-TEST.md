# Official harness test

This protocol starts a prospective experiment from the upgraded harness. Historical N0 archives and previous Slate/Counsel results remain unchanged. Passing engineering checks does not establish a human preference win.

## Freeze and engineering acceptance

Install dependencies with `npm ci` and Chromium with `npx playwright install chromium` (`--with-deps` on Linux if needed). Run:

```text
npm run test:freeze
```

The command runs typecheck, builds the CLI, runs the full test suite, packs and installs the package in a disposable project, scaffolds and builds a smoke site, and verifies a restored source archive against the source manifest. All checks must pass with unchanged input bytes. A failed run keeps its logs and cannot be labeled ready. The source archive requires the standard `tar` utility available on supported Windows/Linux hosts.

Each new `artifacts/official-test/TIMESTAMP/` contains `baseline.json`, per-file hashes, source archive, package archive, installed smoke site and logs. `ready_for_official_test` means engineering acceptance only. It explicitly records `designComparison: unrun` and `humanPreference: unlabeled`.

Use `node --experimental-strip-types scripts/freeze-test-baseline.ts --out NEW_DIRECTORY` to select another artifact directory. Historical baselines remain immutable.

Scratch experiments and earlier failed builds remain on disk but are excluded from Git and npm. The suite's fictional continuation fixture is now under `src/test/fixtures/active-agent-site`. A new checkout needs no historical pilot directory. Generated CLI JavaScript is rebuilt before tests/package creation.

## First prospective run

Use three fresh single-site runs per development case: an image-rich business and a sparse-media business. Use frozen, eligible capture directories; do not recrawl between repetitions. Record the capture hash, source baseline, model and host version, reviewer config, viewport requirements, time bounds, and permitted interventions before starting. Keep held-out cases sealed.

```text
npm run trial -- --capture FROZEN_CAPTURE --out artifacts/trials/CASE --runs 3 --prepare-only
npm run trial -- --out artifacts/trials/CASE --resume
npm run trial -- --out artifacts/trials/CASE --status
```

The standard path uses the active agent and Jev off. `--reviewer FILE` at creation snapshots an explicitly selected representative-quality reviewer. No external author CLI is launched. Work one run at a time without copying generated solutions across repetitions. For an `awaiting_agent` run, read its `agent/CURRENT.md`, perform only that stage, and complete it:

```text
node --experimental-strip-types scripts/ralph.ts --site RUN_ROOT --complete --preparation PREPARATION_ID --no-preview-server
npm run trial -- --out artifacts/trials/CASE --resume --run 1
```

Repeat until `verified_preview` or a concrete terminal outcome. Before an intervention, record it with `--intervention "reason"` on the trial resume. Explicit restarts remain in the site's run history. Every attempt stays in the denominator; do not discard a technical failure and replace it with a fresh success. New trial manifests use version 5: frozen capture bytes, kernel, configuration, and treatment changes still mark `inputs_changed` permanently. Added recovered or stock media are validated at media completion and on resume with the same byte and inventory contract. On resume, a successful consumed media preparation and unchanged media outputs checkpoint newly registered bindings before the next stage; later additions reopen media. Missing metadata before acceptance routes to media; changed accepted bytes, removed accepted hash bindings, and unexpected paths fail integrity. Version 4 terminal sessions retain their original result. Unknown usage remains unknown.

## Spending and review limits

Set a reviewer reservation (`maxTokensPerCall` in `agent/adapter.reviewer.json`) before the trial. The default reservation is 250,000 tokens. Dispatch is recorded before launch; failures, interrupted calls, and unknown usage remain in the ledger. A cumulative token limit blocks dispatch if the remaining known allowance cannot cover the reservation. Unsettled calls block dispatch; unknown usage cannot establish remaining budget. Active-agent tokens need host usage evidence; the harness cannot meter a host that does not expose it.

When a host supplies trustworthy usage, save its export as JSON with `schemaVersion:1`, `source:"host_export"`, the exact `preparationId`, and non-negative `inputTokens` and `outputTokens`. Complete with `--agent-usage-receipt PATH`; the harness records the export hash with the preparation's usage receipt and rejects a second usage submission. Manual token flags remain partial/unmetered. Hosts without an export may continue only under the declared unmetered iteration/time protocol; a total-token ceiling still fails closed.

The runner stops a reviewer when streamed usage reaches the reservation. Providers may report usage only after a turn or invocation, so a call can overshoot before it is stopped. This is not a provider-side billing cap. A paid test requiring a strict monetary cap needs an externally enforced provider budget. Do not silently increase a ceiling after an overrun.

Cumulative ceilings persist in STATE across commands. Changing one requires an explicit `--reason` and creates an audit record; it never erases spend. Trial budget arguments are pinned when the session is created. A trial with changed bounds requires a new protocol. Unknown active-agent usage blocks continuation under a total token ceiling; completion of already-prepared work can still record its outcome.

Review provenance records `active_agent` or `independent_model`, bound to a preparation and subject. Human preference labels are separate. Neither type of AI review is human approval.

## Outcomes and comparison

Report verified previews/all attempts, factual errors, browser failures, repeated-failure blocks, repairs, operator interventions, stage durations, measured token totals and metering coverage. Retain the full range and median, not only the best run. The first run establishes operational readiness; it does not establish comparative design improvement.

To test design improvement, freeze both arms and the comparison protocol before generation. Hold inputs, host/model, reviewer, requests and bounds constant. Use `scripts/compare-sites.ts` to create randomized A/B views of completed builds at identical viewports. Keep tie/neither, overall preference and criterion labels; leave absent labels blank. Do not treat the historical incomplete Slate/Counsel trials as matched controls. Report small-sample results as descriptive evidence.

Before adding/removing graph checkpoints, compare their observed failure detection and repair benefit against their measured cost. Keep the factual and browser gates while that evidence is collected.
