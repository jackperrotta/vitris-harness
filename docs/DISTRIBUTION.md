# Distribution, client starters, and migration

## Repository boundaries

`@tryvitris/website-harness` is the reusable package maintained here. `vitris` is the command. The workflow graph schedules agent, tool, and critic stages; skills and references supply stage-specific knowledge. The compiler builds static websites. The optional backend Worker supplies owner administration, leads, and analytics.

Generate a separate directory for each customer with `vitris site create`. Open that directory in the coding agent, initialize its Git repository, and commit its authored source and lockfile. Keep customer secrets and captures out of the public harness repository. A second starter repository is unnecessary: `templates/site` is the versioned starter shipped with the npm package.

New sites depend on the exact creating package version, avoiding paths into an ephemeral `npx` cache. Before a registry release, pass `--harness` with a tarball path or an explicit `file:` dependency. Both paths are relative to the generated site directory. Registry and tarball installations include bundled JavaScript commands and APIs; consumers do not need to strip TypeScript inside `node_modules`.

New sites build and verify locally and upload directly to Cloudflare Pages using `npm run deploy:preview` or an explicitly requested production `npm run deploy`. No active GitHub deployment workflow is scaffolded. `deployment/github-actions.yml.example` is an optional hosted alternative. Existing site scripts, workflows and remote project settings are not changed by installing or upgrading the harness; follow the migration steps in [Cloudflare setup](CLOUDFLARE.md). Keep generated output out of source control.

## Terminology and compatibility

| Current name | Accepted legacy name |
| --- | --- |
| `@tryvitris/website-harness` | Existing `@tryvitris/harness`, `@vitris/harness` and `@vitris/kernel` installations continue running their installed version; migrate dependencies explicitly |
| `--harness`, `harnessSpec` | `--kernel`, `kernelSpec` |
| `VITRIS_HARNESS` | `VITRIS_KERNEL` |
| `launch.json.backendOrigin`, `--backend-origin` | `launch.json.kernelOrigin`, `--kernel-origin` |
| `VITRIS_BACKEND_ORIGIN` | `KERNEL_ORIGIN` |
| Workflow command `{harness}` | `{kernel}` |
| HTML `data-backend` | The compiler also emits `data-kernel`; the beacon accepts both |

At the same configuration level, current names take precedence. CLI build overrides environment, which overrides launch configuration. Internal variable names, historical reports, and calibration issuer identifiers may retain `kernel`; changing evidence identity or signatures is not part of a naming migration.

## Migrate an existing client

Stop its workflow first. From the harness checkout, preview changes:

```bash
node bin/vitris-migrate-site.js --site ../acme --harness ../vitris-harness/tryvitris-website-harness-1.0.0.tgz
```

Add `--apply` to perform the displayed changes. The command backs up affected files under the client's `agent-backups/`, renames the package dependency and known script paths, and converts the backend origin key. Conflicting old/new origins fail before writes. Client pages, components, media, secrets, existing lockfile, and workflow state are preserved. Repeating it makes no further edits.

Then run inside the client directory:

```bash
npm install
npm run refresh-agent
npm run build
```

Review the migration diff and regenerated lockfile before committing. `refresh-agent` now plans and applies only managed instruction files whose previous hashes are known. Older copied kits without provenance keep customized or unknown files and report conflicts. Existing graph progress is retained; a graph-version change is deferred for explicit audit. Use `vitris upgrade --site . --plan` to inspect the plan and `--apply` to apply an unchanged plan. This managed-kit operation does not install npm dependencies. Custom imports of `@vitris/harness` or `@vitris/kernel` must also be updated; the migration only handles known configuration and command paths. An npm alias under the old dependency name can temporarily support a custom integration. No compatibility package has been published under the old name.

## Backend deployment identity

The new default Worker name is `vitris-backend`. This does not rename an existing remote Worker. Existing Vitris deployments must continue using the deployed name and resource bindings until an explicit service cutover. For example, use the old Worker name with Wrangler's `--name vitris-kernel` override while preserving its existing configuration. Keep the existing backend URL in client launch settings during that transition.

The checked-in Wrangler examples contain placeholder resource identifiers. Provision your own Cloudflare bindings and keep local account configuration outside version control; see [Cloudflare setup](CLOUDFLARE.md). Static client builds do not require backend resources. Preparing this source does not change any remote Worker, DNS record, binding, or client deployment.

## First migrations from Amazon

1. Generate a client repo with `--from` pointing at its current website. Capture pages, important URLs, business facts, and original brand media while the old site remains available.
2. Build through the workflow to a verified local preview. Preserve logos, founder/staff identity, and unique project imagery; use inspected stock for appropriate gaps. Confirm content and forms with the customer.
3. Verify a hosted preview, including URL coverage, redirects, assets, forms, and mobile behavior. Keep email/MX records separate from website hosting changes.
4. Schedule the domain cutover after acceptance, record rollback settings, and check the live site before retiring old hosting.

These are rollout steps, not completed migrations. This package does not automatically transfer Amazon infrastructure or DNS.

## Public release preparation

The owner selected MIT and public npm publication under `@tryvitris/website-harness`. Version `1.0.0` is the first stable release, published with the `latest` dist-tag. The `prepublishOnly` guard verifies the package identity, public registry and visibility, the `latest` tag for stable versions (`beta` for prereleases), and the packed-release audit before allowing publication. See SECURITY.md for the release audit and CLOUDFLARE.md for user-owned infrastructure.

MIT licensing and intended repository metadata are included. Before public release, review third-party provenance and dependency notices, confirm npm scope ownership/authentication, and repeat the source, Git-history, and tarball credential checks. The dedicated `vitris-harness` repository starts with fresh history. Keep the original private development repository and customer repositories private. Creating a remote repository, changing visibility, and publishing npm are separate explicitly authorized operations.

Run `npm run test:freeze` after final source edits. It checks type safety, tests, package installation, generated-site installation and build, public API imports, first-stage preparation, and restoration of the source archive. Use the immutable result for the official pilot. Publishing and production deployment are separate operations.

## Optional corrected teaching data

The core npm package includes the original v1/v2 teaching studies and reference metadata. The larger immutable corrected studies (v3/v4, releases 2026-10-06.1 and 2026-10-06.2) are optional data, supplied separately from the core package. They retain their original bytes and hashes; the package does not substitute reduced images or waive inspection. Set VITRIS_REFERENCE_DATA to a verified data root containing design-system/compositions/v3 and v4 before opting into those releases through launch.json.designReferences. A source checkout can serve as that root. Missing data produces an explicit error. The ordinary new-site workflow does not opt into those corrected teaching releases.
