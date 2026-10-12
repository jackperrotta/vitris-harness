import { createHash } from "node:crypto";
import { assertTemplateImageAuthorization } from './template-adaptation.ts';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fingerprint, json, save, within, type Business, type MediaInventory } from "./artifacts.ts";
import { artDirectionPolicy } from "./art-direction-policy.ts";
import { findActivePreparation, loadPreparation, withMutationLock } from "./preparation.ts";
import { validateAddedMedia } from "./added-media.ts";
import { assertSafeSvg, mediaDimensions } from "./media-format.ts";
export { assertSafeSvg } from "./media-format.ts";

export const byteHash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export type VisualCommission = {
  id: string; purpose: string; route: string; factIds: string[]; sourceAssetIds: string[];
  role: "identity" | "proof" | "explanation" | "atmosphere" | "navigation" | "decoration";
  medium: "customer" | "stock" | "authored-vector" | "generated-raster" | "video" | "text";
  idea: string; composition: string; responsive: { desktop: string; mobile: string; minimumReadableSize: string };
  acceptance: string[]; fallback: string; forbiddenImplications: string[];
  referenceRelationships: string[];
  diagram?: { nodes: { id: string; label: string; factIds: string[] }[]; edges: { from: string; to: string; label: string; factIds: string[] }[]; description: string };
};
export type VisualAssetBrief = { version: 1; policyHash: string; directionHash: string; businessHash: string;
  system: { palette: string; lightMaterial: string; geometry: string; stroke: string; captionVoice: string; motion: string };
  commissions: VisualCommission[] };
export type AssetProduction = { version: 1; briefHash: string; decisions: { requestId: string; assetIds: string[]; outcome: "accepted" | "fallback"; reason: string;
  evidence: { path: string; sha256: string; level: "asset" | "crop" | "section" | "page"; viewport: string; observation: string }[] }[] };

export function validateAssetBrief(root: string, brief: VisualAssetBrief): string[] {
  const policy = artDirectionPolicy(root); if (!policy) return [];
  const errors: string[] = [];
  const business = json<Business>(join(root, "onboarding/business.json"));
  const inventory = json<MediaInventory>(join(root, "onboarding/media-inventory.json"));
  const facts = new Set(business.facts.map(f => f.id)), assets = new Set(inventory.assets.map(a => a.id));
  if (brief.version !== 1 || brief.policyHash !== policy.hash || brief.businessHash !== fingerprint(root, ["onboarding/business.json"]) || brief.directionHash !== fingerprint(root, ["onboarding/direction.json"])) errors.push("Stale visual asset brief identities");
  if (!brief.system || Object.values(brief.system).length !== 6 || Object.values(brief.system).some(v => typeof v !== "string" || !v.trim())) errors.push("Brief needs a concise complete visual system");
  const ids = new Set<string>();
  for (const c of brief.commissions || []) {
    if (!/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id)) errors.push("Invalid/duplicate commission ID"); ids.add(c.id);
    if ([c.purpose, c.route, c.idea, c.composition, c.fallback, c.responsive?.desktop, c.responsive?.mobile, c.responsive?.minimumReadableSize].some(v => typeof v !== "string" || !v.trim()) || !c.acceptance?.length || !c.forbiddenImplications?.length || !Array.isArray(c.referenceRelationships)) errors.push(`${c.id}: incomplete visitor/composition/responsive/acceptance contract`);
    if (!["customer", "stock", "authored-vector", "generated-raster", "video", "text"].includes(c.medium) || !["identity", "proof", "explanation", "atmosphere", "navigation", "decoration"].includes(c.role)) errors.push(`${c.id}: invalid medium/role`);
    if (!c.factIds?.length || c.factIds.some(id => !facts.has(id)) || !Array.isArray(c.sourceAssetIds) || c.sourceAssetIds.some(id => !assets.has(id))) errors.push(`${c.id}: unsupported content/source relationship`);
    if (c.diagram) {
      const nodeIds = new Set(c.diagram.nodes.map(n => n.id));
      if (!c.diagram.description?.trim() || nodeIds.size !== c.diagram.nodes.length || !nodeIds.size) errors.push(`${c.id}: diagram needs unique entities and an equivalent description`);
      for (const n of [...c.diagram.nodes, ...c.diagram.edges]) if (!n.label?.trim() || !n.factIds.length || n.factIds.some(id => !facts.has(id))) errors.push(`${c.id}: unsupported diagram label/relationship`);
      for (const e of c.diagram.edges) if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) errors.push(`${c.id}: broken diagram edge`);
    }
  }
  return errors;
}

