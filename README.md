# Vitris

Vitris gives your coding agent the business context, design judgment, and verification process to build distinctive websites on a consistent technical foundation.

This repository produces **`@tryvitris/website-harness`**, an agent harness for building and verifying customer websites. It includes a static site compiler, design tokens, an optional Cloudflare backend for owner admin, leads, and analytics, harvest tools, and an agent kit. Each customer website is a separate git repo started from `templates/site`. Normal generation stops at a verified local preview. Cloudflare launch is a separate explicit operation. Built-in design lessons live in `design-system/knowledge/v1` and do not require a user reference.

Sites own their visual components and adapt the selected template direction to their content.

The default template gallery is `artifacts/templates/gallery.html`. Run `npm run templates:gallery` and open `http://127.0.0.1:4390/`. It displays the live Cloudflare library and automatically includes future publications. Publish complete new demonstrations with `npm run templates -- publish --bundle ABSOLUTE_TRANSIENT_DIRECTORY`; see `agent/refs/template-library.md`. Source fixtures contain original Vitris instructional material; external demonstrations remain hosted with their own provenance records.

MIT licensed. The public npm package is `@tryvitris/website-harness`; prerelease `0.1.0-beta.7` is available through the `beta` and `latest` dist-tags. Bring your own coding agent. Optional hosting uses your own Cloudflare account; see [Cloudflare setup](docs/CLOUDFLARE.md) and [credential safety](docs/SECURITY.md).

Requires Node 24 or newer. Hosted demonstrations and third-party media have their own license records; see NOTICE.

