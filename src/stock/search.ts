import type { StockItem } from "./types.ts";

export type StockQuery = { text?: string; subject?: string; context?: string; detail?: string; metaphor?: string; composition?: string; palette?: string[]; lighting?: string; setting?: string; unwantedSubjects?: string[]; cropTolerance?: "low" | "medium" | "high"; recentExposure?: Record<string, number>; kind?: "image" | "video"; industry?: string; role?: string; orientation?: "landscape" | "portrait" | "square"; negativeSpace?: string; minWidth?: number; limit?: number };
/** Pure retrieval shared by the browser picker and agent. Captions are searchable, never proof of inspection. */
export function searchStock(items: StockItem[], query: StockQuery = {}): StockItem[] {
  const words = [query.text, query.subject, query.context, query.detail, query.metaphor, query.composition, query.setting, query.lighting, ...(query.palette || [])].filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const scored = items.filter(item => {
    if (item.status === "excluded" || item.status === "staged") return false;
    const subject = JSON.stringify([item.alt, item.inspection?.subjects]).toLowerCase();
    if (query.unwantedSubjects?.some(s => subject.includes(s.toLowerCase()))) return false;
    if (query.cropTolerance === "low" && (!item.inspection || /tight|limited|avoid crop/i.test(item.inspection.cropNotes))) return false;
    if (query.kind && item.kind !== query.kind) return false;
    if (query.minWidth && (!item.width || item.width < query.minWidth)) return false;
    if (query.industry && !(item.inspection?.industries || item.categories).includes(query.industry)) return false;
    if (query.role && !(item.inspection?.roles || item.categories).includes(query.role)) return false;
    if (query.negativeSpace && !item.inspection?.negativeSpace.includes(query.negativeSpace)) return false;
    const ratio = item.width && item.height ? item.width / item.height : 0;
    if (query.orientation && (!ratio || (query.orientation === "landscape" ? ratio < 1.15 : query.orientation === "portrait" ? ratio > 0.87 : ratio < 0.87 || ratio > 1.15))) return false;
    return true;
  }).map(item => {
    const text = JSON.stringify([item.alt, item.tags, item.categories, item.inspection]).toLowerCase();
    return { item, score: words.reduce((n, word) => n + Number(text.includes(word)), 0), exposure: query.recentExposure?.[item.id] || 0 };
  }).filter(row => !words.length || row.score > 0);
  return scored.sort((a, b) => (b.score - Math.min(0.5, b.exposure * 0.1)) - (a.score - Math.min(0.5, a.exposure * 0.1)) || a.item.id.localeCompare(b.item.id)).slice(0, Math.max(0, Math.min(query.limit ?? 100, 500))).map(row => row.item);
}

/** Set ranking is advisory; actual finalist pixels still determine acceptance. */
export function selectStockSet(items: StockItem[], queries: StockQuery[]): { query: StockQuery; item?: StockItem; uncertainty: string[] }[] {
  const chosen: StockItem[] = [];
  return queries.map(query => {
    const candidates = searchStock(items, { ...query, limit: 24 }).filter(i => !chosen.some(c => c.sha256 === i.sha256 || c.id === i.id));
    const compatibility = (i: StockItem) => chosen.reduce((n,c) => n + Number(i.inspection?.lighting === c.inspection?.lighting) + (i.inspection?.palette || []).filter(p => c.inspection?.palette.includes(p)).length - Number(i.inspection?.focalPoint === c.inspection?.focalPoint && i.inspection?.density === c.inspection?.density), 0);
    const scored = candidates.map((item, rank) => ({ item, score: 24 - rank + compatibility(item) * 0.3 }));
    const item = scored.sort((a,b) => b.score - a.score)[0]?.item;
    if (item) chosen.push(item);
    return { query, item, uncertainty: item?.inspection ? [...item.inspection.uncertainty, "Pixel and intended-size review required; metadata ranking is advisory"] : [item ? "Visual observations unavailable" : "No match: use the commission's vector, customer or text fallback"] };
  });
}
