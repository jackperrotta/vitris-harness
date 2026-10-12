import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { within } from "../agent/artifacts.ts";

/** Loopback-only inspection surface. Never serves agent state or captured raw files. */
export function contactSheetServer(siteRoot: string) {
  return createServer((request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      const allowed = path === "/" || path === "/onboarding/contact-sheet.html" || path.startsWith("/media/");
      if (!allowed) { response.writeHead(404); response.end(); return; }
      const relative = path === "/" ? "onboarding/contact-sheet.html" : path.slice(1);
      const file = within(siteRoot, relative);
      if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
      const ext = file.split(".").pop()?.toLowerCase();
      response.setHeader("content-type", ({ html: "text/html", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm" } as Record<string, string>)[ext || ""] || "application/octet-stream");
      response.end(readFileSync(file));
    } catch { response.writeHead(403); response.end(); }
  });
}