export function validateAssetProduction(root: string): string[] {
  if (!artDirectionPolicy(root)) return [];
  try {
    const brief = json<VisualAssetBrief>(join(root, "onboarding/visual-asset-brief.json"));
    const errors = validateAssetBrief(root, brief);
    const result = json<AssetProduction>(join(root, "onboarding/asset-production.json"));
    const inventory = json<MediaInventory>(join(root, "onboarding/media-inventory.json"));
    errors.push(...validateAddedMedia(root, inventory).findings.map(f => `${f.path}: ${f.explanation}`));
    if (result.version !== 1 || result.briefHash !== fingerprint(root, ["onboarding/visual-asset-brief.json"])) errors.push("Stale production briefHash");
    if (result.decisions?.length !== brief.commissions.length) errors.push("Resolve each consequential commission exactly once");
    for (const c of brief.commissions) {
      const rows = result.decisions.filter(d => d.requestId === c.id), d = rows[0];
      if (rows.length !== 1 || !d || !d.reason?.trim() || !["accepted", "fallback"].includes(d.outcome)) { errors.push(`${c.id}: missing production decision`); continue; }
      if (d.outcome === "accepted" && c.medium !== "text" && !d.assetIds.length) errors.push(`${c.id}: accepted visual has no asset`);
      for (const id of d.assetIds) {
        const a = inventory.assets.find(a => a.id === id);
        if (!a || !a.inspected || a.disposition !== "use" || !a.sha256 || byteHash(readFileSync(within(root, a.path.replace(/^\//, "")))) !== a.sha256 || a.inspection?.assetHash !== a.sha256) errors.push(`${c.id}: asset ${id} needs current pixel inspection and use disposition`);
      }
      if (!d.evidence?.some(e => e.level === "asset") && d.assetIds.length) errors.push(`${c.id}: missing full-asset evidence`);
      for (const e of d.evidence || []) {
        if (!e.observation?.trim() || !e.viewport?.trim() || !existsSync(within(root, e.path)) || byteHash(readFileSync(within(root, e.path))) !== e.sha256) errors.push(`${c.id}: missing/changed inspection evidence`);
      }
    }
    return errors;
  } catch (e) { return [String(e)]; }
}

/** Portable boundary: a host saves bytes and a real recipe; registration never asserts inspection. */
export function registerProducedAsset(root: string, opts: { preparationId: string; operationId: string; requestId: string; input: string; sourcePath: string; method: "generated-raster" | "authored-vector" | "derived"; tool: string; model?: string; prompt?: string; parents?: string[]; rights: string; forbiddenImplications: string[] }) {
  return withMutationLock(root, () => {
    const prep = loadPreparation(root, opts.preparationId);
    if (!artDirectionPolicy(root) || !prep || prep.status !== "prepared" || prep.nodeId !== "asset-production" || findActivePreparation(root, "asset-production")?.id !== prep.id) throw new Error("Registration requires the active asset-production preparation; creative inventory is immutable");
    if (!/^[a-z0-9-]{3,80}$/.test(opts.operationId)) throw new Error("Use a durable operation ID");
    if (!["generated-raster", "authored-vector", "derived"].includes(opts.method)) throw new Error("Unsupported production method");
    const brief = json<VisualAssetBrief>(join(root, "onboarding/visual-asset-brief.json"));
    if (opts.method==='generated-raster' || opts.method==='derived' && /imagegen|image_gen|gpt-image/i.test(opts.tool)) assertTemplateImageAuthorization(root,opts.requestId,brief.commissions.find(c=>c.id===opts.requestId));
    if (validateAssetBrief(root, brief).length || !brief.commissions.some(c => c.id === opts.requestId)) throw new Error("Registration requires a valid declared commission");
    if (!opts.rights.trim() || !opts.tool.trim() || !opts.forbiddenImplications.length) throw new Error("Production requires rights, real tool identity and forbidden implications");
    const input = within(root, opts.input), source = within(root, opts.sourcePath);
    if (!opts.sourcePath.startsWith("artwork/") || !existsSync(source)) throw new Error("Editable source/recipe must be under artwork/");
    const bytes = readFileSync(input), sha256 = byteHash(bytes), sourceSha256 = byteHash(readFileSync(source));
    const ext = opts.input.split(".").pop()!.toLowerCase();
    if (!["svg", "png", "jpg", "jpeg", "webp"].includes(ext) || (opts.method === "authored-vector" && ext !== "svg") || (opts.method === "generated-raster" && ext === "svg")) throw new Error("Unsupported artwork format");
    if (ext === "svg") assertSafeSvg(bytes.toString());
    const inventoryPath = join(root, "onboarding/media-inventory.json"), inv = json<MediaInventory>(inventoryPath);
    const parents = (opts.parents || []).map(id => {
      const a = inv.assets.find(a => a.id === id); if (!a || !a.sha256 || byteHash(readFileSync(within(root, a.path.replace(/^\//, "")))) !== a.sha256) throw new Error("Missing/changed parent: " + id);
      return { assetId: id, path: a.path, sha256: a.sha256, origin: a.origin || "unknown" as const };
    });
    if(opts.method==='derived'&&/imagegen|image_gen|gpt-image/i.test(opts.tool)) {
      const commission=brief.commissions.find(c=>c.id===opts.requestId);
      if(JSON.stringify(parents.map(p=>p.assetId).sort())!==JSON.stringify([...(commission?.sourceAssetIds||[])].sort()))throw Error('Derived image parents differ from its declared commission');
    }
    if ((opts.method === "derived") !== Boolean(parents.length)) throw new Error("Derived production needs parents; original illustration cannot conceal source parents");
    const origins = new Set(parents.map(p => p.origin));
    if (origins.size > 1) throw new Error("Mixed-origin composites need separately registered layers; do not collapse provenance");
    const origin = parents[0]?.origin || "authored";
    const path = `/media/${opts.method === "derived" ? "derived" : "generated"}/${sha256}.${ext}`;
    const production = { method: opts.method, operationId: opts.operationId, requestId: opts.requestId, sourcePath: opts.sourcePath, sourceSha256, ...(opts.prompt ? { prompt: opts.prompt } : {}), tool: opts.tool, ...(opts.model ? { model: opts.model } : {}), parents, rights: opts.rights, forbiddenImplications: opts.forbiddenImplications };
    const sourceParents=parents.map(p=>inv.assets.find(a=>a.id===p.assetId)!);
    const identities=new Set(sourceParents.map(a=>a.identity || "uncertain"));
    if(identities.size>1)throw new Error("Mixed identity composite needs separate registered layers");
    const asset: MediaInventory["assets"][number] = { id: `art-${opts.operationId}`, path, sha256, origin, production, sources: parents.length ? [...new Set(sourceParents.flatMap(a => a.sources))] : [opts.sourcePath], description: "Awaiting visual inspection", role: "illustration", disposition: "retain", reason: "Produced output awaiting acceptance", inspected: false, placements: [], identity: sourceParents[0]?.identity || "none", identityEvidence: [...new Set(sourceParents.flatMap(a=>a.identityEvidence || []))], ...(sourceParents[0]?.provenance ? {provenance:sourceParents[0].provenance}:{}), ...mediaDimensions(bytes,ext), kind: "image" };
    const opPath = join(root, `onboarding/asset-operations/${opts.operationId}.json`);
    const signature = byteHash(JSON.stringify({ asset, input: opts.input }));
    if (existsSync(opPath) && json<{ signature: string }>(opPath).signature !== signature) throw new Error("Operation identity changed; keep prior version and use a new operation ID");
    if (inv.assets.some(a => a.id === asset.id && (a.sha256 !== sha256 || JSON.stringify(a.production) !== JSON.stringify(production)))) throw new Error("Registered operation conflicts");
    if (inv.assets.some(a => a.path === path && a.id !== asset.id)) throw new Error("Produced bytes already registered under another identity");
    save(opPath, { version: 1, signature, asset, status: "intent", preparationId: prep.id });
    const dest = within(root, path.slice(1)); mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest) && byteHash(readFileSync(dest)) !== sha256) throw new Error("Immutable output conflict");
    if (!existsSync(dest)) writeFileSync(dest, bytes, { flag: "wx" });
    if (!inv.assets.some(a => a.id === asset.id)) { inv.assets.push(asset); save(inventoryPath, inv); }
    save(opPath, { version: 1, signature, asset, status: "registered", preparationId: prep.id });
    return inv.assets.find(a => a.id === asset.id)!;
  });
}

export function inspectProducedAsset(root: string, options: {preparationId: string; assetId: string; inspection: import("../stock/types.ts").MediaInspection; width: number; height: number; placements: string[]; reason: string}) {
  return withMutationLock(root,()=>{
    const prep=loadPreparation(root,options.preparationId);
    if(!prep || prep.nodeId!=="asset-production" || prep.status!=="prepared" || findActivePreparation(root,"asset-production")?.id!==prep.id)throw new Error("Inspection acceptance needs the active production preparation");
    const path=join(root,"onboarding/media-inventory.json"),inv=json<MediaInventory>(path),a=inv.assets.find(a=>a.id===options.assetId);
    if(!a?.production || !a.sha256 || a.sha256!==options.inspection.assetHash || byteHash(readFileSync(within(root,a.path.slice(1))))!==a.sha256)throw new Error("Inspection asset bytes are missing or changed");
    const measured=mediaDimensions(readFileSync(within(root,a.path.slice(1))),a.path.split(".").pop()!);
    if(measured&&(measured.width!==options.width||measured.height!==options.height))throw new Error("Declared dimensions do not match actual asset bytes");
    if(!options.reason.trim() || !options.placements.length || !Number.isSafeInteger(options.width) || options.width<1 || !Number.isSafeInteger(options.height) || options.height<1 || options.inspection.version!==1 || !options.inspection.observer.trim() || !options.inspection.observedAt || !options.inspection.description.trim() || !options.inspection.evidence.length || !Array.isArray(options.inspection.uncertainty))throw new Error("Inspection needs actual dimensions, observer, observations, evidence, placements and uncertainty");
    for(const evidence of options.inspection.evidence)if(!existsSync(within(root,evidence)))throw new Error("Inspection evidence missing");
    const original=prep.mediaAuditSnapshot ? JSON.parse(prep.mediaAuditSnapshot).assets.find((old:MediaInventory["assets"][number])=>old.id===a.id):undefined;
    if(original?.inspected)throw new Error("An accepted asset is immutable; revise through a new version");
    Object.assign(a,{inspection:options.inspection,description:options.inspection.description,inspected:true,disposition:"use",width:options.width,height:options.height,placements:options.placements,reason:options.reason});save(path,inv);return a;
  });
}

/** Retire a production-owned version from selection without changing its bytes,
 * inspection, lineage, or the upstream customer/stock audit. */
export function retireProducedAsset(root: string, options: {preparationId:string;operationId:string;assetId:string;reason:string}) {
  return withMutationLock(root,()=>{
    const prep=loadPreparation(root,options.preparationId);
    if(!prep||prep.nodeId!=="asset-production"||prep.status!=="prepared"||findActivePreparation(root,"asset-production")?.id!==prep.id)throw new Error("Retirement requires the active production owner");
    if(!/^[a-z0-9-]{3,80}$/.test(options.operationId)||!options.reason.trim())throw new Error("Retirement needs a durable identity and reason");
    const path=join(root,"onboarding/media-inventory.json"),inv=json<MediaInventory>(path),asset=inv.assets.find(a=>a.id===options.assetId);
    if(!asset?.production||!asset.inspected||!asset.sha256||byteHash(readFileSync(within(root,asset.path.slice(1))))!==asset.sha256)throw new Error("Retire only an inspected unchanged production-owned version");
    const record={version:1,kind:"retirement",...options,sha256:asset.sha256};
    const op=join(root,`onboarding/asset-operations/${options.operationId}.json`);
    if(existsSync(op)&&JSON.stringify(json(op))!==JSON.stringify(record))throw new Error("Retirement operation identity changed");
    save(op,record);
    Object.assign(asset,{disposition:"retain",placements:[],reason:options.reason});save(path,inv);return asset;
  });
}

export function artDirectionContext(root: string): string {
  const policy = artDirectionPolicy(root); if (!policy) return "";
  const material = ["onboarding/visual-asset-brief.json", "onboarding/asset-production.json"].filter(p => existsSync(join(root, p))).map(p => `${p}:\n${readFileSync(join(root, p), "utf8")}`).join("\n");
  return `Art direction ${policy.release} (${policy.hash}). Audit existing media first. After direction, commission purposeful assets in the asset-production owner before final storyboard. Planned visuals are opportunities until inspected and accepted. Search the accepted stock catalog first. Essential labels remain editable. Never generate customer proof. Missing media during creative revision must route through vitris-art revise, then fresh production preparation; do not mutate inventory from the creative node. Review full asset, intended crop, section, whole-page rhythm, mobile sequence/captions and diagram meaning. Use not-applicable without forcing media quotas.\n${material}`;
}
