import type { Env } from "./env.ts";
import { handleAdmin } from './admin.ts';
import { handleApi } from "./surfaces/api.ts";
import { handleApp } from "./surfaces/app.ts";
import { handleOps } from "./surfaces/ops.ts";
import { handlePreview } from "./surfaces/preview.ts";
import { handleApproveReject, handleUpdatesApi } from "./surfaces/updates.ts";
import { html } from "./http.ts";
import { handleStock } from "./stock.ts";
import { publishAttestedBundle } from "./publish.ts";
import type { SignedPublishBundle } from "../knowledge/publish-attestation.ts";
import { isPreviewHost, previewHandoff } from './preview-access.ts';

export async function route(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname;
  const path = url.pathname;
  if (isPreviewHost(env,request)) return handlePreview(env,request);
  if (path.startsWith('/preview/')) return previewHandoff(env,request);
  if (path.startsWith('/api/admin/')) return handleAdmin(env, request);

  const approve = await handleApproveReject(env, request);
  if (approve) return approve;

  const updatesApi = await handleUpdatesApi(env, request);
  if (updatesApi) return updatesApi;

  if (host === env.APP_HOST || host.startsWith("app.")) {
    const rewritten = new URL(request.url);
    if (!rewritten.pathname.startsWith("/app")) rewritten.pathname = "/app" + (rewritten.pathname === "/" ? "" : rewritten.pathname);
    return handleApp(env, new Request(rewritten, request));
  }
  if (host === env.OPS_HOST || host.startsWith("ops.")) {
    const rewritten = new URL(request.url);
    if (!rewritten.pathname.startsWith("/ops")) rewritten.pathname = "/ops" + (rewritten.pathname === "/" ? "" : rewritten.pathname);
    return handleOps(env, new Request(rewritten, request));
  }

  if (path === "/" || path === "") {
    return html(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vitris kernel</title>
      <style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:40rem;margin:12vh auto;padding:0 1.25rem;line-height:1.5;color:#164E63}
      a{color:#0891B2}</style></head>
      <body><h1>Vitris kernel</h1>
      <p>Platform worker for owner admin, leads, and analytics. Public sites deploy to Cloudflare Pages.</p>
      <p><a href="/app/login">Owner admin</a> · <a href="/preview/demo/">Demo site</a> · <a href="/gallery">Component gallery</a></p></body></html>`);
  }

  if (path === "/gallery" || path === "/gallery/") {
    const object = await env.R2.get("stock/gallery.html");
    if (!object) {
      return new Response("Gallery is not published yet. Run npm run gallery.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(object.body, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const stock = await handleStock(env, request);
  if (stock) return stock;

  if (path === "/api/publish-attested" && request.method === "POST") {
    let bundle: SignedPublishBundle;
    try { bundle = await request.json() as SignedPublishBundle; }
    catch { return new Response(JSON.stringify({ ok: false, message: "Invalid publish JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }
    const result = await publishAttestedBundle(env, bundle);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 403, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }

  if (path.startsWith("/api/")) return handleApi(env, request);
  if (path.startsWith("/app")) return handleApp(env, request);
  if (path.startsWith("/ops")) return handleOps(env, request);

  if (path.startsWith("/assets/")) {
    const rest = path.slice("/assets/".length);
    // Do not expose private cached source bundles or active documents on the admin origin.
    if (!/\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm)$/i.test(rest) || rest.includes('..')) return new Response('Not found',{status:404});
    const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',svg:'image/svg+xml',mp4:'video/mp4',webm:'video/webm'};
    const type=types[rest.split('.').pop()!.toLowerCase()]!;
    const object = await env.R2.get(rest.startsWith("sites/") ? rest : `sites/${rest}`);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: { "content-type": type, "cache-control": "public, max-age=60",'x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'" },
    });
  }

  return new Response("Not found", { status: 404 });
}
