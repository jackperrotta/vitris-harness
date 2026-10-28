# Release and credential safety

## Optional backend authentication and previews

Production sign-in requires HTTPS, a 32+ character SESSION_SECRET and configured Gmail service-account or Resend delivery. Missing or failed delivery never displays or logs authentication tokens. Known and unknown emails receive the same normal login response. D1 enforces per-email and per-source login limits. Demo seeding and direct development login require explicit DEV_LOGIN on a local request.

Apply migrations through `0005_auth.sql` before upgrading a backend. Sessions and hashed magic links now live in primary D1 storage. Link redemption uses an atomic DELETE RETURNING; logout deletes the server session and requires a same-origin POST. Production uses host-only `__Host-` cookies with Secure, HttpOnly and SameSite=Lax. Old KV sessions and links are not migrated; sign in again after upgrading. The scheduled handler prunes expired authentication rows.

Customer HTML never renders on an admin origin. Configure a dedicated PREVIEW_HOST_SUFFIX routed to the Worker. Each tenant receives its own hostname and host-only preview cookie. An authenticated owner or operator can create a signed, tenant/branch/host-scoped handoff lasting at most 15 minutes. Every request checks the backing D1 session, so logout also revokes previews. Preview hosts expose no admin routes or APIs; customer service workers and embedding are disabled. Handoff responses remove the bearer URL before rendering and send no-store/no-referrer headers. Keep the preview domain separate from admin hosts and do not route unrelated applications under it. Public R2 asset routes do not expose cached repository bundles or active documents.

## Package auditing

The npm package uses an explicit file allowlist. Local credentials, operator configuration, customer captures, tests, historical archives, plans and runtime receipts are excluded. esbuild receives no secret-valued environment definitions. Integrations read the installing user's environment or Worker secret bindings.

`npm pack` builds and runs audit:package. The audit opens the actual tarball, checks every filename, detects common provider tokens/private keys/credential URLs, rejects known operator infrastructure IDs, and compares bytes against credential values available in the process environment and local credential files, including encoded forms. Reports contain file locations and rule names, never matched values. Exact-value checking covers only credentials accessible to the process; it cannot establish the absence of unknown keys.

Install a verified Gitleaks release binary and set GITLEAKS_BIN to its executable before `npm run audit:package`. This independent detection layer is required by release CI. Use full redaction and archive/decoding inspection. Re-audit after any source, build, dependency or content change. Keep the final tarball SHA-256 and audit report privately under artifacts/.

The prepublishOnly guard verifies the public @tryvitris/website-harness identity, registry, visibility, `latest` tag for stable versions (`beta` for prereleases), and packed-release audit. No workflow publishes packages. Releases require owner authorization and verification of the final source and tarball. Prefer npm trusted publishing for automated releases; interactive local releases use the maintainer's npm login and 2FA.

Before making a repository public, separately scan all Git history and uncommitted public source. A clean npm package does not make existing history safe. Historical archives and customer experiments stay private. Never rewrite frozen baselines to remove findings. Revoke/rotate any real disclosed credential with its provider and address repository history separately.

Report vulnerabilities privately to the repository owner using GitHub private vulnerability reporting when enabled. Do not include credentials, customer data or exploit details in public issues.
