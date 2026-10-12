/** Priority crawl queue so home / about / work are visited before legal and shop. */

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase() || "/";
  } catch {
    return "/";
  }
}

function isHome(url: string, startUrl: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(startUrl);
    const path = a.pathname.replace(/\/+$/, "") || "/";
    return path === "/" || path === "/home" || path === "/index" || a.href === b.href;
  } catch {
    return false;
  }
}

/**
 * Lower number is crawled first. Legal/shop trail so a --max-pages abort
 * still captures the media-rich pages.
 */
export function crawlPriority(url: string, startUrl: string): number {
  if (isHome(url, startUrl)) return 0;
  const path = pathnameOf(url);
  if (/\/(about|team|meet-the-team|our-team)(\/|$)/.test(path)) return 1;
  if (/\/(portfolio|work|our-work|projects|gallery)(\/|$)/.test(path)) return 2;
  if (/\/(how-it-works|process)(\/|$)/.test(path)) return 3;
  if (/\/(features|services|menu|offer)(\/|$)/.test(path)) return 4;
  if (/\/(pricing|packages|plans)(\/|$)/.test(path)) return 5;
  if (/\/(contact|schedule|book|demo)(\/|$)/.test(path)) return 6;
  if (/\/(legal|privacy|terms|cookie|shop|cart|login|account)(\/|$)/.test(path)) return 90;
  return 20;
}

export function insertByCrawlPriority(queue: string[], url: string, startUrl: string): void {
  const p = crawlPriority(url, startUrl);
  let i = 0;
  while (i < queue.length && crawlPriority(queue[i]!, startUrl) <= p) i += 1;
  queue.splice(i, 0, url);
}
