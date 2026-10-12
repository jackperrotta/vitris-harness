# Shared Vitris contact forms

One shared Worker serves preserved and generated/custom websites. Each site keeps its authored layouts, labels and controls. There is no structured website editor. The public `/api/leads` transport remains, but inferred Origin/Referer tenants, preview slugs, wildcard CORS and the old KV lead counter no longer authorize submissions. Existing leads and unrelated Gmail/Resend workflows are preserved.

## Configuration and migration

Apply additive migration `0004_contact_forms.sql` after the existing migrations. Back up D1 first for an authorized rollout. It does not enable any existing form or modify old lead rows/site configuration. Old assets without a registered `form_id`, retry UUID and challenge token receive a configuration error. Upgrade their assets with the setup workflow; keep a site disabled until verification is complete. Unconverted old forms need an accessible listed contact option during this transition.

The server stores `contact_forms.config_json`: stable global form ID, tenant ID, `disabled | test | live`, exact origins, field schema/mappings, recipients, and Turnstile sitekey/action/secret reference. Public `launch.json.forms` contains only `{ id, pagePath, index, sitekey, action }`. Backend origin alone enables neither submission nor live notifications. New sites have empty bindings and show a preview notice. Server mode decides acceptance; browser attributes cannot activate live delivery.

`vitris forms inspect --site SITE --json` builds and inventories forms. Only `data-lead-form` or recognized legacy `emailSendButton` contact forms qualify. Search/login/payment forms remain unrelated. File inputs, unknown hidden fields, custom submission handlers, unsupported control types, duplicate scalar names and unsupported multiple selects are reported; setup fails instead of discarding fields. Capture refuses unrelated interactive forms until an explicit preservation adapter exists. Attachments and visitor autoresponders are outside v1.

Setup infers bounded schemas from every named supported control. It recognizes `number`, `telephone`, `phone_number`, `phoneNumber` and `phone` as phone aliases, retaining their HTML names. Textarea limits can preserve the legacy 5,000-character field. All fields remain in the submission snapshot and notification; name/email/phone/message mappings also populate the existing production leads table. Choice values must match configured options; checkbox groups preserve multiple values. Schemas have at most 32 fields, 40 options/values per choice field, 8,000 characters per field and five server-configured recipients. A required visitor email mapping is mandatory. For deliberate schema/label/mapping changes, use `--forms-config FILE` with a `{forms:[...]}` array containing complete server configurations plus `pagePath` and `index`. Keep this operator file outside public assets. Stabilize authored form IDs explicitly when reordering forms.

## Local sandbox

`wrangler.forms-test.jsonc` has local resource placeholders, public test-only credentials, no email binding, and `FORMS_SANDBOX=1`, which forbids live activation. Never deploy it unchanged. Use a separate persistence directory; none of these commands applies a remote migration:

```powershell
npx wrangler d1 migrations apply vitris-forms-test --local --config wrangler.forms-test.jsonc --persist-to artifacts/contact-forms/wrangler-state
npx wrangler dev --local --config wrangler.forms-test.jsonc --persist-to artifacts/contact-forms/wrangler-state --port 8789 --test-scheduled
```

In another terminal, serve a **copy** of the acceptance project on a fixed port, then register that exact origin:

```powershell
$env:VITRIS_FORMS_SETUP_TOKEN = 'local-test-setup-key-never-use-in-production'
node bin/vitris.js forms inspect --site artifacts/contact-forms/dwperrotta-local --json
node bin/vitris.js forms setup --site artifacts/contact-forms/dwperrotta-local --tenant dw-test --backend-origin http://127.0.0.1:8789 --origins http://localhost:4173 --mode test --test-keys --json
# Review artifacts/forms/setup-plan.json, then reconcile:
node bin/vitris.js forms setup --site artifacts/contact-forms/dwperrotta-local --tenant dw-test --backend-origin http://127.0.0.1:8789 --origins http://localhost:4173 --mode test --test-keys --apply --json
node bin/vitris.js forms status --site artifacts/contact-forms/dwperrotta-local --tenant dw-test --backend-origin http://127.0.0.1:8789 --json
```

