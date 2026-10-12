# Reference teaching release 2026-10-05.1

`manifest.json` pins the authoritative `catalog.json`. The 60 deep records are a subset of the 100 screened publishers. External images and code are not cleared for redistribution or generation; eligible records supply original written observations and abstract lessons, with publisher links for live inspection. View timestamps, routes, sizes, loading limitations and evidence pointers describe actual inspections. Metadata delivery is not visual inspection or human taste approval.

Original compilable material lives in `design-system/compositions/v2`, with its own manifest, source/media pins, and 64 approved compact previews. Its fictional facts never populate customer inventories. Existing calibration v1, knowledge v3 and compositions v1 retain their contracts.

Opt in for a site by adding this to its existing launch.json:

```json
"designReferences": { "mode": "lessons", "release": "2026-10-05.1" }
```

Optional `manifestHash` and `teachingManifestHash` pin SHA-256 hashes of the respective manifest bytes. This policy is independent of `designAuthoring`; omitting it preserves legacy behavior. Ordinary `npm run go` and the existing creative/efficiency paths include selected references in real prepared CURRENT.md and integrity-bound expansions. Follow CURRENT.md expansion commands, inspect relevant source/preview pixels, and record relevance, boundaries and homepage/interior/mobile/action relationships in reference-analysis.json. Later stages reuse accepted choices. Do not treat context delivery as a completed inspection.

From the harness checkout:

```text
node --experimental-strip-types scripts/reference-library.ts --coverage
node --experimental-strip-types scripts/reference-library.ts --gallery --serve --port 4178
node --experimental-strip-types scripts/reference-library.ts --preview clearwell-directory --serve --port 4179
node --experimental-strip-types scripts/reference-library.ts --select --site SITE --out artifacts/reference-selection
node --experimental-strip-types scripts/reference-library.ts --exposure --receipts SITE/agent --out artifacts/reference-exposure
```

Installed equivalents use `vitris-references`. Gallery serves http://127.0.0.1:4178; pair preview serves homepage `/` and interior `/detail`. IDs are listed in the gallery and compositions v2 catalog. Gallery filters expression/composition/tasks through search, evidence depth, asset minimum and eligibility, and compares up to four entries. No external thumbnails are fabricated.

For research continuation, author a new record under artifacts and ingest with `--record FILE`; replacements must increment revision. Validate all linked lessons, studies and evidence hashes before publication. `--seal --release-ready` explicitly labels completed curation without human preference approval. Keep failed/rejected attempts and never edit frozen official baselines. Progress/evidence: `docs/plans/reference-library-execution-ledger-2026-10-05.md` and `artifacts/reference-library-expansion-20261005/`.
