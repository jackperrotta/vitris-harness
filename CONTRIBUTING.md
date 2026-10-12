# Contributing

Vitris is MIT licensed and being prepared for an npm beta. Third-party assets retain their own rights; see NOTICE. Publication remains disabled during preparation.

Use Node 24 or newer. Install with `npm ci`, run `npm run typecheck`, `npm run build:cli`, and `npm test`. Run `npm run verify:package` to exercise a packed consumer outside the checkout. Before a final engineering baseline, stabilize source and run `npm run test:freeze` as described in `docs/OFFICIAL-TEST.md`. Do not modify prior frozen baselines or use `scratch/` for new generated results; save evidence under `artifacts/`.

Keep site-owned pages, components, theme, media, facts, preferences, and history intact. New package defaults must have clear provenance and safe upgrade behavior. Do not add always-on `.cursor/skills`. Tests should establish observable behavior and recovery rather than mirror implementation details. Browser and design outcomes need actual rendered evidence; machine reviews are not human labels.
