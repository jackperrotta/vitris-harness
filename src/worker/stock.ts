import { stockCatalogJson, stockPickerCss, stockPickerJs } from "../gen/stock.ts";
import type { Env } from "./env.ts";

const STOCK_KEY = /^stock\/(images|thumbs|videos)\/[a-z0-9][a-z0-9-]*\.(jpg|jpeg|webp|png|mp4)$/;

function contentType(key: string): string {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (key.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function publicHeaders(type: string, cache: string): HeadersInit {
  return {
    "content-type": type,
    "cache-control": cache,
    "access-control-allow-origin": "*",
  };
}

export async function handleStock(env: Env, request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/stock" && !path.startsWith("/stock/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-max-age": "86400",
      },
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (path === "/stock/picker.js") {
    return new Response(stockPickerJs, { headers: publicHeaders(contentType("x.js"), "public, max-age=3600") });
  }
  if (path === "/stock/picker.css") {
    return new Response(stockPickerCss, { headers: publicHeaders(contentType("x.css"), "public, max-age=3600") });
  }
  if (path === "/stock/catalog.json") {
    const object = await env.R2.get("stock/catalog.json");
    const body = object ? await object.text() : stockCatalogJson;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: publicHeaders("application/json; charset=utf-8", "public, max-age=60"),
    });
  }

  const key = path.slice(1);
  if (key.includes("..") || !STOCK_KEY.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  let object = await env.R2.get(key);
  if (!object) {
    const published = await env.R2.get("stock/catalog.json");
    const catalog = JSON.parse(published ? await published.text() : stockCatalogJson) as {items: {src: string; legacySrc?: string; status?: string}[]};
    const alias = catalog.items.find(item => item.status !== "excluded" && item.legacySrc === path);
    if (alias && STOCK_KEY.test(alias.src.slice(1))) object = await env.R2.get(alias.src.slice(1));
  }
  if (!object) return new Response("Not found", { status: 404 });
  const type = object.httpMetadata?.contentType || contentType(key);
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: publicHeaders(type, "public, max-age=31536000, immutable"),
  });
}
