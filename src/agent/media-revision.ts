import { existsSync } from "node:fs";
import { join } from "node:path";
import { json, save } from "./artifacts.ts";
import { invalidate } from "./graph.ts";
import { loadSiteGraph } from "./workflow.ts";
import { loadState } from "./runner.ts";
import { findActivePreparation, invalidatePreparation, releaseDurableLease, withMutationLock } from "./preparation.ts";
import { artDirectionPolicy } from "./art-direction-policy.ts";

export type MediaRevision = { operationId: string; kind: "inspection" | "placement" | "derivative" | "illustration" | "customer-evidence" | "factual" | "unknown"; request: string; routes: string[]; preserve: string[] };
export function reviseMedia(root: string, request: MediaRevision) {
  if (!artDirectionPolicy(root) || !/^[a-z0-9-]{3,80}$/.test(request.operationId) || !request.request.trim()) throw new Error("Media revision needs opted-in policy, durable ID and exact request");
  return withMutationLock(root, () => {
    const path = join(root, `agent/media-revisions/${request.operationId}.json`);
    if (existsSync(path)) { const old = json<{request:MediaRevision;owner:string;at:string;affected:string[]}>(path); if (JSON.stringify(old.request) !== JSON.stringify(request)) throw new Error("Revision operation identity changed"); return old; }
    const graph = loadSiteGraph(root), state = loadState(root,graph);
    // Invalidate the owner and graph dependents, preserving facts for new illustrative material.
    const owner = request.kind === "placement" ? "storyboard" : ["derivative","illustration"].includes(request.kind) ? "asset-production" : ["unknown","inspection"].includes(request.kind) ? "media" : "business";
    for (const node of graph.nodes) {
      const prep = findActivePreparation(root,node.id); if (!prep) continue;
      // Stop before mutating any source; an active creative inventory stays immutable.
      invalidatePreparation(root,prep.id,"Media revision routed to " + owner); releaseDurableLease(root,`stage-${node.id}`,prep.ownerToken);
    }
    invalidate(graph,state,owner);
    // Media is a sibling of business after harvest, so facts/new customer
    // evidence must explicitly reopen both owners and their dependents.
    if (["customer-evidence", "factual"].includes(request.kind)) invalidate(graph,state,"media");
    save(join(root,"agent/STATE.json"),state);
    const receipt = {version:1,request,owner,at:new Date().toISOString(),affected:graph.nodes.filter(n=>state.nodes[n.id]?.status==="pending").map(n=>n.id)};
    save(path,receipt); save(join(root,`agent/requests/${owner}.json`),{originalRequest:request.request,proposedChanges:request.request,preserve:request.preserve,evidencePath:`agent/media-revisions/${request.operationId}.json`,routes:request.routes}); return receipt;
  });
}
