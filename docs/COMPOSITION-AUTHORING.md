# Composition authoring: opt-in implementation status

The compatible default remains `blocks-v0`. To opt a disposable or explicitly approved site into the new method, set in its site-owned `launch.json`:

```json
"designAuthoring": { "mode": "composition-v1", "lessonRelease": "2026-09-28.1" }
```

An absent `designAuthoring` field selects `blocks-v0`. Unknown modes and lesson releases fail explicitly. `designLibraryProfile` remains independent and still restricts optional copied blocks. Managed instruction upgrades use `vitris upgrade --site SITE --plan` before `--apply`; they do not rewrite `launch.json`. Changing the authoring policy reopens the affected design stages from reference analysis onward without requiring reharvest.

The v3 release is an advisory extension of the existing v2 requirements. Its 24 bodies, compact catalog, source summaries, and 72 contrasting scenario records are hashed in `design-system/knowledge/v3/manifest.json`. Runtime loading checks the pinned release, v2 dependency, file paths, hashes, IDs, and example roles. The scenario records describe two applications and one counterexample per lesson. Their visual fixtures, compiled captures, and inspection records remain pending; they must not be called inspected demonstrations.

Ordinary and creative packets show stage-selected summaries and expansion handles. The storyboard keeps version 3 and design contract 1, adding `compositionContractVersion: 1`, the pinned release, page intent, and consequential element relationships and render observations. Significant markup uses `data-composition-element="ID"`. The browser verifier records current target counts and screenshots; quality review must locate declared observations in those captures. `agent/decisions/authoring-decisions.json` records only consequential choices. Empty example-inspection lists are valid.

The mode is **not ready for default promotion**. One fictional sparse-media application has compiled mobile and desktop captures and a located agent inspection. The remaining teaching demonstrations, an end-to-end generated opt-in customer site, verified variant/synthesis/refinement outcomes, matched A/B generation, and human preference labels are pending. Engineering acceptance also depends on a passing official freeze. The [implementation ledger](../artifacts/composition-v1/implementation-ledger.md) records the latest verification result and remaining work.

To return future work to the compatible policy, change `designAuthoring` to `{ "mode": "blocks-v0" }` or remove it, then reprepare the invalidated design stages. Keep authored components and customer content intact.
