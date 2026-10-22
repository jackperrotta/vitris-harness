# Cloudflare template library

The authoritative template library is Cloudflare R2 `vitris-assets/templates/`, served by `https://vitris-templates.jack-896.workers.dev`. The default artifact is `artifacts/templates/gallery.html`; open it through `npm run templates:gallery` (`http://127.0.0.1:4390/`) or `npm run templates -- gallery`. It reads the live remote catalog on opening, every minute while visible, and on focus/network return, so new publications appear automatically. The artifact contains only the gallery UI, its UI font and display/search logic. `src/agent/theme-cloud.json` remains a metadata snapshot for harness selection and accepted design identities; the default artifact does not read that snapshot. Source archives are private R2 objects; the public Worker never serves them. Historical compatibility source retained in the repository is original Vitris material; local template media is not included.

Use this workflow for every new or revised demonstration. Author complete routes, CSS, interactions, photographs, fonts, license notices, original downloads and provenance in a **dedicated transient staging directory**, outside `src/agent/industry`. Do not accumulate permanent local specimen folders, generated originals, portable copies, package snapshots or thumbnail caches. Cloudflare is the final storage destination.

The staging bundle contains `template.json`, page recipe JSON, original source and local asset files. `template.json` contains:

```json
{
  "entry": {
    "theme": { "id": "industry-name", "release": "2026-10-10.1", "name": "Template Name", "description": "...", "tokens": {}, "principles": [], "image": "...", "motion": "...", "freedoms": "...", "brandRule": "...", "license": "..." },
    "browse": { "family": "Contemporary", "primaryIdentity": "Warm", "identities": ["Warm", "Direct"], "primaryCollection": "Industry templates", "collections": ["Industry templates"], "industry": "Industry", "industries": ["Industry"], "media": "photo-led", "tasks": ["call"], "fit": ["industry"], "order": 0, "new": true },
    "business": "Fictional Business", "audience": "...", "industry": "Industry", "fonts": [],
    "pages": [{ "pageId": "home", "path": "/", "label": "Homepage", "role": "home", "group": "Explore", "featured": true, "compareRole": "home", "previewPriority": 0 }]
  },
  "recipes": { "home": "pages/home.json" },
  "assets": [{ "id": "template-photo", "localFile": "media/photo.webp", "file": "photo.webp", "mime": "image/webp", "kind": "image", "sha256": "SHA256_OF_FILE", "bytes": 123, "source": "PROVENANCE", "license": "LICENSE" }]
}
```

The example omits full tokens and substantive pages for readability; supply all required design tokens and a validated complete route manifest. Font records additionally supply `licenseFile`, `licenseLocalFile`, `licenseHash`, `family`, `weights` and applicable provenance. Page JSON has `{ "original": "COMPLETE_HTML", "brand": "COMPLETE_HTML" }`; both documents include styles and scripts. Media URLs are immutable `ORIGIN/templates/assets/SHA256/FILE`. Use `__VITRIS_PAGE_PAGEID__` for internal links, `__VITRIS_RETURN__` for gallery return, and `__VITRIS_LOGO__`, `__VITRIS_BRAND_NAME__`, `__VITRIS_CSS_VARS__` in the customer-branded document. Preserve fictional notices and local-only interactions. Do not transfer demo facts or its sitemap into a customer site.

Template maintenance is optional. To maintain your own hosted library, provision your own Cloudflare Worker and R2 bucket using `cloudflare/wrangler.templates.jsonc`; set `VITRIS_TEMPLATE_ORIGIN` to your Worker HTTPS origin and `VITRIS_TEMPLATE_BUCKET` to your bucket. Supply your own `CF_ACCESS_KEY_ID`, `CF_SECRET_ACCESS_KEY`, and `CF_S3_API_ENDPOINT` in ignored local environment configuration. These credentials are never supplied by the harness. The built-in Vitris gallery is a public read service; it grants no account access.

With explicit publication authorization, run `npm run templates -- publish --bundle ABSOLUTE_STAGING_DIRECTORY`. The publisher verifies asset digests and font notices, stores recoverable source privately, uploads content-addressed pages and manifests, checks every public route plus desktop/mobile loading, and changes the catalog pointer only after validation. It uses an ETag condition to avoid replacing concurrent catalog changes. Existing immutable versions remain in R2. It removes only staging files whose bytes still match the verified snapshot. Never delete before publication or manufacture preference labels. The default artifact refreshes the published catalog automatically; no gallery restart is required.

Run `npm run templates -- verify` to check the hosted catalog. For edits, `npm run templates -- restore-source --id ID --out NEW_TRANSIENT_DIRECTORY` retrieves verified source, then republish and discard staging. Preserve frozen baselines. Legacy multipart recovery remains private maintainer tooling.

The gallery requires network access for hosted templates. Display-brand thumbnails are captured in memory when requested; original-palette thumbnails live in Cloudflare. The harness never writes migrated demo thumbnails to its local disk cache, and never silently substitutes an original thumbnail for a customer-branded one.

For an explicitly authorized Unicode-icon migration, restore the template into transient staging, run `npm run templates:icons -- --bundle ABSOLUTE_DIRECTORY` to inspect the plan, then add `--apply` to change the recipe sources. Inspect original and branded pages, desktop/mobile controls, CSS pseudo-elements and dynamic states before publishing a new immutable revision with the existing publisher. The migration keeps arithmetic, keyboard notation and plain-text download content as text. Existing static SVG artwork and typography remain unchanged. Every recipe includes only its used inline SVG or CSS masks; no catalog or icon runtime is loaded. For a media-preserving migration, complete editable recipe documents may reference the existing immutable assets and prior private authoring archive; record that lineage in the new bundle rather than copying template media into harness source.
