# Skill: jev
# Jev Decision Service & Compact Context Operations

This reference documents the bounded decision service and compact packet mechanisms powered by TypeSafe's Jev model (`jev-1.13.0`) in `@vitris/harness`.

## Core Philosophy

- **Code Validates & Controls**: Graph transitions, review contracts, browser testing, and exact quote matches remain code-enforced.
- **Jev Evaluates Bounded Semantics**: Evaluates atomic claim-to-excerpt relations, planned CTA consistency, and engineering change scopes. Jev does not author long-form prose, invent facts, or inspect screenshots.
- **Critics Retain Full Gate Ownership**: All critic checkpoints, review schemas, and editorial obligations remain 100% intact. Preflights provide supplemental evidence; machine judgments never autonomously pass or fail a review gate.

## Operational Modes & Capability Toggles

The Jev system supports global operational modes and fine-grained capability toggles.

### Global Modes

| Mode | Behavior | Use Case |
|---|---|---|
| `off` (default) | Standard full-packet workflow. No Jev API calls or preflight injection. Zero overhead. | Production default until calibrated rollout gates pass. |
| `shadow` | Runs bounded evaluations in background; writes immutable decision receipts to `agent/decisions/jev/`. Prompt and transitions remain identical to baseline with zero side-effects. | Comparative benchmarking, telemetry, and offline validation without affecting production output. |
| `assist` | Attaches machine grounding preflight summaries to critic context when `grounding` is assist. Compact packets are a separate toggle. | Additive critic evidence. No workload reduction unless `workOwnership=delegated` and a harness calibration artifact is eligible. |

Configure global mode via:
- CLI flag: `--jev-mode <off|shadow|assist>`
- Environment variable: `VITRIS_JEV_MODE=<off|shadow|assist>`
- Site configuration: `agent/jev.json` (`{ "mode": "off|shadow|assist" }`)

### Granular Capability Toggles

Individual capabilities can be independently configured in `agent/jev.json` under `capabilities`:

```json
{
  "mode": "assist",
  "capabilities": {
    "grounding": "assist",
    "sourceSelection": "assist",
    "retrievalRanking": "assist",
    "consistency": "assist",
    "repairAssistance": "assist",
    "preferenceScoring": "assist"
  }
}
```

- `grounding`: Atomic claim-to-excerpt verification and contradiction tracking (production Jev caller on business/narrative/copy review).
- `sourceSelection`: Local lexical citation **ordering** on critic preflight (does not drop sources). Business-author field selection batches independent questions: Choice + no-match for single-value fields, per-candidate Noul for offers/locations. Transcription drops only after complete coverage.
- `retrievalRanking`: Assist mode shortlists with cheap lexical retrieval, then Jev Score for optional excerpts. Cited and contradictory evidence are kept regardless of rank. Shadow computes receipts but does not change packets. Off remains lexical MMR.
- `consistency`: Cross-stage claim lineage helpers. Registry task is experimental; no production Jev caller.
- `repairAssistance`: Targeted repair packet construction and resolution helpers. Integrated critic replacement is not claimed.
- `preferenceScoring`: Local rubric matching. Neural direction/media scoring is experimental and unimplemented as a production caller.

*Note*: An individual capability's effective mode is always clamped to the global mode ceiling (e.g. if global mode is `shadow`, a capability set to `assist` runs in `shadow`).

## Provenance Tracking & Canonical Question Semantics Hashing

To ensure reproducible judgments, auditability, and tamper-resistance:
- **Canonical Serialization**: Questions and states are canonically serialized and hashed with SHA-256 (`questionSemanticsHash`).
- **Decoupled Raw Judgments**: Raw model judgments (`choice`, `confidence`, `rationale`) are stored in the Evidence Ledger independently of application policy thresholds. If confidence thresholds change, raw judgments remain valid and are re-evaluated by policy without re-querying the model.
- **Cache Invalidation**: Inference cache keys in `agent/decisions/jev/cache/<hash>.json` depend on `(inferenceSchema, model, questionVersion, questionSemanticsHash, questions, state)`. Policy version is applied after the raw answer and does not force another TypeSafe call. Legacy unwrapped cache envelopes are ignored.

