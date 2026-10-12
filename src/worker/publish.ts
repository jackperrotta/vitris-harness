import { parseFrontmatter } from "../compile/frontmatter.ts";
import { defaultTitleFromPath, fileToPath } from "../compile/paths.ts";
import { motionAssetHref, motionJs } from "../runtime/scroll-motion.generated.ts";
import {
  beaconJs,
  compileAllPages,
  compileSite,
  robotsTxt,
  siteCss,
  siteIslands,
  sitemapXml,
} from "../compile/site.ts";
import { themeCss, mergeTheme } from "../theme.ts";
import type { Catalog, PageSource, SiteConfig, ThemeTokens } from "../types.ts";
import type { Env } from "./env.ts";
import { getFile, getMainSha, listTreeFiles, type GithubClientOpts } from "./github.ts";
import { bumpVersion, tenantById } from "./tenant.ts";
import { auditFragment } from "../knowledge/checks.ts";
import { workerProductionAllowed } from "../knowledge/launch-policy.ts";
import { COOKIE_COMPLIANCE_PATH } from "../runtime/cookie-compliance.ts";
import type { LaunchEvidence } from "../knowledge/contracts.ts";
import { decodeBundleFile, verifyPublishBundle, type SignedPublishBundle } from "../knowledge/publish-attestation.ts";
import { hash as blake3Hash } from "blake3-wasm";
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function mime(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export type TenantSiteBundle = {
  sha: string;
  site: SiteConfig;
  theme: ThemeTokens;
  pages: PageSource[];
  catalog: Catalog;
};

/** Load pages/ + components/ + site.json + theme from GitHub, with R2 cache by commit SHA. */
export async function loadTenantSiteFromGithub(
  env: Env,
  opts: {
    slug: string;
    owner: string;
    repo: string;
    ref?: string;
  },
): Promise<TenantSiteBundle> {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not configured on the kernel.");
  }
  const gh: GithubClientOpts = {
    token: env.GITHUB_TOKEN,
    owner: opts.owner,
    repo: opts.repo,
  };
  const ref = opts.ref || "main";
  const sha = await getMainSha(gh, ref);
  const cacheKey = `sites/${opts.slug}/bundle/${sha}.json`;
  const cached = await env.R2.get(cacheKey);
  if (cached) {
    return JSON.parse(await cached.text()) as TenantSiteBundle;
  }

  const siteFile = await getFile(gh, "site.json", ref);
  const site = JSON.parse(siteFile.text) as SiteConfig;
  let themePartial: Partial<ThemeTokens> = {};
  try {
    const themeFile = await getFile(gh, "theme/defaults.json", ref);
    themePartial = JSON.parse(themeFile.text) as Partial<ThemeTokens>;
  } catch {
    themePartial = {};
  }
  const theme = mergeTheme(themePartial);

  const tree = await listTreeFiles(gh, sha);
  const pageFiles = tree.filter((p) => p.startsWith("pages/") && p.endsWith(".html"));
  const componentFiles = tree.filter((p) => p.startsWith("components/") && !p.endsWith("/"));

  const pages: PageSource[] = [];
  for (const path of pageFiles.sort()) {
    const file = await getFile(gh, path, ref);
    const rel = path.slice("pages/".length);
    const { meta, body } = parseFrontmatter(file.text);
    const urlPath = fileToPath(rel);
    pages.push({
      path: urlPath,
      file: rel,
      title: meta.title || defaultTitleFromPath(urlPath),
      description: meta.description,
      indexing: meta.indexing === "noindex" || meta.indexing === "index" ? meta.indexing : undefined,
      lang: meta.lang,
      body,
    });
  }

  const byComponent = new Map<string, { html?: string; css?: string; island?: string }>();
  for (const path of componentFiles) {
    const parts = path.split("/");
    if (parts.length < 3) continue;
    const name = parts[1]!;
    const fileName = parts.slice(2).join("/");
    const entry = byComponent.get(name) || {};
    if (fileName === "template.html" || fileName === "styles.css" || fileName === "island.js") {
      const file = await getFile(gh, path, ref);
      if (fileName === "template.html") entry.html = file.text;
      if (fileName === "styles.css") entry.css = file.text;
      if (fileName === "island.js") entry.island = file.text;
      byComponent.set(name, entry);
    }
  }

  const catalog: Catalog = {};
  for (const [name, files] of byComponent) {
    if (!files.html || files.css == null) continue;
    catalog[name] = {
      html: files.html,
      css: files.css,
      island: files.island ?? null,
    };
  }

  const bundle: TenantSiteBundle = { sha, site, theme, pages, catalog };
  await env.R2.put(cacheKey, JSON.stringify(bundle), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return bundle;
}

export function distFilesFromBundle(opts: {
  bundle: TenantSiteBundle;
  kernelOrigin: string;
  publicOrigin?: string;
}): Record<string, string> {
  const { bundle } = opts;
  const compiled = compileAllPages(bundle.site, bundle.pages, bundle.catalog, opts.kernelOrigin);
  const pages = compileSite({
    site: bundle.site,
    pages: bundle.pages,
    catalog: bundle.catalog,
    kernelOrigin: opts.kernelOrigin,
    themeHref: "/theme.css",
    publicOrigin: opts.publicOrigin,
  });
  const files: Record<string, string> = {
    "site.css": siteCss(compiled, bundle.catalog),
    "theme.css": themeCss(bundle.theme),
    "beacon.js": beaconJs,
    "robots.txt": robotsTxt(),
    "sitemap.xml": sitemapXml(
      compiled.map((p) => p.path),
      opts.publicOrigin,
      [COOKIE_COMPLIANCE_PATH, ...(bundle.site.indexing === "noindex" ? compiled.map(page => page.path) : compiled.filter(page => page.indexing === "noindex").map(page => page.path))],
    ),
  };
  const islands = siteIslands(compiled, bundle.catalog);
  if (islands) files["islands.js"] = islands;
  if (compiled.some(page=>page.usesMotion)) files[motionAssetHref.slice(1)]=motionJs;
  for (const page of pages) {
    const rel =
      page.path === "/" ? "index.html" : `${page.path.replace(/^\//, "").replace(/\/$/, "")}/index.html`;
    files[rel] = page.html;
  }
  return files;
}

export async function putDist(env: Env, slug: string, files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(([path, body]) =>
      env.R2.put(`sites/${slug}/dist/${path}`, body, { httpMetadata: { contentType: mime(path) } }),
    ),
  );
}

