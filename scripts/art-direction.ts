#!/usr/bin/env node
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { json } from "../src/agent/artifacts.ts";
import { registerProducedAsset, inspectProducedAsset, retireProducedAsset, validateAssetProduction } from "../src/agent/art-direction.ts";
import { reviseMedia, type MediaRevision } from "../src/agent/media-revision.ts";
import { acquireSiteStock } from "../src/stock/site-acquisition.ts";
import { readStockCatalog } from "../src/stock/library.ts";
import { findHarnessRoot } from "../src/cli/root.ts";
import { findActivePreparation } from "../src/agent/preparation.ts";
const arg = (name:string) => {const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const root=resolve(arg("--site") || "."), command=process.argv[2];
if (command==="retire") {
  console.log(JSON.stringify(retireProducedAsset(root,json<any>(resolve(arg("--record")!))),null,2));
} else if (command==="inspect") {
  console.log(JSON.stringify(inspectProducedAsset(root,json<any>(resolve(arg("--record")!))),null,2));
} else if (command==="register") {
  if (!arg("--record")) throw new Error("register needs --record JSON with preparationId, operationId, requestId, input, sourcePath, method, tool, rights and forbiddenImplications");
  console.log(JSON.stringify(registerProducedAsset(root,json<any>(resolve(arg("--record")!))),null,2));
} else if (command==="verify") { const failures=validateAssetProduction(root);console.log(JSON.stringify({ok:!failures.length,failures})); if(failures.length)process.exitCode=1;
} else if (command==="revise") {
  console.log(JSON.stringify(reviseMedia(root,json<MediaRevision>(resolve(arg("--record")!))),null,2));
} else if (command==="acquire") {
  const prep=findActivePreparation(root,"asset-production");if(!prep)throw new Error("Acquisition needs the active asset-production preparation");
  const kernel=findHarnessRoot();let key=process.env.PEXELS_API_KEY;
  if(!key&&existsSync(join(kernel,".dev.vars")))key=readFileSync(join(kernel,".dev.vars"),"utf8").match(/^PEXELS_API_KEY\s*=\s*["']?([^\s"']+)/m)?.[1];
  const record=json<any>(resolve(arg("--record")!));
  console.log(JSON.stringify(await acquireSiteStock({...record,root,catalog:readStockCatalog(join(kernel,"src/stock/catalog.json")).items,key}),null,2));
} else console.log("vitris-art register|inspect|retire|verify|revise|acquire --site SITE [--record JSON]. Kickoff/resume: vitris-go --site SITE --no-preview-server. Register only during the asset-production preparation; inspection and acceptance follow registration.");