## Bounded Packet Expansion & Diverse Retrieval

When compact packets (`--compact-packets`) are active, large source dossiers are partitioned into a coverage manifest (`agent/runs/<node>.manifest.json`).

1. **Maximal Marginal Relevance (MMR)**: `selectDiverseEvidence()` balances relevance with source diversity across all captured files, preventing a single verbose harvest file from monopolizing the packet budget.
2. **Atomic Obligation Partitioning**: `partitionByObligation()` groups evidence items by critic checklist obligations. Items belonging to the same obligation are never split mid-sentence or mid-obligation across packet boundaries.
3. **Overflow Re-Hashing Verification**: When an agent expands an item from the coverage manifest using `expandPacketItem()`, the system computes a SHA-256 hash of the actual content on disk and compares it against the manifest hash. If content was tampered with, expansion is rejected.

To manually expand excluded context:
```bash
node scripts/eval-site.ts --site . --expand-packet <expansion-id> --node <node-id>
```
Every packet expansion is logged to `agent/runs/packet-expansions.log`.

## Cross-Stage Lineage & Completeness Auditing

- **Claim Lineage Tracking**: `traceClaimLineage()` maps evidence through all pipeline stages: `Source File -> Harvested Fact -> Copy Plan -> Rendered Page Section -> Review Finding`.
- **Broken Lineage Detection**: `detectBrokenLineage()` flags copy claims whose cited sources have been modified, retired, or contradicted.
- **Completeness Auditing**: `auditExtractionCompleteness()` audits copy plans against the Evidence Ledger, reporting:
  - `uncitedClaims`: facts asserted in copy without declared evidence citations.
  - `unregisteredClaims`: cited IDs that do not exist in the Evidence Ledger.
  - `contradictedClaims`: claims citing facts that have unresolved contradiction status.

## Targeted Repair Resolution & Escalation

When a critic checkpoint fails:
1. **Finding Signatures**: Findings are fingerprinted by target and issue type (`findingId`).
2. **Targeted Repair Packets**: `buildRepairPacket()` extracts only the specific obligations and evidence slices needed to fix flagged defects, avoiding re-transmitting entire site briefs.
3. **Repair Resolution Verification**: `verifyRepairResolution()` compares post-repair artifacts against pre-repair artifacts:
  - Rejects no-op edits where the author claimed to resolve a finding without modifying the affected file.
  - Detects persistent defect patterns when the same finding signature persists across iterations.
  - Automatically escalates repeat findings: `polish -> warning -> blocking`.

## Creative Direction & Preference Rubrics

- **Dimensioned Direction Scoring**: `makeDirectionScoreQuestion()` evaluates visual directions against four distinct criteria:
  - `business_fit`: alignment with industry and business model.
  - `typography`: font pairing hierarchy, readability, and scale.
  - `composition`: whitespace balance, layout rhythm, and responsive density.
  - `authenticity`: bespoke vernacular presentation vs generic stock templates.
- **Versioned Preference Rubrics**: `matchPreferences()` evaluates directions against client and brand preference rubrics (`agent/preferences.json`), providing positive signal boosts and applying penalties for banned anti-patterns.

## Calibrated Rollout & Evaluation Harness

The evaluation harness in `scripts/eval-jev.ts` provides matched benchmarking across treatment arms:

```bash
# Evaluate offline mechanics and live model endpoints
node --experimental-strip-types scripts/eval-jev.ts

# Configure a specific rollout treatment
node --experimental-strip-types scripts/eval-jev.ts --treatment <A|B|C>

# Measure the marginal impact of ablating a single capability
node --experimental-strip-types scripts/eval-jev.ts --treatment C --ablation <component>

# Empirically evaluate a completed trial directory with quality margin
node --experimental-strip-types scripts/eval-jev.ts --trial-dir <path> --quality-margin 0.05
```

### Rollout Treatments

- **Treatment A**: Jev `off`, `workOwnership=agent`.
- **Treatment B**: Jev `assist`, `workOwnership=agent` (additive preflight; no claimed reduction).
- **Treatment C**: Jev `assist`, `workOwnership=delegated` (packet reduction only for harness-calibrated, fully covered tasks). Lexical ranking and unimplemented registry tasks are not part of this treatment.

