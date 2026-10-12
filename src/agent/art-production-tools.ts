import { existsSync } from "node:fs";
import { join } from "node:path";
import { json, save } from "./artifacts.ts";
import { byteHash, type VisualCommission } from "./art-direction.ts";
import { escapeHtml } from "../html.ts";
import { assertTemplateImageAuthorization } from './template-adaptation.ts';

export type GenerationAdapter = { identity: string; generate: (commission: VisualCommission, operationId: string) => Promise<{ localPath: string; prompt: string; model?: string; receipt?: string }> };
/** Explicit host capability, never a mandatory runtime dependency or implicit paid provider. */
export async function produceRaster(root: string, operationId: string, commission: VisualCommission, adapter?: GenerationAdapter) {
  assertTemplateImageAuthorization(root,commission.id,commission);
  if (!/^[a-z0-9-]{3,80}$/.test(operationId)) throw new Error("Invalid operation ID");
  const path = join(root, `artwork/generation-${operationId}.json`), signature = byteHash(JSON.stringify({ commission, tool: adapter?.identity || null }));
  if (existsSync(path)) {
    const old = json<{ signature: string; status: string }>(path); if (old.signature !== signature) throw new Error("Generation operation inputs changed");
    return { ...old, ...(old.status === "dispatched" ? {status:"unknown", reason:"Interrupted dispatch; reconcile host receipt before a new operation"} : {}) };
  }
  const record = {version:1, operationId, signature, commission, status: adapter ? "dispatched" : "unavailable", tool:adapter?.identity || null, measuredCost:null, model:null, fallback:commission.fallback};
  save(path,record); if (!adapter) return record;
  try {
    const output = await adapter.generate(commission, operationId);
    const result = {...record, status:"produced", output}; save(path,result); return result;
  } catch(e) { const result = {...record,status:"unknown",reason:String(e)}; save(path,result); return result; }
}

/** Semantic labels stay HTML; narrow screens reflow nodes and keep edge meaning in explicit relationship text. */
export function responsiveDiagram(c: VisualCommission): string {
  if (!c.diagram) throw new Error("Commission has no diagram semantic model");
  const { nodes, edges, description } = c.diagram;
  const labels = new Map(nodes.map(n => [n.id,n.label]));
  if (labels.size !== nodes.length || edges.some(e => !labels.has(e.from) || !labels.has(e.to))) throw new Error("Invalid diagram relationship");
  return `<figure class="relationship-diagram" aria-labelledby="diagram-${escapeHtml(c.id)}"><figcaption id="diagram-${escapeHtml(c.id)}">${escapeHtml(c.purpose)}</figcaption><p>${escapeHtml(description)}</p><ol class="diagram-nodes">${nodes.map(n=>`<li data-entity="${escapeHtml(n.id)}">${escapeHtml(n.label)}</li>`).join("")}</ol><ul class="diagram-relationships">${edges.map(e=>`<li>${escapeHtml(labels.get(e.from)!)} → ${escapeHtml(labels.get(e.to)!)}: ${escapeHtml(e.label)}</li>`).join("")}</ul></figure>`;
}
export const RESPONSIVE_DIAGRAM_CSS = `.diagram-nodes{display:flex;gap:1rem;padding:0;list-style-position:inside}.diagram-nodes li{flex:1;padding:1.25rem;border:1px solid currentColor;font-size:1.125rem}.diagram-relationships{line-height:1.6}@media(max-width:600px){.diagram-nodes{flex-direction:column}.diagram-nodes li{font-size:1.125rem}}`;

export function cropAwarePicture(opts: { src: string; mobileSrc?: string; width: number; height: number; alt: string; focal?: string; initial?: boolean; caption?: string }): string {
  const attr = escapeHtml;
  return `<figure>${opts.mobileSrc ? `<picture><source media="(max-width:600px)" srcset="${attr(opts.mobileSrc)}">` : ""}<img src="${attr(opts.src)}" width="${opts.width}" height="${opts.height}" alt="${attr(opts.alt)}" loading="${opts.initial ? "eager" : "lazy"}" ${opts.initial ? 'fetchpriority="high"' : 'decoding="async"'} style="width:100%;height:auto;object-fit:cover;object-position:${attr(opts.focal || "50% 50%")}">${opts.mobileSrc ? "</picture>" : ""}${opts.caption ? `<figcaption>${attr(opts.caption)}</figcaption>` : ""}</figure>`;
}
