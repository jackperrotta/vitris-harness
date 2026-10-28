# Deployment

Build and verify on your own computer, then upload the finished files directly to Cloudflare Pages. GitHub stores authored source and the lockfile. Keep generated `dist/`, staged bundles, receipts, and credentials out of Git.

After setting `launch.json.pagesProject` and the production `launch.json.publicOrigin`, install dependencies and Chromium and authenticate with your own Cloudflare account:

```sh
npm ci
npx playwright install chromium
npx wrangler login
npm run deploy:preview
# After accepting the preview and explicitly choosing production publication:
npm run deploy
```

The deploy command builds locally, verifies the release, stages the exact checked files, uploads them, and checks the hosted URL. New sites have no active GitHub deployment workflow. Source pushes do not publish the website.

For an existing Git-connected Cloudflare Pages project, disable automatic production and preview branch deployments before using local uploads. Keep the existing project and domains. See the installed harness's `docs/CLOUDFLARE.md` for migration and optional backend publishing.

Preservation sites use `npm run deploy` for temporary previews only; production remains unsupported.

## Optional hosted automation

`github-actions.yml.example` is inactive in this directory. An owner choosing GitHub-hosted deployment can copy it to `.github/workflows/deploy.yml`, review its triggers, and configure protected secrets. Hosted CI is subject to the provider's usage limits. Do not enable a second automatic deployment path for the same site. Backend Worker publication retains the signed bundle and preflight checks in the example.