Use `vitris preview --site SITE --port 4173` to serve the copy. The scheduled test endpoint is Wrangler's `/__scheduled?cron=*/5%20*%20*%20*%20*`. It captures test notifications in D1. Do not bind remote mail to this sandbox.

The `--test-keys` preset prepares controlled tests with action `test`; it does not provide manual end-to-end acceptance against the public Siteverify endpoint. In the actual October 9 smoke check, Cloudflare accepted its public dummy token but returned hostname `example.com` with no action. The service correctly rejected that result for the configured local hostname/action. Official dummy tokens can also repeat; this service's replay guard rejects reuse of an accepted token. Use a real widget with server mode `test` for manual end-to-end acceptance, or the deterministic unique-token fixture in the browser tests. Do not weaken hostname/action verification or replay protection for dummy keys. The automated browser fixture calls the real submission handler and D1, but substitutes Siteverify and widget execution; it does not validate Cloudflare's live challenge execution.

## Provisioning and permissions

`forms setup` writes a reviewable `artifacts/forms/setup-plan.json`. Without `--apply`, it creates no cloud resources or server configuration. `--apply` registers an authorized tenant if absent, reconciles configurations, writes public frontend bindings while preserving other launch settings, builds the site, and fetches status. Same inputs reuse IDs/resources. Omitted forms are retained; disable them explicitly rather than deleting history. Default setup mode is disabled. Setup supports only disabled/test; live activation uses the reviewed configuration API.

The backend uses tenant-scoped automation credentials in the Worker secret `FORMS_SETUP_TOKENS`, a JSON object mapping tenant IDs to separate random tokens of at least 32 characters. The CLI receives one token through `VITRIS_FORMS_SETUP_TOKEN`. These credentials permit configuration, status and retry **only for that tenant**. Do not use the existing global deploy token. Owner sessions also work with the API; mutation requests require the backend's exact Origin as CSRF protection. Customer-dashboard retry controls have the same ownership/Origin checks. No operator API exposes a Turnstile secret.

Authenticated Cloudflare APIs work unattended; an available Cloudflare management MCP may perform the same operator actions, but is not a runtime dependency. No Cloudflare management MCP was connected during this implementation. Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for API provisioning. Required account permissions depend on the operation: Turnstile Read/Edit for widget inventory/allocation, Workers Scripts Read/Edit for Worker inspection/deployment/secrets, D1 Read/Edit for backup/resource creation/migrations, and KV/R2 permissions for the existing Worker bindings. Pages Edit is required for a separate preview deployment. Vitris sender onboarding requires access to the Vitris-owned zone, DNS Edit and Email Sending Edit; customer DNS is not involved. Verify token type and resource scope: account tokens use `/accounts/ACCOUNT/tokens/verify`, user tokens use `/user/tokens/verify`. Listing access alone does not prove write permission or Email Service availability.

Use `--cloudflare --worker ISOLATED_WORKER` to plan/reconcile Turnstile widgets. The command lists existing resources first. It pools exact hostnames under names `vitris-forms-pool-N`, reuses matching/capable managed widgets, leaves unmanaged widgets alone, and stops at free-plan capacity. Run account-wide pool updates serially; Cloudflare widget updates do not offer a cross-process allocation transaction. Retried setup reconciles partial completion. Supply the **complete current** `FORMS_TURNSTILE_SECRETS` JSON map in the operator environment when applying; `{}` is appropriate only for a new isolated Worker. The command fetches managed widget secrets and merges them into that map before writing the Worker secret. This prevents silently erasing other secret references. Never print or save this map in site assets.

Example plan (no cloud writes):

```powershell
node bin/vitris.js forms setup --site SITE --tenant TENANT --backend-origin https://ISOLATED-WORKER.workers.dev --origins https://HASH.PROJECT.pages.dev --mode test --cloudflare --worker ISOLATED-WORKER --json
```

Approve hashed preview URLs explicitly after deployment. Never approve `*.pages.dev`. The form origin registry prevents two tenants owning the same exact origin, and registration checks existing hostname ownership. The form service reads authoritative D1 configuration on each submission; it does not use the hostname KV cache for authorization. Different sites sharing a widget still have separate form/origin/action validation and database ownership.

## Worker readiness and Email Service

Keep these settings server-side:

