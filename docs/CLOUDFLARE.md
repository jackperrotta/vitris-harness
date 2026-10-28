# Use your own Cloudflare account

Optional business admins use separate Workers, D1, R2 and Cloudflare Email Service authentication in the customer's intended account. See [ADMIN.md](ADMIN.md) for local `vitris admin setup`, explicit provisioning/owner bootstrap/DNS/migrations/deployment, and deployed backend compatibility checks. Setup never deploys or migrates a shared existing backend.

Local authoring, compilation and preview require no Cloudflare account or API keys. Hosting is an explicit later operation. These examples provision resources in your own account.

## Static customer websites

The default is to build and verify on the operator's computer and upload the finished bundle directly to Cloudflare Pages. GitHub stores source and history; no GitHub Actions or Cloudflare Git builds are required. New sites ship an inactive hosted-workflow example under `deployment/`, outside `.github/workflows/`.

Create a Cloudflare account. From the customer directory run `npx wrangler login`, check the account with `npx wrangler whoami`, and run `npx wrangler pages project create YOUR_PROJECT` to create a Direct Upload project. Set `launch.json.pagesProject` to that name and `launch.json.publicOrigin` to the intended production HTTPS origin. Never put credentials in launch.json, HTML, assets or Git. An unattended operator may use their own `CLOUDFLARE_ACCOUNT_ID` and an account-scoped token with Pages Edit access in ignored environment configuration.

After dependency installation and `npx playwright install chromium`, run `npm run deploy:preview` for a hosted preview. After accepting the preview, run `npm run deploy` only when you intend to publish production. These scripts invoke `vitris deploy` with an explicit environment: local build and verification, exact-byte staging, direct upload, deployment receipt, and HTTP smoke check. Ordinary publishing retains the full verification gates. Keep `dist/`, `agent/release-bundles/`, `agent/release-candidate.json`, and `agent/releases/` ignored in Git. Local builds can be repeated without invoking a hosted build service; Cloudflare hosting, API, file and backend quotas still apply.

Preservation mode supports temporary previews only; its `npm run deploy` selects preview. Follow PRESERVE.md for its narrower contract. Custom-domain and DNS changes remain separate explicit launch steps. The computer must be online and authenticated during an upload; Cloudflare serves the deployed site independently afterward.

### Adopt local uploads in an existing site

Installing a new harness version does not rewrite customer package scripts, authored files, workflow state or remote Cloudflare settings. Review each site's publication contract before making changes, especially if it uses authenticated backend Worker publication.

1. Keep the existing Pages project, domains and `launch.json` settings. For a Git-connected Pages project, turn off automatic production branch deployments and set preview branches to None in Cloudflare's branch controls. Wrangler can still deploy directly to the existing project.
2. Review and disable the site's automatic GitHub deployment workflow so source pushes do not create a second publication path. Keep any independently chosen test-only CI.
3. Set the site's package scripts to `node ./node_modules/@tryvitris/website-harness/bin/vitris.js deploy --site . --environment production` for `deploy` and the same command with `--environment preview` for `deploy:preview`. Preservation sites must use preview for both. Keep quick publish separate and explicitly requested.
4. Add the generated output paths listed above to `.gitignore`, preserving existing rules. Keep source and the lockfile in Git. Moving already tracked output to ignored status requires reviewing the site's index; an ignore rule alone does not untrack files.
5. Authenticate with the site's own Cloudflare account, accept a direct-upload preview, then publish production only when requested. Check the receipt and hosted smoke result.

See Cloudflare's [Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [disabling automatic Git deployments](https://developers.cloudflare.com/pages/configuration/git-integration/#disable-automatic-deployments).

### Optional hosted automation

An operator may explicitly choose hosted builds. To use GitHub Actions, review and copy `deployment/github-actions.yml.example` into `.github/workflows/deploy.yml` and configure protected credentials. The example retains production/preview preflight and authenticated backend bundle signing where configured. Hosted CI uses the selected provider's allowance. Cloudflare Git integration is another opt-in alternative; its build must install Chromium and run the required site preflight before publication. Enable one publication path for each site.

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


For an explicitly requested quick publish, use `vitris deploy --quick --environment production` (`npm run deploy:quick` in newly scaffolded sites). This rebuilds and deploys without browser, graph or launch review gates. Compilation, Cloudflare credentials, staged-file integrity and an HTTP smoke check still run. Receipts record build-only verification. Preservation sites use `--environment preview` and also skip screenshot comparisons. Ordinary deployment retains full preflight.
