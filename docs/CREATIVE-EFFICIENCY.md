# Creative context preset

`--creative-efficiency` is the recommended opt-in preset for the next supervised customer build. The active agent writes the site, inspects rendered pages, selects a direction, and completes the final review. The endpoint is a verified local preview; publishing is a separate action. The ordinary creative path remains available.

## Start and resume

From the harness repository, use the packaged CLI. `SITE` is an existing site kit, not the harness repository:

```powershell
node bin/vitris-go.js --site SITE --creative-profile --creative-efficiency
node bin/vitris-go.js --site SITE --creative-profile --resume
node bin/vitris-go.js --site SITE --creative-profile --status
```

The first command starts or resumes a run. Read `SITE/agent/CURRENT.md`, write only its declared outputs, then use `--resume` to validate and advance the coordinator. Child production stages use the **ordinary** packaged stage commands printed in the child's `agent/CURRENT.md`:

```powershell
node bin/vitris-go.js --site CHILD --prepare
node bin/vitris-eval.js --site CHILD --node NODE --json
node bin/vitris-go.js --site CHILD --complete --preparation PREPARATION_ID
```

Do not pass `--creative-profile` to a child stage completion. Use `--status` for a read-only snapshot. `SITE/agent/creative-runs/CURRENT.json` identifies the active run. To run without external Jev, add `--no-jev` at the **start**. `--jev-mode shadow` records advice without applying it; `assist` applies validated optional choices. Resume with the frozen mode and policy. An incompatible packet version reports that the old preparation must be completed or explicitly replaced; it never silently changes an outstanding `CURRENT.md`.

The current prepared packet supplies an exact expansion command when required context is partitioned:

```powershell
node bin/vitris-eval.js --site SITE --node NODE --expand-packet EXPANSION_ID --manifest-hash HASH
```

The manifest at `SITE/agent/runs/NODE.manifest.json` lists required and optional expansion IDs, source identities, hashes, included and missing evidence, render bindings, and coverage status. Expand every `requiredExpansionId` before completion. Expansion delivery is recorded in `packet-expansions.log`; an invalid ID or tampered content is rejected without a successful delivery record. Optional handles can be opened when useful. Expansion delivery proves bytes were supplied, not that the agent understood them or inspected pixels.

## What enters context

The prepared `CURRENT.md` carries the execution contract and a short role method, current business goal and visitor tasks, supported facts and excerpts, important constraints, selected identity, findings, accepted source changes, and current render pointers. Effective site instructions keep their provenance and content hashes. Larger site overrides remain mandatory through complete named expansion groups when they cannot safely fit in the visible packet. Optional reference material is exposed through separate handles. The coordinator measures the entire prepared `CURRENT.md`, including lifecycle wrappers; the default soft target is 16 KiB and required obligations take priority over it.

Coverage is `complete`, `requires_expansion`, `incomplete`, or `blocked`. Missing fact support, an absent render, a stale source or viewport receipt, or an undelivered required expansion cannot be reported as complete. The packet points to the source or render gate needed for recovery. A local page change narrows the next intermediate review to that route; a shared or unknown dependency broadens it. Final browser, visual, and visitor-task review still covers the whole site.

Jev assists with bounded optional skill selection, evidence relevance, and a located revision's repair domain. It does not select the design or accept quality. Malformed or unavailable replies fall back to deterministic context. Off, shadow, assist, and fallback behavior are covered by fixture tests. The existing Jev accounting and limits are preserved; accounting findings 1–2 remain deferred.

## Local preview and limits of evidence

The final `--resume` reports `Verified creative preview` and a loopback URL after the child preview gate passes. The compiled site is in the selected child `dist/`. The URL is local to the running machine. If it is no longer serving, resume or run the child preview stage again; do not infer a deployed site from a `dist/` folder.

The isolated fictional smoke run and current measurements are recorded in [the readiness report](../artifacts/creative-readiness-20260928/readiness.md). It used `--no-jev`, so it demonstrates deterministic packaging and visual gates rather than live Jev quality or cost. Packet bytes are context measurements, not measured provider tokens. Human preference, conversion lift, external email delivery, and a paid-token comparison remain unmeasured; none is a prerequisite for starting the next supervised customer site.
