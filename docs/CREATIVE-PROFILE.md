# Opt-in creative profile

The `creative-v1` profile is an active-agent workflow for one customer site. It is opt-in; the ordinary single-site workflow and explicit five-variant design run keep their current behavior. It stops at a verified local preview. Publishing remains separate.

New runs use orchestrator version 2. See [the detailed implementation](CREATIVE-ORCHESTRATOR.md) for the decision loop, joint creative revisions, skill/evidence retrieval, budget rules, final identity audit, contracts and recovery behavior. Creative decisions now explicitly select, revise, retire or request one justified challenger; at most two joint revisions share the original run budget. The final audit can request a targeted repair and re-verification before the finished preview is accepted.

Start from a scaffolded site with an active-agent adapter:

```text
node --experimental-strip-types scripts/workflow.ts --site SITE --creative-profile
```

The packaged CLI also accepts `vitris run --site SITE --creative`; `vitris status` and `vitris resume` recognize the current creative run.

At each pause, read `SITE/agent/CURRENT.md`, write only the listed outputs, and resume:

```text
node --experimental-strip-types scripts/workflow.ts --site SITE --creative-profile --resume
```

For creative coordinator stages (`creative-*-plan`, `creative-*-study-review`, `creative-*-decision`), **resume through `--creative-profile`**. The coordinator completes the saved preparation through the existing lifecycle. For normal child-site stages, use that site's `--complete --preparation ID`, then resume the parent profile. `--status` gives a read-only run snapshot. `--creative-retry --reason TEXT` resumes a blocked phase without resetting attempts or spend after its cause is repaired. `--creative-new` starts another run after the current one completes or blocks. After a verified preview, `--creative-profile --promote` copies the selected source into the parent site only if the parent and selected source still match their recorded revisions; the run retains a backup and an idempotent promotion receipt.

The profile freezes reviewed business and media inputs, prepares a grounded brief with two or three concept alternatives, renders homepage and interior HTML studies at 375 and 1080 pixels, and records a self-review ranking. It develops the top study as one production representative in an isolated child site using the existing direction, storyboard, copy, representative browser, and quality gates. A decision is bound to the representative's source hash. The same child site then expands through the existing full-site workflow and final browser/content/visual gates. If the representative quality gate exhausts its attempts, the candidate is retained as rejected and the next study can be developed within the remaining run budget. An optional production challenger requires an explicit reason and sufficient remaining budget; the qualified incumbent is retained for the subsequent decision.

Run records live under `SITE/agent/creative-runs/RUN_ID/`. The creative records are versioned and validated. The evidence index is site-local and derived from authoritative business/media files; it does not change those files or create a global customer knowledge store. Source excerpts remain untrusted evidence. The skill registry uses stage-local `agent/refs/` handles and validates prerequisite cycles separately from advisory links. `effective-config.json` records the confirmed operator, budget, and runtime choices. `experiment.json` and `measurement.json` distinguish verified engineering gates, self-review, unknown usage, and human preference. A local task test or agent score is not conversion evidence.

The configured iteration and duration limits remain the numeric budget policy until matched baseline runs measure time and usage. Parent and child stages share the remaining limits, and representative development reserves iterations for final verification. The profile records unmetered active-agent tokens as unknown. It does not add an operator selection gate, an external model worker, or a service scheduler. After selection, `agent/creative-identity.json` carries the exact decision and identity invariants into expansion and final review; it is part of the affected stage revisions.

For an expanded browser sweep, run `scripts/verify-browser.ts --site SITE --extra-viewports 768,1440 --motion both`. The standard 375 and 1080 pixel checks remain required; added widths and normal motion are recorded separately. The verifier uses mocked form journeys and blocks real submissions as in the existing browser gate.

To prospectively freeze a matched comparison, run `scripts/creative-evaluation.ts` with a new `--out`, at least one `--case ID:image_rich:CAPTURE` and one `--case ID:sparse_media:CAPTURE`, plus explicit `--model`, `--host`, `--runs`, `--iterations`, and `--timeout-ms`. Optional `--tokens`, `--reviewer`, `--interventions`, and `--viewports` become frozen protocol fields. `--verify --out DIR` checks source and capture hashes. The manifest enumerates every planned attempt with `unrun` status and leaves human labels empty. Use the existing trial and `compare-sites` tools to run and blind the arms; record every failed attempt and any intervention. Do not infer design superiority from engineering gates or self-review.
