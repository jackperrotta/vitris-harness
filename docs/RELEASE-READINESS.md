# Beta release checks

The `0.1.0-beta.8` release is configured as public `@tryvitris/website-harness` with the `beta` dist-tag. Verification creates local artifacts and never publishes a package. `prepublishOnly` enforces the intended identity, public registry and visibility, prerelease tag, and packed-release audit.

This release adds explicit quick publication, stage-scoped analytics guidance, lean cookie-page assets, single-pass page compilation, accurate asset inventories, and installed-package coverage checks for all 381 icons and 1,644 variants. Normal publication retains its full review gates. Canonical path checks support junction-backed workspaces while retaining child-link confinement. Cloudflare OAuth diagnostics require an explicit authenticated JSON identity; the full suite uses two workers to limit browser contention on CI runners.

Before publishing an owner-authorized release:

1. Run `npm ci`, install Chromium, and require `npm audit --audit-level=low` to pass for the complete dependency graph. Run `npm run test:freeze` on unchanged source. Require typecheck, build, full tests (including real-D1 authentication and Chromium preview isolation), packed-install smoke site, browser preflight, managed upgrade, consumer TypeScript declarations, Worker dry-run, and restored-source checks.
2. Configure a verified Gitleaks executable with `GITLEAKS_BIN` (`scripts/install-release-scanner.ps1`). Scan every reachable Git reference and the export with archives/decoding enabled. Review findings without printing credential values. Do not suppress unresolved findings.
3. Set `VITRIS_AUDIT_CREDENTIAL_ROOT` to the private operator checkout for exact-value comparison with available local credentials. Run `npm run audit:package`; inspect the redacted report. Keep evidence in ignored `artifacts/`.
4. Verify ownership of the `@tryvitris` npm scope, verified account email and publishing 2FA, and review MIT/provenance notices. Repository visibility and npm publication are separate decisions. Trusted CI publishing requires npm >=11.5.1 and a protected, explicitly configured OIDC workflow; no publishing workflow is enabled here. Release only the verified tarball with its source hash/checksum. Publish only with explicit authorization; repeat checks after source changes.

The Miniflare-specific overrides in both the harness and generated-site manifest pin patched compatible Undici 7.30.1 and Sharp 0.35.5. The direct development emulator is pinned for runtime compatibility. Keep the overrides when regenerating the lockfile, and remove them only after testing upstream dependencies that resolve the advisories.

Existing optional backends must apply `0005_auth.sql` before upgrading their Worker. Legacy KV sessions and magic links are intentionally rejected, so users sign in again. Review the production email and isolated-preview setup in CLOUDFLARE.md; an unconfigured backend fails closed. Static builds do not require backend changes.

Users supply coding-agent access and their own Cloudflare account. No operator credentials are distributed. External media/references retain their own rights. Engineering checks and mocked Cloudflare tests do not establish a live deployment or human design preference win.
