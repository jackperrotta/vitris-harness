import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { chromium, type Page } from "playwright";
import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { save, within } from "../agent/artifacts.ts";
import { preserveConfig, pageFile, PRESERVE_HEIGHT, PRESERVE_WIDTHS, SUPPORTED_REACT_BLOCKS, type PreserveManifest } from "./config.ts";
import { preserveRuntime } from "./runtime.ts";
import {readOnlyEmbedProvider,approvedEmbedUrl} from './embeds.ts';
import {supportsStaticLegacyComponent,isInertFrame} from './components.ts';
import {captureButtonHovers} from './hovers.ts';

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const attr = (node: Element, key: string) => node.attrs.find(a => a.name === key)?.value;
const set = (node: Element, key: string, value: string) => { const a = node.attrs.find(a => a.name === key); if (a) a.value = value; else node.attrs.push({ name: key, value }); };
const remove = (node: Node) => { if ("parentNode" in node && node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(n => n !== node); };
/** Dotted customer page slugs are pages; only recognized file suffixes are downloads. */
export const isDownloadPath=(path:string)=>/\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|zip|rar|7z|jpe?g|png|gif|webp|avif|svg|ico|mp[34]|m4[av]|wav|ogg|webm|mov|css|js|woff2?|ttf|eot)$/i.test(path);
export function legacyRoutes(html: string, base: string): string[] {
  const react = legacyReactState(html);
  if (react) {
    const links: string[] = Object.keys(react.pages || {});
    const visit = (value: any) => { if (!value || typeof value !== 'object') return;
      if (value.type === 'PAGE' && typeof value.href === 'string') links.push(value.href);
      Object.values(value).forEach(visit);
    };
    visit(react.navbar); visit(react.footer);
    return [...new Set(links.map(s => new URL(s, base).href).filter(s => new URL(s).origin === new URL(base).origin))];
  }
  const encoded = html.match(/<script[^>]*id="vitris-web-renderer-state"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!encoded) return [];
  const text = encoded.replace(/&(q|s|l|g|a);/g, (_m, key: string) => ({ q: '"', s: "'", l: "<", g: ">", a: "&" })[key]!);
  const state = JSON.parse(text) as { renderableData?: { navbar?: { links?: Array<{ url?: string }> }; pages?: Record<string, unknown> } };
  return [...(state.renderableData?.navbar?.links || []).map(l => l.url), ...Object.keys(state.renderableData?.pages || {})]
    .filter((s): s is string => !!s).map(s => new URL(s, base).href).filter(s => new URL(s).origin === new URL(base).origin);
}
/** Read the legacy SSR JSON without executing inline script or trusting its code. */
export function legacyReactState(html: string): any | undefined {
  const marker = /window\.__PRELOADED_STATE__\s*=\s*/.exec(html);
  if (!marker) return;
  const start = marker.index + marker[0].length;
  if (html[start] !== '{') throw new Error('Invalid legacy React state');
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error('Truncated legacy React state');
}
export function elements(node: Node): Element[] {
  return [("tagName" in node ? node : undefined), ...("childNodes" in node ? node.childNodes.flatMap(elements) : [])].filter((n): n is Element => !!n);
}

/** Both captures use the same scroll/settling policy, including lazy-loaded images. */
export async function settle(page: Page): Promise<void> {
  await page.mouse.move(-10,-10);
  await page.evaluate(async () => {
    const { document, window } = globalThis as any;
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 800) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 25));
    }
    await Promise.all([...document.images].map((i: any) => i.decode().catch(() => {})));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

