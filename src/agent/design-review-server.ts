import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { save, within } from "./artifacts.ts";
import { currentRunId, loadManifest, runDir, submitFeedback } from "./design-run.ts";
import { loadAgentComparison, loadAgentPage, refreshCandidatePreviews, reviewState, type LivePreviewMap } from "./design-context.ts";
import { spawn } from "node:child_process";
import { preferBundledToolArgs } from './kernel-commands.ts';

const MAX_BODY = 1_000_000;
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".html": "text/html; charset=utf-8" };

type ReviewCtx = {
  parent: string;
  runId: string;
  token: string;
  kernel: string;
  resumeOnSubmit: boolean;
  livePreviews: LivePreviewMap;
};

export async function startDesignReview(opts: {
  parent: string;
  kernel: string;
  runId?: string;
  port?: number;
  resumeOnSubmit?: boolean;
  refreshPreviews?: boolean;
}): Promise<{ url: string; server: Server; token: string }> {
  const runId = opts.runId || currentRunId(opts.parent);
  if (!runId) throw new Error("No design-run to review");
  const manifest = loadManifest(opts.parent, runId);
  if (!manifest.activeComparisonRevision) throw new Error("No comparison snapshot yet");
  const token = randomUUID().replaceAll("-", "");
  const livePreviews = opts.refreshPreviews === false ? {} : await refreshCandidatePreviews({ parent: opts.parent, kernel: opts.kernel, runId });
  const ctx: ReviewCtx = { parent: opts.parent, runId, token, kernel: opts.kernel, resumeOnSubmit: opts.resumeOnSubmit !== false, livePreviews };
  const server = createServer();
  server.on("request", (req, res) => handleReviewRequest(req, res, ctx));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port || 0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Review server failed to bind loopback");
  const url = `http://127.0.0.1:${address.port}/?token=${token}`;
  save(join(runDir(opts.parent, runId), "review-server.json"), {
    pid: process.pid, url, token, host: "127.0.0.1", port: address.port,
    api: { state: `/api/state`, context: `/api/context`, page: `/api/page` },
  });
  return { url, server, token };
}

function normalizeRequestPath(raw: string | undefined): string {
  const value = raw && raw.length ? raw : "/";
  if (value.startsWith("//")) return `/${value.replace(/^\/+/, "")}`;
  return value;
}

function handleReviewRequest(req: IncomingMessage, res: ServerResponse, ctx: ReviewCtx): void {
  const origin = req.headers.origin;
  const host = req.headers.host || "";
  if (origin && !origin.startsWith("http://127.0.0.1")) { res.writeHead(403).end("Forbidden origin"); return; }
  if (host && !host.startsWith("127.0.0.1") && !host.startsWith("localhost")) { res.writeHead(403).end("Loopback only"); return; }
  const url = new URL(normalizeRequestPath(req.url), "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/") {
    const token = url.searchParams.get("token");
    if (token !== ctx.token) { res.writeHead(403).end("Invalid session"); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(reviewPage());
    return;
  }
  if (req.method === "GET" && (url.pathname === "/api/state" || url.pathname === "/api/context" || url.pathname === "/api/page")) {
    if (url.searchParams.get("token") !== ctx.token) { res.writeHead(403).end("Invalid session"); return; }
    try {
      if (url.pathname === "/api/page") {
        const candidate = url.searchParams.get("candidate") || "";
        const route = url.searchParams.get("route") || "/";
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(loadAgentPage(ctx.parent, ctx.runId, candidate, route, ctx.livePreviews)));
        return;
      }
      const payload = url.pathname === "/api/context"
        ? loadAgentComparison(ctx.parent, ctx.runId, ctx.livePreviews)
        : reviewState(ctx.parent, ctx.runId, ctx.livePreviews);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(payload));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/snapshot/")) {
    if (url.searchParams.get("token") !== ctx.token) { res.writeHead(403).end("Invalid session"); return; }
    serveSnapshot(ctx, url.pathname.slice("/snapshot/".length), res);
    return;
  }
  if (req.method === "POST" && (url.pathname === "/api/draft" || url.pathname === "/api/feedback")) {
    readBody(req, (err, body) => {
      if (err) { res.writeHead(400).end(err); return; }
      try {
        const payload = JSON.parse(body) as Record<string, unknown>;
        if (payload.token !== ctx.token) { res.writeHead(403).end("Invalid session"); return; }
        if (payload.path || payload.command || payload.file) { res.writeHead(400).end("Illegal field"); return; }
        const draft = url.pathname === "/api/draft";
        payload.submission = draft ? "draft" : (payload.submission || "synthesize");
        payload.runId = ctx.runId;
        if (draft) {
          save(join(runDir(ctx.parent, ctx.runId), "feedback", "draft.json"), payload);
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, draft: true }));
          return;
        }
        const result = submitFeedback(ctx.parent, ctx.runId, payload);
        const status = loadManifest(ctx.parent, ctx.runId).status;
        if (!result.duplicate && result.feedback.submission !== "draft" && status !== "needs_clarification" && ctx.resumeOnSubmit) {
          spawn(process.execPath, preferBundledToolArgs(ctx.kernel,["--experimental-strip-types", join(ctx.kernel, "scripts/ralph.ts"), "--site", ctx.parent, "--design-run", ctx.runId, "--resume"]), {
            detached: true, stdio: "ignore", windowsHide: true,
          }).unref();
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
          ok: true, duplicate: result.duplicate, summary: result.summary, status,
        }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      }
    });
    return;
  }
  res.writeHead(404).end("Not found");
}