export async function putTheme(env: Env, slug: string, css: string): Promise<void> {
  await env.R2.put(`sites/${slug}/theme.css`, css, { httpMetadata: { contentType: "text/css; charset=utf-8" } });
  await env.R2.put(`sites/${slug}/dist/theme.css`, css, { httpMetadata: { contentType: "text/css; charset=utf-8" } });
}

export async function publishSite(
  env: Env,
  opts: {
    tenantId: string;
    slug: string;
    pagesProject: string | null;
    owner: string;
    repo: string;
    kernelOrigin: string;
    launchEvidence?: LaunchEvidence;
  },
): Promise<{ ok: boolean; message: string }> {
  const bundle = await loadTenantSiteFromGithub(env, {
    slug: opts.slug,
    owner: opts.owner,
    repo: opts.repo,
  });
  const files = distFilesFromBundle({ bundle, kernelOrigin: opts.kernelOrigin });
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN && opts.pagesProject) {
    const buildHash = await sha256Hex(Object.keys(files).sort().map(key => `${key}\n${files[key]}`).join("\n"));
    const findings = Object.entries(files)
      .filter(([path]) => path.endsWith(".html"))
      .flatMap(([path, html]) => auditFragment(html, path));
    // This route has no authenticated CI attestation handoff yet. A JSON
    // `trusted` flag supplied by the caller is not an authentication boundary.
    const decision = workerProductionAllowed(opts.launchEvidence, findings, buildHash, false);
    if (!decision.launchAllowed) {
      return { ok: false, message: `Production Pages upload blocked before kernel preview storage changed. ${decision.summary}` };
    }
    await putDist(env, opts.slug, files);
    await putTheme(env, opts.slug, files["theme.css"]!);
    await bumpVersion(env, opts.tenantId);
    return uploadPages(env, opts.pagesProject, files);
  }
  await putDist(env, opts.slug, files);
  await putTheme(env, opts.slug, files["theme.css"]!);
  await bumpVersion(env, opts.tenantId);
  return {
    ok: true,
    message: "Saved. Preview is live on this kernel. Set CF_API_TOKEN and a Pages project to push the static site.",
  };
}

export async function publishAttestedBundle(env: Env, bundle: SignedPublishBundle, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  if (env.VITRIS_PREVIEW === "1") return { ok: false, message: "Production publishing is disabled in Worker Previews" };
  const verification = await verifyPublishBundle(bundle, env.PUBLISH_ATTESTATION_SECRET || "");
  if (!verification.ok) return { ok: false, message: verification.reason || "Invalid publish attestation" };
  const tenant = await tenantById(env, bundle.tenantId);
  if (!tenant || tenant.slug !== bundle.slug || (tenant.pages_project || tenant.slug) !== bundle.project || tenant.status !== "active") return { ok: false, message: "Signed publish target does not match an active tenant" };
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return { ok: false, message: "Cloudflare Pages credentials are not configured" };
  const files = Object.fromEntries(Object.entries(bundle.files).map(([path, raw]) => [path, decodeBundleFile(raw)]));
  const findings = Object.entries(files).filter(([path]) => path.endsWith(".html"))
    .flatMap(([path, bytes]) => auditFragment(new TextDecoder().decode(bytes), path));
  const evidence: LaunchEvidence = {
    trusted: true,
    buildHash: bundle.evidence.buildHash,
    policyHash: bundle.evidence.policyHash,
    knowledgeRelease: bundle.knowledgeRelease,
    browserVerifier: "ok",
    findings: bundle.evidence.findings,
    manualCoverage: "pending",
  };
  const decision = workerProductionAllowed(evidence, findings, bundle.artifact.sha256, true);
  if (!decision.launchAllowed) return { ok: false, message: decision.summary };
  const upload = await uploadPages(env, bundle.project, files, fetcher);
  if (!upload.ok) return upload;
  await Promise.all(Object.entries(files).map(([path, bytes]) =>
    env.R2.put(`sites/${bundle.slug}/dist/${path}`, bytes, { httpMetadata: { contentType: mime(path) } })));
  if (files["theme.css"]) await env.R2.put(`sites/${bundle.slug}/theme.css`, files["theme.css"]!, { httpMetadata: { contentType: mime("theme.css") } });
  await bumpVersion(env, bundle.tenantId);
  return upload;
}

