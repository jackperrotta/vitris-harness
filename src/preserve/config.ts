import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublicForm } from '../forms/config.ts';
import {readOnlyEmbedProvider} from './embeds.ts';

export type PreserveLaunch = { mode?: "redesign" | "preserve"; sourceUrl?: string; backendOrigin?: string; slug?: string; forms?: PublicForm[]; previewDisabledTransactions?: boolean };
export function preserveConfig(root: string): PreserveLaunch {
  return existsSync(join(root, "launch.json")) ? JSON.parse(readFileSync(join(root, "launch.json"), "utf8")) : {};
}
export const isPreserveSite = (root: string) => preserveConfig(root).mode === "preserve";
export const PRESERVE_WIDTHS = [1440, 390] as const;
export const PRESERVE_HEIGHT = 1000;
// The legacy Gallery renderer (chunk 9) is a static portfolio-grid of images.
export const SUPPORTED_REACT_BLOCKS = new Set(['cta', 'cf', 'html', 'h', 'bf', 'g']);
/** Resolve only known static block support added after an immutable capture. */
export function unresolvedCaptureBlockers(manifest: PreserveManifest, staticComponents=new Map<string,Set<string>>(), resolvedNavigationAssets=new Set<string>(), reactComponents=new Map<string,Set<string>>(), repairedNavigation=new Set<string>()): string[] {
  return (manifest.blockers || []).filter(blocker => {
    const failedNavigation=blocker.match(/^(\/[^\n]*): Source (?:page failed|returned a soft 404|navigation failed)/)?.[1];
    if(failedNavigation&&repairedNavigation.has(failedNavigation))return false;
    const navigationAsset=blocker.match(/^Asset (?:returned HTML|failed): (\S+)(?: \(\d+\))?; missing authored asset retained as an empty placeholder, not claimed as preserved bytes$/)?.[1];
    if(navigationAsset&&resolvedNavigationAssets.has(navigationAsset))return false;
    const components=blocker.match(/^(\/[^\n]*): Legacy components need preservation support: ([a-zA-Z0-9, -]+)$/);
    if(components && components[2]!.split(',').every(kind=>staticComponents.get(components[1]!)?.has(kind.trim())))return false;
    const blocks = blocker.match(/^(\/[^\n]*): Legacy React blocks need preservation support: ([a-z0-9, -]+)$/);
    if (blocks && blocks[2]!.split(',').every(bt=>SUPPORTED_REACT_BLOCKS.has(bt.trim())||reactComponents.get(blocks[1]!)?.has(bt.trim()))) return false;
    const form=blocker.match(/^(\/[^\n]*): Unrelated form requires an explicit preservation adapter; it cannot be routed to contact forms$/);
    if(form&&reactComponents.get(form[1]!)?.has('cform'))return false;
    const embeds = blocker.match(/^\/[^\n]*: Unsupported interactive content: (.+)\. Add an adapter before publishing\.$/)?.[1];
    if (embeds && embeds.split(', ').every(item=>item.startsWith('iframe:') && !!readOnlyEmbedProvider(item.slice(7)))) return false;
    return true;
  }).map(blocker=>{
    const components=blocker.match(/^(\/[^\n]*): Legacy components need preservation support: ([a-zA-Z0-9, -]+)$/);
    if(components){const remaining=components[2]!.split(',').map(k=>k.trim()).filter(k=>!staticComponents.get(components[1]!)?.has(k));return `${components[1]}: Legacy components need preservation support: ${remaining.join(', ')}`;}
    const blocks=blocker.match(/^(\/[^\n]*): Legacy React blocks need preservation support: ([a-z0-9, -]+)$/);
    if(blocks){const remaining=blocks[2]!.split(',').map(k=>k.trim()).filter(k=>!SUPPORTED_REACT_BLOCKS.has(k)&&!reactComponents.get(blocks[1]!)?.has(k));return `${blocks[1]}: Legacy React blocks need preservation support: ${remaining.join(', ')}`;}
    const embeds=blocker.match(/^(\/[^\n]*): Unsupported interactive content: (.+)\. Add an adapter before publishing\.$/);
    if(embeds){const remaining=embeds[2]!.split(', ').filter(item=>!item.startsWith('iframe:')||!readOnlyEmbedProvider(item.slice(7)));return `${embeds[1]}: Unsupported interactive content: ${remaining.join(', ')}. Add an adapter before publishing.`;}
    return blocker;
  });
}
export type PreservePage = { url: string; path: string; file: string; references: Array<{ width: number; file: string; sha256: string }>; sourceFailure?: {status:number;kind:'http-404'|'soft-404';responseFile:string;responseSha256:string} };
export type PreserveManifest = {
  version: 1; adapter: "vitris-v1" | "vitris-v2"; sourceUrl: string; capturedAt: string;
  pages: PreservePage[]; assets: Array<{ url: string; file: string; sha256: string; originalSha256?: string; referenceFile?: string; captureError?: string }>;
  serviceMode: "preview-only" | "vitris-forms"; warnings: string[];
  /** Diagnostic captures retain independent work but cannot pass release gates. */
  blockers?: string[];
};

/** Reject ambiguous/unsafe routes rather than flattening them into another page. */
export function pageFile(path: string): string {
  const url = new URL(path, "https://preserve.invalid");
  if (url.search) throw new Error(`Query-dependent page needs a preservation adapter: ${path}`);
  const decoded = decodeURIComponent(url.pathname);
  if (/[\\\x00-\x1f:*?"<>|]/.test(decoded) || decoded.split("/").some(p => p === "." || p === ".." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p))) throw new Error(`Unsupported route: ${path}`);
  return decoded === "/" ? "index.html" : `${decoded.replace(/^\/|\/$/g, "")}/index.html`;
}
