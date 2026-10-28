# Harness agent

For an optional separate business admin, read `agent/refs/admin.md` and `docs/ADMIN.md`. Use `vitris admin setup --plan` then `--apply`, delegating to the exact published 0.1.0-alpha.1 installer. New-site `--admin` prepares instructions only. Verify deployed API compatibility separately; never provision, deploy or migrate an existing shared backend as a setup side effect.

This is the source repository for **@tryvitris/website-harness**: compiler, optional Cloudflare Worker, harvest tools, and agent kit. Customer sites live in separate repositories.

Run `node --experimental-strip-types scripts/create-site.ts --dir ../acme --slug acme --name "Acme Shop" --from https://old-site.example --owner owner@acme.example --harness file:../vitris-harness` to create a sibling site. Open that site directory in your coding agent. Follow prepare → `agent/CURRENT.md` → work → complete. Default stop is verified local `dist/` preview. Cloudflare launch is a separate explicit step using the user's own account and credentials; see `docs/CLOUDFLARE.md`.

When the user supplies template and content inputs, add `--template "catalog ID, name, or hosted URL"` and `--content "exact supplied text"` (or `--content-file FILE`). Preserve supplied wording and continue all reference, browser, critic, and quality gates. See `docs/CLI.md` for media/content-gap policy.

Knowledge lives in `agent/refs/` and is loaded per node. Do not introduce always-on `.cursor/skills`. Run `vitris upgrade --site SITE --plan` before `--apply`. Preserve authored files, `launch.json`, `agent/STATE.json`, and progress. Unknown kit provenance remains a conflict; never overwrite silently. Compose explicit `agent/overrides/`. Design system: `design-system/MASTER.md`.

Never commit credentials, local account configuration, customer captures, or operator experiment history. Use placeholders and ignored environment files. Publish to npm only with explicit owner authorization.

Customer sites default to local builds and verification followed by direct Cloudflare Pages uploads. Keep `dist/` and local release bundles out of Git. Hosted deployment automation is opt-in; ship its example outside `.github/workflows/`. Existing customer scripts and remote build settings require a separate reviewed migration.

Run `npm run templates:gallery` to serve `artifacts/templates/gallery.html` at `http://127.0.0.1:4390/`. It refreshes the hosted catalog while visible and on focus/network restoration. Read `agent/refs/template-library.md` before authoring/revising a template. Keep catalog/search/display metadata and generic tooling in source. Author complete new demonstrations in dedicated transient staging; assets and recoverable source belong in the maintainer's configured Cloudflare storage. `npm run templates -- publish --bundle ABSOLUTE_STAGING_DIRECTORY` verifies objects, hosted routes and browsers before catalog mutation and removal of verified staging files. It requires explicit publication authorization and your own account configuration. Customer changes are separate.

Frozen historical compatibility definitions and original teaching fixtures are immutable. Never edit a baseline to make checks pass or fabricate human preference labels. Install dependencies with `npm ci` and Chromium with `npx playwright install chromium`. Run typecheck, tests, and package verification. `npm run test:freeze` creates a hashed verified baseline; see `docs/OFFICIAL-TEST.md`. Put results in ignored `artifacts/` and preserve earlier baselines/experiments.