async function uploadPages(
  env: Env,
  project: string,
  files: Record<string, string | Uint8Array>,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  if (env.VITRIS_PREVIEW === "1") return { ok: false, message: "Pages uploads are disabled in Worker Previews" };
  const base = "https://api.cloudflare.com/client/v4";
  const projectPath = `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${encodeURIComponent(project)}`;
  const apiToken = `Bearer ${env.CF_API_TOKEN}`;
  const entries = Object.entries(files).map(([path, body]) => {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error(`Pages asset exceeds 25 MiB: ${path}`);
    const base64 = Buffer.from(bytes).toString("base64");
    const filename = path.split("/").pop()!;
    const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1) : "";
    return { path, base64, hash: Buffer.from(blake3Hash(base64 + extension)).toString("hex").slice(0, 32), contentType: mime(path), size: bytes.byteLength };
  });
  if (entries.length > 20_000) return { ok: false, message: "Pages manifest exceeds 20,000 assets" };
  const request = async (path: string, init: RequestInit): Promise<{ ok: boolean; message: string; result?: unknown }> => {
    try {
      const res = await fetcher(`${base}${path}`, init);
      const payload = await res.json() as { success?: boolean; result?: unknown; errors?: { message: string }[] };
      if (!res.ok || !payload.success) return { ok: false, message: payload.errors?.[0]?.message || `Pages API failed (${res.status}): ${path}` };
      return { ok: true, message: "ok", result: payload.result };
    } catch (error) {
      return { ok: false, message: `Pages API failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  };
  const token = await request(`${projectPath}/upload-token`, { headers: { authorization: apiToken } });
  if (!token.ok) return token;
  const jwt = (token.result as { jwt?: string } | undefined)?.jwt;
  if (!jwt) return { ok: false, message: "Pages upload token response omitted JWT" };
  const assetHeaders = { authorization: `Bearer ${jwt}`, "content-type": "application/json" };
  const hashes = [...new Set(entries.map(entry => entry.hash))];
  const missing = await request("/pages/assets/check-missing", { method: "POST", headers: assetHeaders, body: JSON.stringify({ hashes }) });
  if (!missing.ok) return missing;
  if (!Array.isArray(missing.result) || missing.result.some(hash => typeof hash !== "string" || !hashes.includes(hash))) {
    return { ok: false, message: "Pages returned an invalid missing-assets list" };
  }
  const missingSet = new Set(missing.result as string[]);
  const pending = entries.filter(entry => missingSet.has(entry.hash));
  while (pending.length) {
    const batch: typeof pending = [];
    let size = 0;
    while (pending.length && batch.length < 2_000 && size + pending[0]!.size <= 40 * 1024 * 1024) {
      const entry = pending.shift()!;
      batch.push(entry);
      size += entry.size;
    }
    if (!batch.length) return { ok: false, message: "Pages asset batch exceeds 40 MiB" };
    const upload = await request("/pages/assets/upload", { method: "POST", headers: assetHeaders, body: JSON.stringify(batch.map(entry => ({ key: entry.hash, value: entry.base64, metadata: { contentType: entry.contentType }, base64: true }))) });
    if (!upload.ok) return upload;
  }
  const upsert = await request("/pages/assets/upsert-hashes", { method: "POST", headers: assetHeaders, body: JSON.stringify({ hashes }) });
  if (!upsert.ok) return upsert;
  const form = new FormData();
  form.append("manifest", JSON.stringify(Object.fromEntries(entries.map(entry => [`/${entry.path}`, entry.hash]))));
  form.append("pages_build_output_dir", "dist");
  const deployment = await request(`${projectPath}/deployments`, { method: "POST", headers: { authorization: apiToken }, body: form });
  return deployment.ok ? { ok: true, message: "Published to Cloudflare Pages." } : deployment;
}

export async function addPagesDomain(
  env: Env,
  project: string,
  hostname: string,
): Promise<{ ok: boolean; message: string }> {
  if (env.VITRIS_PREVIEW === "1") return { ok: false, message: "Domain changes are disabled in Worker Previews" };
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return { ok: false, message: "Set CF_ACCOUNT_ID and CF_API_TOKEN to attach custom domains." };
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${project}/domains`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CF_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: hostname }),
    },
  );
  const payload = (await res.json()) as { success?: boolean; errors?: { message: string }[] };
  if (!res.ok || !payload.success) {
    return { ok: false, message: payload.errors?.[0]?.message || `Domain attach failed (${res.status})` };
  }
  return { ok: true, message: `Added ${hostname}. Point a CNAME to ${project}.pages.dev.` };
}