The npm package contains the bundled JavaScript CLI and APIs, TypeScript declarations, starter templates, agent kit, and required runtime assets. The complete TypeScript development source and tests are in the [GitHub repository](https://github.com/jackperrotta/vitris-harness).

## Start a client website

Each client gets an independent site directory and Git repository. **That client directory is where you open your coding agent and build the website.** This source repository maintains the reusable harness, compiler, knowledge, media catalog, and optional backend.

To use a local checkout, build and pack it, then generate a site:

```bash
npm ci
npm pack
node bin/vitris.js site create --dir ../acme --slug acme --name "Acme Shop" --from https://old-site.example --harness ../vitris-harness/tryvitris-website-harness-0.1.0-beta.7.tgz
cd ../acme
npm install
npx playwright install chromium
npm run go
```

The tarball path is relative to the generated site directory. Adjust it for your directory layout. Open the **acme directory** in your coding agent and follow `AGENTS.md` and `agent/CURRENT.md`. Commit its generated lockfile with the client source. Before using the client repo on another computer, switch the dependency to a published version or distribute the tarball with it.

The public beta starter command is:

```bash
npx --package @tryvitris/website-harness@0.1.0-beta.7 vitris site create --dir acme --slug acme --from https://old-site.example
```

Use `--blank` when there is no existing website. New sites pin the creating harness version. `--harness file:../vitris-harness` explicitly opts into local development; run `npm run build:cli` in that checkout first. Jev is optional and off by default. Backend and Cloudflare credentials are not required to author and preview a static site locally.

See [distribution and migration](docs/DISTRIBUTION.md) for existing clients and release preparation. Cloudflare hosting is configured and deployed separately from installing the npm package.

## Local demo

```bash
cp .dev.vars.example .dev.vars
npm install
npm run catalog
npm run build:demo
npm run dev
```

Then:

- Backend home: http://127.0.0.1:8787/
- Fixture build: `dist/demo/` (from `src/test/fixtures/site`)
- Owner admin: http://127.0.0.1:8787/app/login — `owner@demo.test`
- Operator: http://127.0.0.1:8787/ops — `ops@demo.test`

`/preview/{slug}/` requires an owner/operator session and opens the tenant’s **GitHub** `pages/` + `components/` on its own preview hostname. Hosted previews require `PREVIEW_HOST_SUFFIX`, `github_owner` / `github_repo` and `GITHUB_TOKEN`; see [Cloudflare setup](docs/CLOUDFLARE.md). Local CLI previews need none of these.

`DEV_LOGIN=1` skips email and seeds demo users only on local loopback or `.localhost` requests. The deployable Wrangler config does not set it. Production sign-in requires email delivery and the authentication D1 migration; production never displays sign-in links or creates demo accounts.

## Site source layout

```
pages/index.html          → /
pages/about.html          → /about
components/hero/…         reusable layout + slots
site.json                 name, slug, motion
theme/defaults.json       brand tokens
agent/                    workflow graph, stage prompt, evals, refs
launch.json               backend + Cloudflare contract (no secrets)
```

Authoring tags like `<hero>…</hero>` flatten at build time. Copy for a page lives in that page’s HTML; shared chrome lives inside `components/header` and `components/footer`.

## New customer site

```bash
node --experimental-strip-types scripts/create-site.ts \
  --dir ../acme --slug acme --name "Acme Shop" \
  --from https://old-site.example \
  --owner owner@acme.example --harness file:../vitris-harness
```

That scaffolds the site folder with the agent kit and records the old URL. **Open the site repo** and say **go** (or `npm run go`). The active-agent workflow walks:

`harvest → business + review → media → narrative + review → reference analysis → direction + review → storyboard → copy + review → representative + browser + reviews → copy expansion → pages → browser → visual + content reviews → preview`

Default stop is local `dist/` preview (`preview_ready`). Cloudflare / GitHub launch is an optional later node.

See [AGENTS.md](AGENTS.md) and `agent/PROMPT.md`.

## How site updates work

Owners file tickets at `/app/requests` (or email). You:

1. Open `/ops/inbox`
2. Copy the ticket into Cursor **in that client’s site repo**
3. Follow `AGENTS.md` (reuse preview eval after edits)
4. Push an `update/…` branch so Pages builds a preview
5. Paste the preview URL on the ticket and email the client
6. Merge to `main` when they approve

Git is the source of truth. Register `github_owner` / `github_repo` / `pages_project` on the tenant in `/ops`.

## Stack rules

No React/Vue/Svelte, no Hono, no Tailwind, no ORM. Components compile to flat HTML/CSS plus optional tiny islands (no Shadow DOM). Lead forms POST to the backend `/api/leads`.

## Analytics

Public sites ship first-party `beacon.js`. Cookie preference page is backend-owned at `/cookie-compliance`.

## Workflow graph

See [operator guide](agent/WORKFLOW.md) for theme requests, adapters, retry budgets and safe kit refresh, and [evaluation protocol](agent/EVALUATION.md) for frozen baselines and operator preference labels.

Run `npx playwright install chromium` once before `npm test`; the workflow regressions include actual browser rendering and crawl resumption. `npm run typecheck` checks the TypeScript surface. `npm run preview -- --site CLIENT_DIRECTORY` serves a built client site locally.

## Verified publication

The local production preflight builds the site, runs Chromium checks, and binds the report to every publishable byte in `dist/`. For a Worker-managed Pages tenant, protected CI signs that exact bundle with `vitris-sign-publish-bundle`; the Worker route `/api/publish-attested` authenticates the signature, checks tenant/project identity, freshness, and the current policy, then uploads the verified files through the Cloudflare Pages assets and deployments API. Set the same long random `VITRIS_PUBLISH_ATTESTATION_SECRET` in protected CI and `PUBLISH_ATTESTATION_SECRET` on the Worker. Keep the Cloudflare token in the Worker; do not pass it to the site bundle. The generated site workflow shows the signing and POST commands. A rejected request returns before deployment or preview storage mutation.

The local preflight and mocked Cloudflare publication tests are engineering checks; the live Pages API path still needs an authorized deployment to validate Cloudflare credentials and project settings.

## Jev semantic assistance

Jev defaults to off. `--jev-mode off` on `vitris-go`, `vitris resume`, or `vitris refine` makes no model transport requests. Shadow records bounded task results without placing them in the active agent prompt. Assist adds advisory observations to selected stages; it cannot waive factual, browser, or review requirements. The semantic tasks run only where their inputs are relevant, through the configured Jev client, budgets, and usage receipts. Lesson ranking judges each selected candidate separately. Direction continuity runs during visual review, after page authoring, using affected pages and shared components; oversized evidence is reported unavailable. Use a mock endpoint for local checks unless paid usage is explicitly authorized.

## Official-test baseline

`npm run test:freeze` verifies source, tests and a packed installation, then creates a hashed source/package baseline under `artifacts/official-test/`. The active-agent trial driver supports `--prepare-only`, `--resume` and `--status`; unfinished stages stay pending. See [the official test protocol](docs/OFFICIAL-TEST.md). Historical `scratch/` experiments remain local archives and are excluded from source tracking and packages.

## Media library

See [Stock and customer media](docs/STOCK-MEDIA.md) for inspected stock retrieval, customer identity preservation, local imports, and Jev classification/selection. `npm run stock -- --help` lists the staged acquisition and explicit publication commands.

Original SVG icons are included at build time. Use paired `<vitris-icon name="phone"></vitris-icon>` tags in pages or components; each route receives only the icons it uses, without an icon font or browser runtime. Explore with `npm run icons:gallery`, discover with `vitris-icons search QUERY`, and inspect supported styles and sizing with `vitris-icons inspect NAME --json`. The collection contains 381 symbols, four core styles, and five studio families for a curated 24-symbol selection. See [the icon guide](agent/refs/icons.md).
