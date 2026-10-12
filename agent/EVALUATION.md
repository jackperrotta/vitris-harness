# Evaluating workflow changes

Freeze harness source and eligible captures before comparisons. Preserve baselines. Keep development and held-out cases separate; never tune prompts against held-out results. Private customer experiments and operator preference records are not distributed here.

Acceptance has three layers:

1. Deterministic contracts and actual browser checks establish evidence freshness, coverage, assets, routes, rendering, and functionality. A pass flag alone is insufficient.
2. Critic stages assess business accuracy, composition, copy, media treatment, and coherence. Unknowns and major defects fail. Findings state location, evidence, repair target, and verification. Machine judgments remain fallible.
3. Human pairwise labels establish personal design preference. `scripts/compare-sites.ts --left SITE --right SITE --out NEW_DIRECTORY` freezes randomized A/B evidence and creates empty labels. Fill after inspection; use `--report --out DIRECTORY` for status. Never fabricate labels or call an unlabeled run calibrated. Set-level feedback does not imply individual ranks.

Design-run selection (`go --variants 5` then `--review`) is an unblinded selection UI. Choosing a gallery does not establish an overall preference vote. Weak fixtures test discrimination; they are not production templates.

Use authorized material. Record source URL/capture hash, routes/assets, verified claims, primary action, harness revision, model/host and reviewer configuration, viewports, time limits, and permitted interventions. Design references inspire layout; they do not supply business facts. Run at least three independent attempts per development case with the same inputs. Preserve every failure, repair, duration, and intervention. Report successes divided by all attempts, median and range. Usage/cost remains unknown without trustworthy receipts.

Compare candidate and baseline at identical viewports using anonymous A/B evidence, retaining tie/neither and independent overall/element labels. Visual capability verification uses original fictional `design-system/calibration/v2/probe.png` (token `2E6BFF`) and the reading probe in its manifest. Tool access alone does not establish visual accuracy. Unknown calibration fails closed. External model calls require an explicitly configured reviewer and authorized spending.

Operator-created cases belong under `design-system/evals/` and begin unlabeled. Record independent AI judgments before exposing human labels. Agreement requires both label sets and unchanged frozen evidence. Small samples or a single comparison cannot establish a reliable win.

Run `npm run trial -- --capture FROZEN_SITE --out artifacts/trials/CASE --runs 3 --prepare-only`, then `--resume`/`--status`. `awaiting_agent` remains pending. Read CURRENT.md, complete that preparation through the harness, and resume. The driver never launches an author CLI. Record interventions; keep failures in the denominator and preserve usage coverage.

Refinement comparisons use independent copies of an authorized frozen site with identical sequential requests and budgets, one with the harness and one without its workflow. Measure request fulfillment, regressions, factual accuracy, human preference, time, and trustworthy usage after each edit. Preserve captures and earlier attempts. Unrun comparisons remain unlabeled.

Final browser checks reject links, forms, and embeds dependent on replaced legacy routes. A reachable old-site URL does not establish a durable migrated integration. Verify desktop/mobile cookie preferences: rejection, cleanup, stopped timers, reload persistence, and reacceptance.
