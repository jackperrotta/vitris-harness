# __NAME__

This is the starting directory for this customer website. Open this directory in your coding agent. The versioned `@tryvitris/website-harness` dependency supplies the tools; this repository owns the customer content, components, brand, and workflow progress.

Vitris site repo. The harness compiles `pages/` + `components/` to static `dist/`.

When a new `dist/` replaces a prior build, Vitris keeps up to three unmodified managed archives under `.vitris/build-archives/`. Existing `dist.previous-*` folders and modified or unrecognized archives are preserved. The current `dist/` is not included in the archive limit.

## Layout

```
agent/                 # workflow graph, stage prompt, evals, refs
pages/                 # file-based routes (index.html → /)
components/            # this site’s reusable blocks
media/                 # harvest + composed assets
onboarding/            # crawl + research artifacts
launch.json            # backend + Cloudflare contract (no secrets)
site.json              # name, slug, motion
theme/defaults.json    # brand tokens
```

## Hit go

```bash
npm install
npx playwright install chromium   # required for study and preview verification
npm run go                        # prepare the next stage → preview_ready
# or open this folder in Cursor and say "go"
npm run build                     # → dist/ local preview
```

Default loop stops at a local preview. Launch (GitHub + Cloudflare Pages + backend tenant) is explicit — see `agent/refs/launch.md` and `launch.json`.

For a production Pages deployment, set `launch.json.publicOrigin` to the final `https://` origin. Use `npm run build && npm run preflight` as the Cloudflare Git build command, with `VITRIS_SITE_ENVIRONMENT=production` and `VITRIS_BACKEND_ORIGIN` set in build environment variables; the output directory is `dist`. The preflight rebuilds and verifies the exact publishable files with Chromium, so the build must have Playwright's browser binary installed. Any failed required check exits nonzero and stops publication. Keep preview branches on `VITRIS_SITE_ENVIRONMENT=preview` and use the generated CI workflow when branch-specific gating is needed. Do not use a bare `npm run build` as a production build command.

To ignore local Cursor-chat traces in an existing site, add `agent/runs/traces/` to `.gitignore`. See harness `docs/tracing.md`.

If this site publishes through the backend Worker, protected CI needs `VITRIS_TENANT_ID`, `VITRIS_PUBLISH_ATTESTATION_SECRET`, and `VITRIS_BACKEND_ORIGIN`; the Worker needs the matching `PUBLISH_ATTESTATION_SECRET` and its Cloudflare API credentials. The generated workflow signs the exact verified `dist/` bundle and posts it to `/api/publish-attested`. The Worker rejects stale, altered, or mismatched evidence before changing hosted content. A Pages project using Git integration can continue using its normal build path; avoid configuring both paths for the same production release.

For interactive workflow commands on Windows, call the installed bin directly when forwarding flags, for example `node ./node_modules/@tryvitris/website-harness/bin/vitris-go.js --prepare --jev-mode off`. `npm run go -- --prepare` may be parsed differently by some npm/PowerShell versions. A prepared `agent/CURRENT.md` is the active stage; complete it with the recorded preparation ID, then prepare the next stage. Do not edit `agent/STATE.json`.

## Authoring

```html
---
title: Home
description: …
---
<header></header>
<hero motion="off">
  <h1>Headline for this page</h1>
  <a class="btn" href="/contact">Get a quote</a>
</hero>
<footer></footer>
```

Build flattens `<hero>` into ordinary HTML. Lead forms use `data-lead-form` and POST to the backend (`VITRIS_BACKEND_ORIGIN`).


For an explicitly requested quick publish, use `vitris deploy --quick --environment production` (`npm run deploy:quick` in newly scaffolded sites). This rebuilds and deploys without browser, graph or launch review gates. Compilation, Cloudflare credentials, staged-file integrity and an HTTP smoke check still run. Receipts record build-only verification. Preservation sites use `--environment preview` and also skip screenshot comparisons. Ordinary deployment retains full preflight.