### Evaluation Metrics

- `shortlistRecall`: Proportion of relevant evidence items captured in the ranked candidate shortlist.
- `defectRate`: Proportion of defective claims escaping verification gates.
- `qualityMargin`: Allowable regression margin (default 5%) for quality preservation assertions in `compareRuns()`.

## Implementation & Integration Status

| Capability | Current Status | Architecture & Implementation Details |
|---|---|---|
| `grounding` | **Active / Production** | Atomic claim-to-excerpt verification using canonical serialized questions, SHA-256 semantic hashing, Evidence Ledger persistence, bounded batching, and configurable thresholding. |
| `sourceSelection` | **Split** | Critic citation **ordering** is still lexical and must not drop sources. Business-author field selection batches Choice (single-value) and Noul (multi-value) questions. Default calibration remains ineligible. |
| `retrievalRanking` | **Assist caller** | Lexical shortlist plus Jev Score for optional evidence when `retrievalRanking=assist` and a client is available. Mandatory/contradictory excerpts are retained. Off/shadow packets stay lexical. |
| `consistency` | **Pending End-to-End Integration** | Core lineage tracing and broken lineage helpers implemented; cross-stage automated enforcement remains pending. |
| `repairAssistance` | **Pending End-to-End Integration** | Repair packet building and edit resolution verification implemented; integrated critic repair loops remain pending. |
| `preferenceScoring` | **Local rubric** | Local brand/craft rubric matching. It is not the creative-dimension caller. |
| `creativeScoring` | **Advisory caller** | `scoreCreativeCandidates` runs from lifecycle on direction-review and representative-review when the capability is not `off`. Missing or invalid scores stay `unavailable` or `invalid`. They are not stored as zero. Assist text is advisory. Shadow does not change CURRENT.md. |
| `componentSelection` | **Advisory caller** | Representative and pages preparation can rank a shortlist from semantic section state. Custom remains available. `draftAuthoringSnippet` is non-production and is not an authoring packet. |
| `compositionCheck` | **Semantic caller plus deterministic preflight** | When the capability is not off, storyboard and representative preparation call `scoreCompositionRepetition` and write `agent/reviews/jev-composition.json`. Assist mode adds those judgments to the prompt. `off` makes no Jev call. Shadow records the receipt without changing the prompt. `agent/reviews/composition-preflight.json` stays a separate deterministic structure check. This task is uncalibrated and does not remove critic duties. Unavailable or invalid responses are not measured low scores. |

> [!NOTE]
> Evaluation of Treatment C token savings and workflow efficiency requires full empirical 3-arm active-agent runs to local preview with verified, observed quality. Synthetic constant multipliers and unobserved quality assumptions are disallowed.

## Ownership, calibration, and rollout

Confirmed setting name: `workOwnership: "agent" | "delegated"` (default `agent`). Orthogonal to global `off | shadow | assist`.

- `off`: no Jev execution; prompt, ownership, and acceptance unchanged.
- `shadow`: Jev may run and record receipts; consumed CURRENT.md, ownership, state, and acceptance stay identical to `off`.
- `assist` + `agent`: grounding preflight and/or a source-bound business draft may be added; no workload reduction is claimed.
- `assist` + `delegated`: a harness-calibrated, applicable, complete task may remove only its covered pairs/fields from CURRENT.md. Remaining items keep their excerpts. Every failure, incomplete coverage, missing manifest, exhausted budget, or invalid pilot context restores the full obligation.

Delegation is not authorized by site `calibrationGates[].eligible`, registry `delegationEligible`, or a user-editable pilot boolean. Eligibility comes only from a harness-controlled calibration artifact bound to task version, question semantics, model family, dataset version, sample size, metrics, thresholds, and expiration. Pilot-only artifacts also require `issueTrustedPilotContext` passed into `prepareStage({ pilotContext })`.

Default harness artifacts are ineligible. Delegated mode stays off until a task's calibration gate passes. Creative dimension scores are advisory and do not remove the agent's visual judgment. A paid live pilot is not part of `npm test`.

`--design-assist` is the one-step advisory preset. It does not override `--jev-mode off`.