| Setting | Purpose |
| --- | --- |
| `FORMS_TURNSTILE_SECRETS` | JSON map of secret references to Turnstile secrets |
| `FORMS_ABUSE_SECRET` | Random 32+ character HMAC secret for source counters; no raw IP storage |
| `FORMS_SETUP_TOKENS` | Separate tenant-scoped provisioning tokens |
| `FORMS_FROM` | Authenticated Vitris sender address; never supplied by the browser |
| `FORMS_SENDER_READY=1` | Operator attestation after domain authentication/account access verification |
| `FORMS_EMAIL` | Cloudflare Email Service `send_email` binding |
| `FORMS_TEST_EMAIL`, `FORMS_TEST_RECIPIENT` | Optional restricted operator sink; requires sandbox and authenticated sender |
| `FORMS_SANDBOX=1` | Prevent live activation on an isolated test backend |

Live readiness requires all mail settings, recipients, non-dummy Turnstile keys/secrets and approved HTTPS origins. Test readiness still requires challenge and abuse configuration. Test notifications are rendered/captured in D1 by default; the customer `FORMS_EMAIL` binding is never used for test records. A separately configured sandbox operator sink can send explicitly authorized test messages as described below. Missing settings appear in `forms status` and the leads dashboard and block live configuration/acceptance. The sender-ready flag is an operator attestation, not an automatic DNS or inbox-delivery check.

After **separate approval** for a shared-backend rollout, add a restricted binding to its reviewed Wrangler deployment configuration:

```json
{
  "send_email": [{
    "name": "FORMS_EMAIL",
    "allowed_sender_addresses": ["forms@YOUR-VITRIS-DOMAIN"],
    "allowed_destination_addresses": ["APPROVED-RECIPIENT@example.com"]
  }]
}
```

Use the structured `send()` builder with a Vitris From address and validated visitor email as `replyTo`. Recipients and field-schema labels come from the server-side acceptance snapshot. The binding must permit those recipients; do not assume an unrestricted binding can send to arbitrary addresses on every plan. Cloudflare's current sending guide requires Cloudflare DNS and sender-domain onboarding with authentication/bounce records. Check SPF, DKIM, DMARC, account availability and recipient restrictions before attesting readiness. Do not replace the existing Gmail/Resend login/operator mail workflows. [Sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/), [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/), [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

As checked October 9, 2026, sending is documented as beta. Arbitrary-recipient sending requires Workers Paid; the account includes 3,000 outbound emails/month, then $0.35/1,000. Verified-destination sends are free under the documented conditions. Include the Workers subscription plus D1 reads/writes/storage in budgeting; the new scheduler runs every five minutes (about 8,640 runs per 30 days) and handles at most 20 notifications per invocation. At low contact-form volume mail usage should normally fit the included allowance, but provider acceptance/bounces can count toward billing. [Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/).

