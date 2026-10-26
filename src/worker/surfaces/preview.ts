import { motionAssetHref, motionJs } from "../../runtime/scroll-motion.generated.ts";
import {
  beaconJs,
  compileAllPages,
  compilePage,
  renderDocument,
  robotsTxt,
  siteCss,
  siteIslands,
  sitemapXml,
} from "../../compile/site.ts";
import { themeCss } from "../../theme.ts";
import type { Env } from "../env.ts";
import { kernelOrigin } from "../env.ts";
import { html, text } from "../http.ts";
import { loadTenantSiteFromGithub } from "../publish.ts";
import { tenantBySlug } from "../tenant.ts";
import { isPreviewHost, previewHandoff, previewRequest } from '../preview-access.ts';

export async function handlePreview(env: Env, request: Request): Promise<Response> {
  if (!isPreviewHost(env,request)) return previewHandoff(env,request);
  const access=await previewRequest(env,request);
  if (access instanceof Response) return access;
  // Customer code cannot register a credential-intercepting service worker.
  if (request.headers.has('service-worker')) return text('Service workers are disabled in hosted previews',403);
  const response=await renderPreview(env,access.request);
  response.headers.set('cache-control','no-store');
  response.headers.set('referrer-policy','no-referrer');
  response.headers.set('x-content-type-options','nosniff');
  response.headers.set('content-security-policy',"frame-ancestors 'none'; worker-src 'none'; object-src 'none'");
  return response;
}

async function renderPreview(env:Env,request:Request):Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/preview\/([^/]+)(?:\/(.*))?$/);
  if (!match) return text("Not found", 404);
  const slug = match[1]!;
  const rest = (match[2] || "").replace(/\/$/, "");
  const tenant = await tenantBySlug(env, slug);
  if (!tenant) return text("Unknown site", 404);
  if (!tenant.github_owner || !tenant.github_repo) {
    return text(
      "This site has no GitHub owner/repo. Register github_owner and github_repo in /ops, then retry preview.",
      400,
    );
  }

  let bundle;
  try {
    bundle = await loadTenantSiteFromGithub(env, {
      slug,
      owner: tenant.github_owner,
      repo: tenant.github_repo,
      ref: url.searchParams.get("ref") || "main",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load site from GitHub";
    return text(message, 502);
  }

  const origin = kernelOrigin(env, request);
  const prefix = `/preview/${slug}`;
  const compiled = compileAllPages(bundle.site, bundle.pages, bundle.catalog, origin);
  if(rest===motionAssetHref.slice(1)) return compiled.some(page=>page.usesMotion)
    ? new Response(motionJs,{headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"public, max-age=31536000, immutable"}})
    : text("Not found",404);

  if (rest === "site.css") {
    return new Response(siteCss(compiled, bundle.catalog), {
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  }
  if (rest === "theme.css") {
    return new Response(themeCss(bundle.theme), {
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  }
  if (rest === "beacon.js") {
    return new Response(beaconJs, { headers: { "content-type": "text/javascript; charset=utf-8" } });
  }
  if (rest === "islands.js") {
    return new Response(siteIslands(compiled, bundle.catalog), {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }
  if (rest === "robots.txt") {
    return new Response(robotsTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (rest === "sitemap.xml") {
    return new Response(
      sitemapXml(compiled.map((p) => p.path)),
      { headers: { "content-type": "application/xml; charset=utf-8" } },
    );
  }

  const pagePath = rest ? `/${rest}` : "/";
  const source = bundle.pages.find((p) => p.path === pagePath);
  if (!source && pagePath !== "/cookie-compliance") {
    return text("Not found", 404);
  }

  const islands = siteIslands(compiled, bundle.catalog);
  const page =
    source != null
      ? compilePage(source, bundle.catalog, bundle.site, origin)
      : {
          path: "/cookie-compliance",
          title: "Cookie compliance",
          description: "How this site uses first-party analytics cookies.",
          bodyHtml: "",
          used: [] as string[],
          usesMotion: false,
          usesLeadForm: false,
        };

  // Cookie page body comes from compileSite; rebuild via compilePage path for consistency
  const doc =
    pagePath === "/cookie-compliance" && !source
      ? renderDocument({
          site: bundle.site,
          page: {
            path: "/cookie-compliance",
            title: "Cookie compliance",
            description: "How this site uses first-party analytics cookies, and how to change your preference.",
            bodyHtml: (await import("../../runtime/cookie-compliance.ts")).cookieComplianceHtml(bundle.site.name),
            used: [],
            usesMotion: false,
            usesLeadForm: false,
          },
          kernelOrigin: origin,
          themeHref: `${prefix}/theme.css`,
          assetsPrefix: prefix,
          islandsHref: islands ? "/islands.js" : null,
        })
      : renderDocument({
          site: bundle.site,
          page,
          kernelOrigin: origin,
          themeHref: `${prefix}/theme.css`,
          assetsPrefix: prefix,
          islandsHref: islands ? "/islands.js" : null,
        });

  return html(doc);
}
