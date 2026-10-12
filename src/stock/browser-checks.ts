import type { Page } from "playwright";
import type { MediaInventory, Storyboard } from "../agent/artifacts.ts";

/** Check the rendered region and visibility, rather than matching asset paths in HTML text. */
export async function checkSharedMedia(page: Page, story: Storyboard, inventory: MediaInventory, route: string): Promise<string[]> {
  if (story.version !== 3) return [];
  const required = (story.globalMedia || []).filter(row => row.routes.includes(route));
  const rows = required.map(row => ({ assetId: row.assetId, placement: row.placement, route, path: inventory.assets.find(asset => asset.id === row.assetId)?.path || "" }));
  return page.evaluate("(() => { const rows = " + JSON.stringify(rows) + "; const errors = []; for (const row of rows) { const region = document.querySelector(row.placement === 'header' ? 'header, [role=\"banner\"]' : row.placement); const image = region && [...region.querySelectorAll('img')].find(img => { if (!row.path) return false; const source = img.currentSrc || img.src || ''; if (!source.includes(row.path) && !(img.getAttribute('src') || '').includes(row.path)) return false; if (!img.complete || img.naturalWidth <= 0) return false; let element = img; while (element) { const style = getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false; element = element.parentElement; } const rect = img.getBoundingClientRect(); return rect.width > 1 && rect.height > 1; }); if (!image) errors.push('Shared media ' + row.assetId + ' missing or hidden in ' + row.placement + ' on ' + row.route); } return errors; })()") as Promise<string[]>;
}

/** Flag long heading words split across lines at phone width for visual review. */
export async function checkHeadingWordBreaks(page: Page): Promise<string[]> {
  return page.evaluate("(() => { const failures = []; for (const heading of document.querySelectorAll('h1')) { const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT); while (walker.nextNode()) { const node = walker.currentNode; const text = node.textContent || ''; for (const match of text.matchAll(/[A-Za-z]{8,}/g)) { const tops = new Set(); for (let i = match.index; i < match.index + match[0].length; i++) { const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1); const rect = range.getBoundingClientRect(); if (rect.width > 0) tops.add(Math.round(rect.top)); } if (tops.size > 1) failures.push('Mobile heading breaks inside word: ' + match[0]); } } } return failures; })()") as Promise<string[]>;
}

/** Checks observable video behavior; visual crop judgment remains with the reviewer. */
export async function checkPageVideos(page: Page): Promise<string[]> {
  return await page.evaluate(`(async () => {
    const errors=[];
    for (const video of document.querySelectorAll('video')) {
      if (!video.getClientRects().length) continue;
      const label=video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || 'video';
      if (!video.poster) errors.push('Video needs a poster: '+label);
      else {
        const poster=new Image(); poster.src=video.poster;
        const ok=await Promise.race([poster.decode().then(()=>true,()=>false),new Promise(r=>setTimeout(()=>r(false),3000))]);
        if (!ok) errors.push('Broken video poster: '+label);
      }
      if (video.readyState === 0 && (video.getAttribute('src') || video.querySelector('source[src]'))) {
        await Promise.race([new Promise(r=>{video.addEventListener('loadedmetadata',r,{once:true});video.addEventListener('error',r,{once:true});video.load();}),new Promise(r=>setTimeout(r,3000))]);
        if (video.readyState === 0 && !video.error) errors.push('Video metadata could not be verified: '+label);
      }
      if (video.autoplay && !video.muted) errors.push('Autoplay video must be muted: '+label);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches && !video.paused) errors.push('Video plays despite reduced motion: '+label);
      if (!video.currentSrc && !video.getAttribute('src') && !video.querySelector('source[src]')) errors.push('Video has no source: '+label);
      if (video.error) errors.push('Video media error: '+label);
    }
    return errors;
  })()`) as string[];
}
