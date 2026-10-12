# Release and credential safety

The npm beta uses an explicit file allowlist. Local credentials, operator configuration, customer captures, tests, historical archives, plans and runtime receipts are excluded. esbuild receives no secret-valued environment definitions. Integrations read the installing user's environment or Worker secret bindings.

`npm pack` builds and runs audit:package. The audit opens the actual tarball, checks every filename, detects common provider tokens/private keys/credential URLs, rejects known operator infrastructure IDs, and compares bytes against credential values available in the process environment and local credential files, including encoded forms. Reports contain file locations and rule names, never matched values. Exact-value checking covers only credentials accessible to the process; it cannot establish the absence of unknown keys.

Install a verified Gitleaks release binary and set GITLEAKS_BIN to its executable before `npm run audit:package`. This independent detection layer is required by release CI. Use full redaction and archive/decoding inspection. Re-audit after any source, build, dependency or content change. Keep the final tarball SHA-256 and audit report privately under artifacts/.

The prepublishOnly guard refuses publication. No workflow publishes packages. Enabling publication is a separate owner-authorized change and requires another release review. Prefer npm trusted publishing over a saved npm write token when publication is authorized.

Before making a repository public, separately scan all Git history and uncommitted public source. A clean npm package does not make existing history safe. Historical archives and customer experiments stay private. Never rewrite frozen baselines to remove findings. Revoke/rotate any real disclosed credential with its provider and address repository history separately.

Report vulnerabilities privately to the repository owner using GitHub private vulnerability reporting when enabled. Do not include credentials, customer data or exploit details in public issues.
