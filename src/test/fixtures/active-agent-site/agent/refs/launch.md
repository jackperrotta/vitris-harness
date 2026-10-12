# Launch (optional)

Only when the operator asks after `preview_ready`.

1. `gh repo create ORG/SLUG --source . --private --push` (or push to existing remote).
2. Set the real `launch.json.publicOrigin` and Cloudflare Pages build command to `npm ci && npx playwright install chromium && npm run build && npm run preflight`, output `dist`, production `main`. Set `VITRIS_SITE_ENVIRONMENT=production` on the production branch. Preview branches use `preview` and remain diagnostic. A direct `wrangler pages deploy` must follow a successful current preflight on the exact `dist` bytes.
3. Register tenant in kernel `/ops`: owner email (`launch.json` → `ownerEmail`), `pages_project`, `github_owner`, `github_repo`.
4. Fill `launch.json` → `github`, `publicOrigin` when known.
5. Owner admin: `{kernelOrigin}/app/login` with `ownerEmail`.

Do not merge secrets into git. Use `.env` for Cloudflare tokens.
