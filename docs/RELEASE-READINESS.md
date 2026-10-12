# Beta release checks

The `0.1.0-beta.3` source is prepared for a separate `vitris-harness` repository with fresh history. Metadata describes its intended location; no remote repository or npm release is created by verification. `prepublishOnly` deliberately blocks publication.

Before authorizing publication:

1. Run `npm ci`, install Chromium, and run `npm run test:freeze` on unchanged source. Require typecheck, build, full tests, packed-install smoke site, browser preflight, managed upgrade, consumer TypeScript declarations, Worker dry-run, and restored-source checks.
2. Configure a verified Gitleaks executable with `GITLEAKS_BIN` (`scripts/install-release-scanner.ps1`). Scan every reachable Git reference and the export with archives/decoding enabled. Review findings without printing credential values. Do not suppress unresolved findings.
3. Set `VITRIS_AUDIT_CREDENTIAL_ROOT` to the private operator checkout for exact-value comparison with available local credentials. Run `npm run audit:package`; inspect the redacted report. Keep evidence in ignored `artifacts/`.
4. Verify npm package ownership/authentication, prepare the dedicated public repository from this fresh history, and review MIT/provenance notices. Release only the verified tarball with its source hash/checksum. Enable publication only with explicit authorization; repeat checks after source changes.

Users supply coding-agent access and their own Cloudflare account. No operator credentials are distributed. External media/references retain their own rights. Engineering checks and mocked Cloudflare tests do not establish a live deployment or human design preference win.
