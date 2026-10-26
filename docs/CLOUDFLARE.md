# Use your own Cloudflare account

Local authoring, compilation and preview require no Cloudflare account or API keys. Hosting is an explicit later operation. These examples provision resources in your own account.

## Static customer websites

Create a Cloudflare account. From the customer directory run `npx wrangler login`, check the account with `npx wrangler whoami`, and run `npx wrangler pages project create YOUR_PROJECT`. Set `launch.json.pagesProject` to that name. CI uses your own `CLOUDFLARE_ACCOUNT_ID` and an account-scoped token with Pages Edit access, stored in protected CI secrets. Never put a token in launch.json, HTML, assets or Git.

Run `npm run build` and `npm run preflight` locally. Run `npm run deploy` only when you intend to upload. Accept the hosted preview before separate custom-domain and DNS changes. Preservation mode supports temporary previews; follow PRESERVE.md for its narrower contract.

## Optional backend Worker

Copy `node_modules/@tryvitris/website-harness/cloudflare/wrangler.jsonc` to a dedicated backend directory. Set `main` to the installed harness's `bin/cloudflare/backend.js` and `migrations_dir` to its `migrations` directory, relative to the copied config. Install Wrangler there. Choose your own Worker, database, bucket, namespace, workflow and analytics dataset names.

After `npx wrangler login`, provision your resources:

```sh
npx wrangler d1 create my-vitris
npx wrangler kv namespace create KV
npx wrangler r2 bucket create my-vitris-assets
```

Replace the D1 and KV placeholders with the returned IDs. Account selection uses your login or your own CLOUDFLARE_ACCOUNT_ID. Initialize the database explicitly with `npx wrangler d1 migrations apply my-vitris --remote --config wrangler.jsonc`.

Generate your own long random session secret and run `npx wrangler secret put SESSION_SECRET --config wrangler.jsonc`. Keep DEV_LOGIN unset in production. Optional email/GitHub integrations use your credentials through `wrangler secret put`. Worker-managed Pages publication additionally needs your own CF_ACCOUNT_ID, narrowly scoped CF_API_TOKEN, and matching PUBLISH_ATTESTATION_SECRET in the Worker and protected site CI. Direct static Pages hosting does not require these Worker features.

Apply all migrations, including `0005_auth.sql`, before upgrading the Worker. This upgrade intentionally invalidates old KV sessions and magic links. Production creates no demo users: provision legitimate tenant/user/membership rows through your own controlled D1 administration, using your actual owner/operator email and generated UUIDs. Never import the local demo operator into production.

Configure production sign-in delivery with either GMAIL_SA_CLIENT_EMAIL, GMAIL_SA_PRIVATE_KEY and GMAIL_IMPERSONATE (or MAIL_FROM), or MAIL_API_KEY and MAIL_FROM for Resend. Keep VITRIS_BACKEND_ORIGIN set to the HTTPS administration origin. Missing mail configuration returns an unavailable response; failed delivery never exposes a sign-in link. Verify delivery to your own account before onboarding users.

### Private GitHub site previews

Set PREVIEW_HOST_SUFFIX to a dedicated domain such as `previews.your-domain.example` and route `*.previews.your-domain.example` to this Worker using your own DNS, Worker routes and TLS configuration. Reserve that suffix exclusively for Vitris previews. APP_HOST, OPS_HOST and the backend origin must remain outside it. A tenant with slug `acme` renders at `https://acme.previews.your-domain.example/preview/acme/`; no administration or APIs run on that host.

Open `/preview/acme/` from the signed-in admin app. Owners can open only their own tenant; operators can open any registered tenant. The app redirects using a signed 15-minute access handoff, which becomes a host-only HttpOnly cookie before any customer HTML renders. Keep that handoff private. Preview requests verify the session in D1, enforce the selected GitHub branch and stop working after logout or expiry. Reopen from the admin app to renew access. With no separate preview suffix, hosted previews remain unavailable. Public customer sites still deploy independently to Pages; local CLI previews are unchanged.

### Validate and launch

Validate without deploying using `npx wrangler deploy --dry-run --config wrangler.jsonc`. Deploy explicitly when ready and set the resulting URL in the customer's launch.json.backendOrigin. Contact form registration, allowed origins, delivery and Turnstile setup are separate; follow CONTACT-FORMS.md and test delivery before launch.

Optional template-library and isolated form-test configs also use your resources. The public Vitris demonstration library is a separate hosted service; browsing it conveys no credentials or ownership of its assets.

## Credentials

Keep local .dev.vars and .env files ignored. Use Cloudflare secrets and protected CI secrets in production. Copy public configuration, never another operator's credential files. Wrangler's authentication cache stays outside the package. See SECURITY.md for release auditing.

Cloudflare references: [configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Optional repository previews

The Worker preview GitHub workflow is disabled by default. A repository owner may opt in with the `VITRIS_WORKER_PREVIEW_ENABLED=true` repository variable after provisioning their own isolated preview resources and GitHub secrets. No account credentials are included in source.

Template library maintainers also configure their own `VITRIS_TEMPLATE_ORIGIN`, `VITRIS_TEMPLATE_BUCKET`, R2 S3 endpoint, and access credentials; see `agent/refs/template-library.md`. Static-site users can use the public gallery without those credentials.