export async function capturePreservedSite(root: string, opts: { signal?: AbortSignal; onLog?: (line: string) => void; diagnostic?: boolean; onlyPaths?: string[]; includeSourceErrors?:boolean } = {}): Promise<PreserveManifest> {
  const config = preserveConfig(root);
  if(opts.includeSourceErrors&&(!opts.diagnostic||!opts.onlyPaths?.length))throw Error('Source error preservation requires an explicit diagnostic route list');
  if (config.mode !== "preserve" || !config.sourceUrl) throw new Error("Preserve capture requires launch.json mode=preserve and sourceUrl");
  const source = new URL(config.sourceUrl);
  if (!/^https?:$/.test(source.protocol) || source.username || source.password) throw new Error("Source must be an HTTP(S) URL without credentials");
  if (existsSync(join(root, "preserved"))) throw new Error("Preserved source already exists; edit it in place or capture into a new site directory");
  const captureId = randomUUID();
  const staging = join(root, "artifacts", `preserve-capture-${captureId}`);
  const output = join(staging, "source");
  const references = join(root, "onboarding", `preserve-reference-${captureId}`);
  mkdirSync(output, { recursive: true }); mkdirSync(references, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: PRESERVE_WIDTHS[0], height: PRESERVE_HEIGHT }, deviceScaleFactor: 1, reducedMotion: "reduce", serviceWorkers: "block" });
  // Failed legacy tracking scripts held the load event for ~21 seconds per
  // route. They have no visual role and are removed from the authored clone.
  // Keep the renderer, fonts, images, styles and public embeds executing.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'analytics.tryvitris.com' || /(^|\.)google-analytics\.com$/.test(url.hostname)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  // CDN responses can vary by browser Accept headers. Keep the exact bytes the
  // browser rendered, especially image variants with slightly different dimensions.
  const renderedAssets = new Map<string, Promise<{ bytes: Buffer; type: string; url: string } | undefined>>();
  const renderedTypes = new Map<string, string>();
  page.on("response", response => {
    if (!response.ok() || !["stylesheet", "image", "font", "media"].includes(response.request().resourceType())) return;
    const type = response.headers()["content-type"]?.split(";")[0] || "";
    renderedTypes.set(response.url(), type);
    renderedAssets.set(response.url(), response.body().then(bytes => ({ bytes: Buffer.from(bytes), type, url: response.url() })).catch(() => undefined));
  });
  const manifest: PreserveManifest = { version: 1, adapter: "vitris-v1", sourceUrl: source.href, capturedAt: new Date().toISOString(), pages: [], assets: [], serviceMode: config.backendOrigin && config.forms?.length ? "vitris-forms" : "preview-only", warnings: [] };
  // Asset names include the full URL (query included), so CDN variants cannot collide.
  const assets = new Map<string, { file: string; css: boolean }>();
  const queue: string[] = [];
  const asset = (raw: string, base: string, css = false): string => {
    if (!raw || /^(data:|blob:|#)/i.test(raw)) return raw;
    const url = new URL(raw, base); const fragment = url.hash; url.hash = "";
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error(`Unsupported asset URL: ${url.href}`);
    let entry = assets.get(url.href);
    if (!entry) {
      const knownType = renderedTypes.get(url.href) || "";
      const extension = css ? ".css" : ({ "image/avif": ".avif", "image/webp": ".webp", "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "font/woff2": ".woff2" } as Record<string, string>)[knownType] || extname(url.pathname).match(/^\.[a-z0-9]{1,8}$/i)?.[0] || ".bin";
      entry = { file: `_preserve/assets/${hash(url.href).slice(0, 24)}${extension}`, css };
      assets.set(url.href, entry); queue.push(url.href);
    }
    return `/${entry.file}${fragment}`;
  };
  const cssText = (text: string, base: string): string => text
    .replace(/@import\s+(["'])(.*?)\1/g, (_m, _q, url) => `@import "${asset(url, base, true)}"`)
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g, (_m, a, b, c) => {
      const raw = a ?? b ?? c;
      if (/^(null|undefined)$/i.test(raw)) {
        const warning = `Legacy empty background placeholder url(${raw}) normalized to none; source rendering remains the visual reference.`;
        if (!manifest.warnings.includes(warning)) manifest.warnings.push(warning);
        return 'none';
      }
      return `url("${asset(raw, base, /\.css(?:[?#]|$)/i.test(raw))}")`;
    });
  const pending = opts.onlyPaths ? opts.onlyPaths.map(path=>new URL(path,source).href) : [new URL("/", source).href, source.href];
  const seen = new Set<string>(); const outputs = new Set<string>();
  const abort = () => { void browser.close(); };
  opts.signal?.addEventListener("abort", abort, { once: true });
  try {
    while (pending.length) {
      opts.signal?.throwIfAborted();
      const url = new URL(pending.shift()!); url.hash = "";
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      const blocked = (message: string) => { if (!opts.diagnostic) throw new Error(message); (manifest.blockers ||= []).push(`${url.pathname}: ${message}`); };
      if(opts.onlyPaths&&!opts.onlyPaths.includes(url.pathname))continue;
      opts.onLog?.(`Preserving ${url.pathname}`);
      let response;
      try { response = await page.goto(url.href, { waitUntil: "load", timeout: 60_000 }); }
      catch (error) { if (!browser.isConnected()) throw error; blocked(`Source navigation failed: ${url.href}: ${error instanceof Error ? error.message : String(error)}`); continue; }
      const source404=opts.includeSourceErrors&&response?.status()===404;
      if (!response || !response.ok()&&!source404) { blocked(`Source page failed: ${url.href} (${response?.status()})`); continue; }
      const sourceHtml = await response.text();
      const react = legacyReactState(sourceHtml);
      pending.push(...legacyRoutes(sourceHtml, source.origin + "/"));
      if (new URL(page.url()).origin !== source.origin) { blocked(`Source redirected to another origin: ${page.url()}`); continue; }
      try { if(!source404)await page.locator(react ? '#vcontent' : '#fullSiteRenderer').waitFor({ timeout: 15_000 }); }
      catch (error) { if (!browser.isConnected()) throw error; blocked(`Expected legacy renderer missing at ${url.href}`); continue; }
      await settle(page);
      const html = await page.content();
      if (!source404&&!react && !/vitris-web-renderer|v1-full-site-renderer/.test(html)) { blocked("Preserve adapters support legacy Vitris websites only; external-site adapters are not yet implemented"); continue; }
      if (react) manifest.adapter = 'vitris-v2';
      const soft404=/404 Page Not Found/.test(await page.locator("body").innerText());
      if (soft404&&!opts.includeSourceErrors) { blocked(`Source returned a soft 404: ${url.href}`); continue; }
      const doc = parse(html);
      const nodes = elements(doc);
      const hoverStates=await captureButtonHovers(page);
      const buttons=nodes.filter(n=>(attr(n,'class')||'').split(/\s+/).includes('btn'));
      for(const state of hoverStates){const button=buttons[state.index];if(!button||(attr(button,'href')??null)!==state.href){blocked('Button inventory changed during capture; preserve its hover state explicitly');continue;}if(JSON.stringify(state.before)!==JSON.stringify(state.hover))set(button,'data-preserve-hover',JSON.stringify(state.hover));}
      const supported = new Set(["navbar-1", "header-1", "photoGallery-1", "cards-1", "info-1", "contactForm-1", "footer-1", "html-1"]);
      const unknown = nodes.filter(n=>attr(n,'uniquecomponent') && !supported.has(attr(n,'uniquecomponent')!) && !supportsStaticLegacyComponent(n)).map(n=>attr(n,'uniquecomponent')!);
      if (unknown.length) blocked(`Legacy components need preservation support: ${[...new Set(unknown)].join(", ")}`);
      if (react) {
        const blocks = [...(react.pages?.[url.pathname === '/' ? react.site?.homePageUrl : url.pathname.slice(1)]?.rows || []), ...(react.footer?.rows || [])].flatMap((r: any) => r.blocks || []);
        const unsupportedBlocks = [...new Set(blocks.map((b: any) => b.bt).filter((bt: string) => !SUPPORTED_REACT_BLOCKS.has(bt)))];
        if (unsupportedBlocks.length) blocked(`Legacy React blocks need preservation support: ${unsupportedBlocks.join(', ')}`);
        // Wire the React navbar's existing markup to the local collapse runtime.
        for (const [i, toggle] of nodes.filter(n => (attr(n, 'class') || '').split(/\s+/).includes('navbar-toggler')).entries()) {
          let parent: Node | null = toggle.parentNode;
          while (parent && !elements(parent).some(n => (attr(n, 'class') || '').split(/\s+/).includes('navbar-collapse'))) parent = 'parentNode' in parent ? parent.parentNode : null;
          const target = parent && elements(parent).find(n => (attr(n, 'class') || '').split(/\s+/).includes('navbar-collapse'));
          if (!target) { blocked('React mobile menu target missing'); continue; }
          const id = attr(target, 'id') || `preserve-react-nav-${i}`; set(target, 'id', id);
          set(toggle, 'data-toggle', 'collapse'); set(toggle, 'data-target', '#' + id); set(toggle, 'aria-expanded', 'false');
        }
      }
      const approvedEmbeds = nodes.filter(n => n.tagName === 'iframe' && attr(n,'srcdoc') === undefined && readOnlyEmbedProvider(attr(n,'src') || ''));
      const inertFrames=nodes.filter(isInertFrame);
      for(const frame of inertFrames)set(frame,'src','about:blank');
      for (const embed of approvedEmbeds) {
        set(embed,'src',approvedEmbedUrl(attr(embed,'src')!)!);
        const warning = `Remote ${readOnlyEmbedProvider(attr(embed,'src')!)} embed retained at ${url.pathname}: ${attr(embed,'src')}. Provider content, network availability and privacy behavior are external dependencies; the embedded application is not stored locally.`;
        if (!manifest.warnings.includes(warning)) manifest.warnings.push(warning);
      }
      const unsupported = nodes.filter(n => (["iframe", "object", "embed", "canvas"].includes(n.tagName) && !approvedEmbeds.includes(n) && !inertFrames.includes(n)) || (attr(n, "data-toggle") && !["collapse", "modal"].includes(attr(n, "data-toggle")!)));
      if (unsupported.length) blocked(`Unsupported interactive content: ${unsupported.map(n => n.tagName + ':' + (attr(n,'srcdoc') !== undefined ? 'srcdoc' : attr(n, "data-toggle") || attr(n, "src") || "")).join(", ")}. Add an adapter before publishing.`);
      const base = new URL(nodes.find(n => n.tagName === "base")?.attrs.find(a => a.name === "href")?.value || url.href, url).href;
      for (const node of nodes) {
        if (unsupported.includes(node) && ['iframe','object','embed'].includes(node.tagName)) {
          set(node,'data-preserve-disabled-embed',attr(node,'src') || attr(node,'data') || '');
          if (attr(node,'srcdoc') !== undefined) set(node,'data-preserve-original-srcdoc',attr(node,'srcdoc')!);
          node.attrs = node.attrs.filter(a => !['srcdoc','data'].includes(a.name));
          set(node,'src','about:blank');
        }
        if (node.tagName === "script" && !["application/ld+json"].includes(attr(node, "type") || "")) { remove(node); continue; }
        if (node.tagName === "noscript") { remove(node); continue; }
        if (node.tagName === "meta" && /^(refresh|content-security-policy)$/i.test(attr(node, "http-equiv") || "")) { remove(node); continue; }
        if (node.tagName === "base") { set(node, "href", "/"); continue; }
        if (node.tagName === "link" && /^(preconnect|dns-prefetch|modulepreload|preload)$/i.test(attr(node, "rel") || "")) { remove(node); continue; }
        if (node.tagName === "style") for (const child of node.childNodes) if ("value" in child) child.value = cssText(child.value, base);
        const style = attr(node, "style"); if (style) set(node, "style", cssText(style, base));
        if (node.tagName === "a") {
          const href = attr(node, "href");
          if (href !== undefined && !/^(tel:|mailto:|#)/i.test(href)) {
            const target = new URL(href || "/", base);
            if (target.origin === source.origin) {
              if (target.search) { blocked(`Query-dependent navigation needs an adapter: ${target.href}`); set(node,'href',target.href); }
              else if (isDownloadPath(target.pathname)) set(node, "href", asset(target.href, base));
              else { set(node, "href", target.pathname + target.hash); target.hash = ""; pending.push(target.href); }
            }
          }
        }
        for (const key of ["src", "poster"]) { const raw = attr(node, key); if (raw && !['iframe', 'object', 'embed'].includes(node.tagName)) set(node, key, asset(raw, base)); }
        if (node.tagName === "link" && /stylesheet|icon/i.test(attr(node, "rel") || "")) {
          set(node, "href", asset(attr(node, "href")!, base, attr(node, "rel") === "stylesheet"));
          node.attrs = node.attrs.filter(a => !["integrity", "crossorigin"].includes(a.name));
        }
        const srcset = attr(node, "srcset");
        if (srcset) {
          if (srcset.includes("data:")) throw new Error("Inline srcset needs explicit preservation support");
          set(node, "srcset", srcset.split(",").map(candidate => { const [url, ...descriptor] = candidate.trim().split(/\s+/); return [asset(url!, base), ...descriptor].join(" "); }).join(", "));
        }
        if (node.tagName === "form") {
          const fields = elements(node).filter(n => ['input','textarea'].includes(n.tagName)).map(n=>attr(n,'name'));
          const contact = attr(node,'data-lead-form') !== undefined || elements(node).some(n=>attr(n,'data-vitrisid') === 'emailSendButton') || (react && ['name','email','message'].every(name=>fields.includes(name)));
          if (!contact) blocked(`Unrelated form requires an explicit preservation adapter; it cannot be routed to contact forms`);
          if (react && contact) for (const send of elements(node).filter(n => n.tagName === 'a' && /^javascript:/i.test(attr(n, 'href') || ''))) { set(send, 'href', '#'); set(send, 'data-vitrisid', 'emailSendButton'); }
          if (elements(node).some(n=>attr(n,'type') === 'file')) manifest.warnings.push(`Attachments unsupported at ${url.pathname}; keep this form disabled until adapted`);
          set(node, "data-preserve-forms", "preview"); set(node, "action", "#");
        }
        node.attrs = node.attrs.filter(a => !/^on/i.test(a.name));
      }
      // Windows cannot create a folder ending in a period. Keep the public URL
      // and use a confined hashed file plus an explicit static 200 rewrite.
      let file: string;
      try { file = pageFile(url.pathname); }
      catch (error) {
        const decoded = decodeURIComponent(url.pathname);
        if (!decoded.split('/').some(p => /\.$/.test(p)) || /[\\\x00-\x1f:*?"<>|]/.test(decoded) || decoded.split('/').some(p => p === '.' || p === '..')) throw error;
        file = `_preserve/routes/${hash(url.pathname).slice(0,24)}/index.html`;
      }
      if (outputs.has(file.toLowerCase())) file = `_preserve/routes/${hash(url.pathname).slice(0,24)}/index.html`;
      if (outputs.has(file.toLowerCase())) throw new Error(`Routes collide on disk: ${url.pathname}`);
      outputs.add(file.toLowerCase());
      const captured:PreserveManifest['pages'][number] = { url: url.href, path: url.pathname, file, references: [] };
      if(source404||soft404){const responseFile=`onboarding/preserve-reference-${captureId}/${manifest.pages.length}-response.html`;writeFileSync(join(root,responseFile),sourceHtml,{flag:'wx'});captured.sourceFailure={status:response!.status(),kind:source404?'http-404':'soft-404',responseFile,responseSha256:hash(sourceHtml)};manifest.warnings.push(`Unavailable original route ${url.pathname}: preserved ${source404?'HTTP 404 response':'soft 404'} content. Static preview serves the captured error page with HTTP 200; business content was unavailable.`);}
      writeFileSync(join(references, `${manifest.pages.length}-rendered.html`), html, { flag: 'wx' });
      writeFileSync(join(references, `${manifest.pages.length}-hovers.json`),JSON.stringify(hoverStates,null,2),{flag:'wx'});
      for (const width of PRESERVE_WIDTHS) {
        await page.setViewportSize({ width, height: PRESERVE_HEIGHT }); await settle(page);
        const name = `${manifest.pages.length}-${width}.png`;
        const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", path: join(references, name) });
        captured.references.push({ width, file: `onboarding/preserve-reference-${captureId}/${name}`, sha256: hash(screenshot) });
      }
      await page.setViewportSize({ width: PRESERVE_WIDTHS[0], height: PRESERVE_HEIGHT });
      const content = serialize(doc).replace(/<\/head>/i, '<meta name="robots" content="noindex,nofollow"></head>').replace(/<\/body>/i, '<script src="/_preserve/runtime.js" defer></script></body>');
      const path = within(output, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content);
      manifest.pages.push(captured);
    }
    while (queue.length) {
      opts.signal?.throwIfAborted();
      const url = queue.shift()!; const entry = assets.get(url)!;
      opts.onLog?.(`Copying asset ${manifest.assets.length + 1}/${assets.size}`);
      let captured = await renderedAssets.get(url);
      let captureError: string | undefined;
      if (!captured) {
        try {
          const response = await context.request.get(url, { timeout: 30_000 });
          if (!response.ok()) captureError = `Asset failed: ${url} (${response.status()})`;
          captured = { bytes: Buffer.from(await response.body()), type: response.headers()["content-type"] || "", url: response.url() };
        } catch (error) {
          if (!opts.diagnostic) throw error;
          captureError = `Asset request failed: ${url}: ${error instanceof Error ? error.message : String(error)}`;
          captured = { bytes: Buffer.alloc(0), type: '', url };
        }
      }
      const type = captured.type;
      if (type.includes("text/html")) captureError ||= `Asset returned HTML: ${url}`;
      if (captureError) {
        if (!opts.diagnostic) throw new Error(captureError);
        (manifest.blockers ||= []).push(captureError + '; missing authored asset retained as an empty placeholder, not claimed as preserved bytes');
      }
      const original = captured.bytes;
      const referenceFile = `onboarding/preserve-reference-${captureId}/assets/${hash(url).slice(0,24)}.bin`;
      mkdirSync(join(references,'assets'), {recursive:true});
      writeFileSync(join(root,referenceFile), original, {flag:'wx'});
      const bytes = captureError ? Buffer.alloc(0) : entry.css || type.includes("text/css") ? Buffer.from(cssText(Buffer.from(original).toString("utf8"), captured.url)) : original;
      const path = within(output, entry.file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
      manifest.assets.push({ url, file: entry.file, sha256: hash(bytes), originalSha256: hash(original), referenceFile, ...(captureError ? { captureError } : {}) });
    }
    mkdirSync(join(output, "_preserve"), { recursive: true });
    writeFileSync(join(output, "_preserve/runtime.js"), preserveRuntime);
    manifest.warnings.push("Legacy renderer, analytics, and backend calls removed. Existing external navigation links are preserved.");
    if (!config.forms?.length) manifest.warnings.push("Forms are preview-only until explicit form registration and frontend bindings are configured; no submissions are sent.");
    save(join(staging, "manifest.json"), manifest);
    renameSync(output, join(root, "preserved"));
    save(join(root, "onboarding/preserve.json"), manifest);
    return manifest;
  } finally { opts.signal?.removeEventListener("abort", abort); await browser.close(); }
}
