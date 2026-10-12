import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { within } from "../agent/artifacts.ts";
export const previewIdentity = (dist: string) => createHash("sha256").update(resolve(dist)).digest("hex");
export function previewServer(dist: string) {
  return createServer((req, res) => {
    try {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (pathname === "/__vitris_preview") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ identity: previewIdentity(dist) })); return; }
      const redirectFile = join(dist, "_redirects");
      const redirect = existsSync(redirectFile) ? readFileSync(redirectFile, "utf8").split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(parts => parts[0] === pathname && parts[1]?.startsWith("/") && /^(200|30[1278])$/.test(parts[2] || "301")) : undefined;
      if (redirect && redirect[2] !== '200') { res.writeHead(Number(redirect[2] || 301), { location: redirect[1]! }); res.end(); return; }
      let file = within(dist, "." + decodeURIComponent(redirect?.[1] || pathname));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
      const ext = file.split(".").pop()!;
      res.setHeader("content-type", ({ html: "text/html", css: "text/css", js: "text/javascript", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", webp: "image/webp", woff2: "font/woff2", mp4: "video/mp4", webm:"video/webm" } as Record<string,string>)[ext] || "application/octet-stream");
      res.end(readFileSync(file));
    } catch { res.writeHead(403); res.end(); }
  });
}
