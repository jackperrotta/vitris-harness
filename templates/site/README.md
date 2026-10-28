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

Default loop stops at a local preview. Launch is explicit — see `agent/refs/launch.md` and `launch.json`. Builds and verification run locally; the deployment command uploads the finished files directly to Cloudflare Pages. GitHub stores source and history. New sites have no active GitHub deployment workflow.

Set `launch.json.pagesProject` to your Pages project and `launch.json.publicOrigin` to the final production `https://` origin. Install Chromium with `npx playwright install chromium`, authenticate using `npx wrangler login`, and run `npm run deploy:preview` to check a hosted preview. After accepting it, explicitly publish with `npm run deploy`. Ordinary deployment runs the full local verification, stages the exact checked files, uploads that bundle, records its identity, and checks the hosted URL. Failed required checks stop publication. Keep `dist/` and staged release output ignored in Git. See `deployment/README.md` for setup.

To ignore local Cursor-chat traces in an existing site, add `agent/runs/traces/` to `.gitignore`. See harness `docs/tracing.md`.

For an existing Git-connected Pages project, disable automatic production and preview branch deployments before adopting local direct uploads. Existing GitHub deployment workflows also need to be disabled. The optional `deployment/github-actions.yml.example` runs only after an owner installs it under `.github/workflows/`; hosted CI is an explicit alternative.

If this site publishes through the authenticated backend Worker, retain its signed bundle publication contract. The optional workflow signs the exact verified `dist/` bundle and posts it to `/api/publish-attested`, using protected `VITRIS_TENANT_ID`, `VITRIS_PUBLISH_ATTESTATION_SECRET`, and `VITRIS_BACKEND_ORIGIN`; the Worker needs the matching `PUBLISH_ATTESTATION_SECRET` and its Cloudflare credentials. Review that existing publication path before changing deployment providers. Static direct uploads do not register backend tenants or configure contact forms.

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