Turnstile Free currently permits 20 widgets/account, 10 hostnames/widget and unlimited challenges. Pooling permits several sites per widget; server authorization remains exact per form. Reserve capacity for staging and customer origins instead of allocating a widget per form. [Current Turnstile plans](https://developers.cloudflare.com/turnstile/plans/).

## Acceptance, retry and delivery semantics

Requests require URL-encoded content, at most 32 KiB including chunked bodies, exact registered form/origin ownership, valid bounded fields and a v4 idempotency UUID. Browser-controlled recipient/sender fields and unknown fields are rejected. Honeypots reject without creating records. D1 conditional UPSERTs enforce 10 attempts/source/tenant and 100 attempts/tenant per ten-minute window atomically; these are fixed-window limits, not sliding limits. Failed challenge attempts consume budget. Keep Cloudflare edge protections for volumetric abuse; per-form validation is not a network-DDoS defense.

Siteverify must succeed with the configured action and requesting origin's exact hostname. Tokens are single-use/short-lived; the browser refreshes them after attempts. A token-specific deterministic UUID is used for Siteverify retries. A new challenge token does not reuse the old verification verdict. Accepted tenant/form/idempotency receipts are checked before another challenge verification; matching accepted retries return the existing receipt, while changed values return 409. A database-unique challenge digest also prevents accepted-token reuse with another submission key. [Siteverify contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

The `form_submissions` insert, outbox, compatible production lead and production conversion are one D1 transaction through an insertion trigger. Acknowledgement means durable acceptance, not email delivery. Production conversions are inserted once in D1; test submissions never enter production leads, conversions or Analytics Engine. Both modes preserve all configured fields.

The five-minute cron processes bounded batches with conditional claims, five-minute leases, eight attempts and exponential backoff (60 seconds, doubling to a six-hour cap). Abandoned leases are reclaimable; an abandoned final attempt becomes a visible terminal failure. Invalid sender/recipient/configuration errors become terminal immediately. Provider calls have a 30-second processing deadline; timeouts are ambiguous because the binding cannot cancel an in-flight send. The original daily analytics rollup still runs at `0 6 * * *`. Processing does not rely on `waitUntil`.

Statuses are `pending`, `processing`, `captured` (test), `accepted` (provider message ID/time), and `failed` (bounded actionable error code). The leads dashboard shows all fields, readiness and notification status, with a separate test view. Retry controls cannot target another tenant. Changing the configured mode pauses unmatched pending jobs; test jobs never become live jobs. Acceptance-time recipients are immutable snapshots; review pending jobs before changing recipient policy.

The provider interface receives the stable outbox ID for providers supporting idempotency. The current documented Cloudflare Workers send builder has **no idempotency parameter**; no invented header/key is sent. A crash or ambiguous timeout after provider acceptance but before the database update can cause a duplicate send on retry. A 30-second deadline or lease is not proof that an earlier send was canceled. Terminal manual retries also carry that risk. No exactly-once email or inbox-delivery guarantee is made. `accepted` is distinct from confirmed mailbox delivery; bounce/delivery webhooks are not implemented in v1. Use Cloudflare email logs when investigating provider acceptance and recipient delivery.

Leads keep the existing retention policy (no automatic lead deletion). Archiving does not delete PII. Deleting a production lead deletes its submission/receipt/outbox snapshot through a trigger; analytics retain their existing 90-day raw/400-day aggregate policy. Test submissions/captures expire after seven days, and rate counters after their window. Deleting an idempotency receipt removes replay protection for that record; expire data deliberately and rely on fresh challenge validation afterward. Operator setup plans and test screenshots may contain test data; never use customer PII in verification artifacts.

## Browser behavior and preservation

### Isolated Cloudflare acceptance deployment

`src/worker/forms-sandbox.ts` deploys the same submission, management and outbox handlers with only an isolated D1 binding. It requires `FORMS_SANDBOX=1`, exposes no login, customer dashboard, publishing, inbound email or analytics endpoints, and accepts tenant-scoped bearer credentials for configuration/status/retry. Its five-minute cron processes the durable outbox. Use real Turnstile credentials and exact preview hostnames; never deploy the local placeholder resources or dummy secrets remotely.

Test mode captures output by default. For an explicitly authorized operator email test, configure a **separate** `FORMS_TEST_EMAIL` send binding restricted by `destination_address` (and an authenticated sender restriction), plus server-side `FORMS_TEST_RECIPIENT`, `FORMS_FROM` and `FORMS_SENDER_READY=1`. This opt-in is permitted only on a sandbox backend. The outbox replaces all snapshotted recipients with the single operator sink and prefixes the subject with `[VITRIS TEST]`; browser fields cannot choose its recipient. Missing sink/sender configuration fails visibly without falling back to the customer binding. Status includes `sandboxMail` readiness. An `accepted` test record means provider acceptance, not inbox delivery. It remains a test submission with zero production leads/conversions and the existing seven-day test retention. Previously captured jobs remain captured; use fresh submissions after mail setup.

Example restricted operator binding (replace the authenticated Vitris sender):

```json
{
  "vars": {
    "FORMS_SANDBOX": "1",
    "FORMS_TEST_RECIPIENT": "operator@example.com",
    "FORMS_FROM": "forms-test@YOUR-VERIFIED-VITRIS-DOMAIN",
    "FORMS_SENDER_READY": "1"
  },
  "send_email": [{
    "name": "FORMS_TEST_EMAIL",
    "destination_address": "operator@example.com",
    "allowed_sender_addresses": ["forms-test@YOUR-VERIFIED-VITRIS-DOMAIN"]
  }]
}
```

The October 9 isolated deployment/evidence is under `artifacts/contact-forms/cloud-test-20261009/`. It uses `vitris-forms-sandbox-20261009`, a new D1 database, and the new `dwperrotta-forms-test-20261009` Pages project on the `sandbox` preview branch. The existing `vitris` database, original preserve preview and customer domains are outside this deployment. One real managed widget is shared by all nine route-level contact forms on that exact preview hostname. Its secrets are Worker secrets, never frontend assets. Local provisioning scripts reconcile their named resources on rerun and load Cloudflare credentials without printing them; `.private-secrets.json` is ignored and must stay operator-only.

Remote D1 execution exposed a nested `CASE ... END` trigger parsing failure. Migration 0004 now uses equivalent trigger `WHEN` clauses, which passed actual remote Wrangler migration execution as well as local ownership/atomicity tests. No preservation reference or frozen baseline was changed.

The shared runtime defers Turnstile until submission, preserves fields, HTML constraints and labels, prevents concurrent requests, retains the retry UUID after an ambiguous failure, and suppresses resubmission of the same successfully accepted values. It provides live status/alert regions and distinct errors for validation, expiry, rate limits, unavailable challenge/backend and timeouts. It claims only saved acceptance; test feedback explicitly says no customer email will be sent. Without JavaScript, a visible `noscript` notice directs visitors to listed contact details, and native POST cannot bypass challenge/idempotency validation.

Preservation CSP adds only the configured backend and `https://challenges.cloudflare.com` to the required script/connect/frame directives for connected forms. The verifier's request policy admits only that backend's `/api/leads` and required challenge paths, with controlled responses during UI verification. Old services remain blocked. Resting-page screenshots use the original references and unchanged 0.5% threshold; intentional challenge/submission states are verified separately. Generated-site verification uses the same narrowly mocked challenge/acceptance adapter and blocks other outbound mutations. Passing those mocks does not establish live backend readiness.

## Staged rollout and rollback

1. Review local evidence under `artifacts/contact-forms/`, including read-only account inspection. The inspected account had an active account token, zero widgets, zero listed Workers and the existing `vitris` D1 database. The configured `vitris-backend` Worker settings lookup returned 404. Resolve the intended deployed Worker/account/resource mapping before any remote change.
2. Create a separately named sandbox Worker/database using a reviewed copy of the test configuration with real isolated resource IDs. Retain `FORMS_SANDBOX=1`; enable no customer mail binding. Apply migrations there, provision real widgets for exact isolated preview hostnames and execute the test-mode acceptance checks with real Turnstile. Establish actual account Email Service availability and Vitris sender setup separately.
3. Review permissions, recipient lists, sender restrictions and all field mappings. Back up the existing shared backend/D1. Only after explicit rollout authorization, deploy the additive migration, code and notification cron/binding. Keep every customer form disabled while its asset/configuration migration is staged.
4. Activate one reviewed tenant/form in `test`, inspect captured output and exact challenge hostname/action, then obtain separate authorization for `live` configuration and customer notifications. No customer-domain migration is part of this forms rollout. Existing preview hosts can remain previews; domains require their own approval/workflow.
5. Monitor pending age, terminal codes, rate limits, provider acceptance and mail logs. Expand tenant by tenant. Confirm retention and deletion operations before broad activation.

Rollback first sets affected forms to `disabled` using the tenant-scoped API, pausing future acceptance and pending mismatched jobs. Preserve D1 leads/outbox for investigation. Restore previously verified disabled preview assets; do not restore an insecure origin-inferred public lead handler. If needed, pause the added notification cron while preserving the daily analytics schedule. Re-enable only after reviewing pending jobs and possible duplicate-send windows. No destructive migration rollback or deletion of old lead history is required.

## Verification commands

```powershell
node --experimental-strip-types --test src/contact-forms.test.ts src/contact-forms-operations.test.ts src/contact-forms-browser.test.ts src/lead-forms.test.ts src/preserve.test.ts
npm run typecheck
npm run build:cli
npm run verify:package
```

Tests use the installed Wrangler/Miniflare D1 simulator and real migrations; mail providers are fakes and browser challenge execution/Siteverify are controlled fixtures. No remote migrations, customer messages, production-backend changes or customer-domain changes are part of this implementation verification.