function serveSnapshot(ctx: ReviewCtx, rel: string, res: ServerResponse): void {
  const manifest = loadManifest(ctx.parent, ctx.runId);
  const dest = join(runDir(ctx.parent, ctx.runId), "comparison", manifest.activeComparisonRevision!);
  const decoded = decodeURIComponent(rel.split("?")[0] || "");
  let file: string;
  try { file = within(dest, decoded); } catch { res.writeHead(403).end("Path not allowed"); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end("Missing"); return; }
  const relSafe = relative(dest, file).replaceAll("\\", "/");
  if (relSafe.includes("adapter") || relSafe.endsWith(".env") || relSafe.includes("credentials")) { res.writeHead(403).end("Denied"); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }).end(readFileSync(file));
}

function readBody(req: IncomingMessage, cb: (err: string | null, body: string) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > MAX_BODY) { cb("Payload too large", ""); req.destroy(); return; }
    chunks.push(chunk as Buffer);
  });
  req.on("end", () => cb(null, Buffer.concat(chunks).toString("utf8")));
  req.on("error", () => cb("Read failed", ""));
}

function reviewPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design comparison</title>
<style>
:root { font-family: Georgia, serif; color: #1b1a17; background: #f6f1e8; }
body { margin: 0; }
header { padding: 1rem 1.5rem; background: #1b1a17; color: #f6f1e8; }
header p { margin: .4rem 0 0; max-width: 52rem; }
main { display: grid; gap: 1rem; padding: 1rem; }
.row { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
label, select { font: inherit; }
.frames { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
@media (min-width: 1600px) { .frames { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
article { background: #fff; border: 1px solid #d8d0c4; min-width: 0; display: grid; grid-template-rows: auto auto 1fr; }
article header { background: #fff; color: #1b1a17; padding: .75rem 1rem; }
article h2 { margin: 0; font-size: 1.1rem; }
.concept { margin: .35rem 0; font-size: .9rem; }
.missing { color: #8a1f1f; padding: 1rem; }
.frame-wrap { background: #ece6dc; min-height: 70vh; }
iframe { display: block; width: 100%; height: 70vh; border: 0; background: #fff; }
.frames.phone { justify-items: center; }
.frames.phone .frame-wrap { width: 390px; max-width: 100%; }
.frames.phone iframe { width: 390px; max-width: 100%; height: 700px; }
a { color: inherit; }
</style>
</head>
<body>
<header>
  <h1>Compare five local websites</h1>
  <p>Each pane is a live preview. Open preview launches that site in a new tab. Leave all feedback in Cursor — this page does not collect choices or start a final build.</p>
</header>
<main>
  <p id="status"></p>
  <div class="row">
    <label>Route <select id="route"></select></label>
    <label>Viewport <select id="viewport"><option value="desktop">Desktop</option><option value="phone">Phone 390</option></select></label>
  </div>
  <div class="frames" id="frames"></div>
</main>
<script>
const token = new URLSearchParams(location.search).get("token");
function joinPreview(base, route) {
  const origin = new URL(base).origin;
  if (!route || route === "/") return origin + "/";
  return origin + (route.startsWith("/") ? route : "/" + route);
}
async function load() {
  const data = await (await fetch("/api/state?token=" + token)).json();
  const status = data.status && data.status.status ? data.status.status : "";
  document.getElementById("status").textContent = status
    + (data.machineChecked ? " — machine-checked previews exist." : " — some candidates are missing.")
    + " Feedback stays in Cursor.";
  const routes = new Set();
  for (const idx of Object.values(data.indexes || {})) for (const r of idx.routes || []) routes.add(r.path);
  const routeSel = document.getElementById("route");
  routeSel.innerHTML = "";
  for (const path of routes.size ? routes : ["/"]) {
    const o = document.createElement("option"); o.value = path; o.textContent = path; routeSel.appendChild(o);
  }
  function render() {
    const route = routeSel.value || "/";
    const frames = document.getElementById("frames");
    frames.className = "frames" + (document.getElementById("viewport").value === "phone" ? " phone" : "");
    frames.replaceChildren();
    for (const c of data.comparison.candidates) {
      const article = document.createElement("article");
      const head = document.createElement("header");
      const h2 = document.createElement("h2");
      h2.textContent = c.label + " — " + c.candidateId;
      const concept = document.createElement("p");
      concept.className = "concept";
      concept.textContent = c.concept || "";
      head.append(h2, concept);
      if (c.previewUrl) {
        const link = document.createElement("a");
        link.href = joinPreview(c.previewUrl, route);
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Open preview";
        head.appendChild(link);
      } else {
        const miss = document.createElement("p");
        miss.className = "missing";
        miss.textContent = "No live preview";
        head.appendChild(miss);
      }
      const wrap = document.createElement("div");
      wrap.className = "frame-wrap";
      const index = data.indexes[c.candidateId];
      const missing = index && index.routes.find(r => r.path === route) && index.routes.find(r => r.path === route).missing;
      if (missing) {
        const p = document.createElement("p");
        p.className = "missing";
        p.textContent = c.label + " missing " + route;
        wrap.appendChild(p);
      } else if (c.previewUrl) {
        const frame = document.createElement("iframe");
        frame.title = c.label + " " + route;
        frame.src = joinPreview(c.previewUrl, route);
        wrap.appendChild(frame);
      } else {
        const p = document.createElement("p");
        p.className = "missing";
        p.textContent = "Start the candidate preview to load a live view.";
        wrap.appendChild(p);
      }
      article.append(head, wrap);
      frames.appendChild(article);
    }
  }
  routeSel.addEventListener("change", render);
  document.getElementById("viewport").addEventListener("change", render);
  render();
}
load();
</script>
</body>
</html>`;
}
