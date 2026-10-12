# Composition teaching examples v1

These are original, fictional, site-compatible examples. Each folder contains `site.json`, `theme/defaults.json`, `pages/`, `components/`, and any local media. Build with:

```powershell
node --experimental-strip-types src/build/cli.ts --site design-system/compositions/v1/tide-and-slate --out scratch/design-composition-previews/tide-and-slate --slug tide-and-slate
node --experimental-strip-types src/build/cli.ts --site design-system/compositions/v1/northline-counsel --out scratch/design-composition-previews/northline-counsel --slug northline-counsel
node --experimental-strip-types scripts/capture-composition-pairs.ts
```

The examples teach relationships among opening, evidence, practical information, and action. They are not required section stacks or sources of customer facts. All business names, contact details, projects, and service claims are fictional. The Tide & Slate images are synthetic teaching assets with individual provenance files; never add them automatically to a customer media inventory.

The local capture manifest lives at `scratch/design-composition-captures/manifest.json`. The 2026-09-22 captures cover each homepage and interior at 320px, 375px, 768px, 1280px, and 1440px and record compiled HTML and screenshot hashes. Automated axe scans had no violations, and no page had broken images or document-level horizontal overflow. The six new blocks also passed 72 normal, long-copy, and 200% text-size reflow cases after scoped overflow repairs. Manual keyboard, screen-reader, and content-rights review remain separate checks.
