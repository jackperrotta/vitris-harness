# Use your own Cloudflare account

Local authoring, compilation and preview require no Cloudflare account or API keys. Hosting is an explicit later operation. These examples provision resources in your own account.

## Static customer websites

Create a Cloudflare account. From the customer directory run `npx wrangler login`, check the account with `npx wrangler whoami`, and run `npx wrangler pages project create YOUR_PROJECT`. Set `launch.json.pagesProject` to that name. CI uses your own `CLOUDFLARE_ACCOUNT_ID` and an account-scoped token with Pages Edit access, stored in protected CI secrets. Never put a token in launch.json, HTML, assets or Git.

Run `npm run build` and `npm run preflight` locally. Run `npm run deploy` only when you intend to upload. Accept the hosted preview before separate custom-domain and DNS changes. Preservation mode supports temporary previews; follow PRESERVE.md for its narrower contract.

## Optional backend Worker

Copy `node_modules/@vitris/harness/cloudflare/wrangler.jsonc` to a dedicated backend directory. Set `main` to the installed harness's `bin/cloudflare/backend.js` and `migrations_dir` to its `migrations` directory, relative to the copied config. Install Wrangler there. Choose your own Worker, database, bucket, namespace, workflow and analytics dataset names.

After `npx wrangler login`, provision your resources:

```sh
npx wrangler d1 create my-vitris
npx wrangler kv namespace create KV
npx wrangler r2 bucket create my-vitris-assets
```

Replace the D1 and KV placeholders with the returned IDs. Account selection uses your login or your own CLOUDFLARE_ACCOUNT_ID. Initialize the database explicitly with `npx wrangler d1 migrations apply my-vitris --remote --config wrangler.jsonc`.

Generate your own long random session secret and run `npx wrangler secret put SESSION_SECRET --config wrangler.jsonc`. Keep DEV_LOGIN unset in production. Optional email/GitHub integrations use your credentials through `wrangler secret put`. Worker-managed Pages publication additionally needs your own CF_ACCOUNT_ID, narrowly scoped CF_API_TOKEN, and matching PUBLISH_ATTESTATION_SECRET in the Worker and protected site CI. Direct static Pages hosting does not require these Worker features.

Validate without deploying using `npx wrangler deploy --dry-run --config wrangler.jsonc`. Deploy explicitly when ready and set the resulting URL in the customer's launch.json.backendOrigin. Contact form registration, allowed origins, delivery and Turnstile setup are separate; follow CONTACT-FORMS.md and test delivery before launch.

Optional template-library and isolated form-test configs also use your resources. The public Vitris demonstration library is a separate hosted service; browsing it conveys no credentials or ownership of its assets.

## Credentials

Keep local .dev.vars and .env files ignored. Use Cloudflare secrets and protected CI secrets in production. Copy public configuration, never another operator's credential files. Wrangler's authentication cache stays outside the package. See SECURITY.md for release auditing.

Cloudflare references: [configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Optional repository previews

The Worker preview GitHub workflow is disabled by default. A repository owner may opt in with the `VITRIS_WORKER_PREVIEW_ENABLED=true` repository variable after provisioning their own isolated preview resources and GitHub secrets. No account credentials are included in source.

Template library maintainers also configure their own `VITRIS_TEMPLATE_ORIGIN`, `VITRIS_TEMPLATE_BUCKET`, R2 S3 endpoint, and access credentials; see `agent/refs/template-library.md`. Static-site users can use the public gallery without those credentials.
