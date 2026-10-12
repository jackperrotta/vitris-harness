import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFragment } from "parse5";
import { elementMatchesIdentity } from "../editing/identity.ts";
import type { ChangePlanRecord } from "./contracts.ts";

type Node = { attrs?: Array<{ name: string; value: string }>; childNodes?: Node[]; nodeName?: string;
  sourceCodeLocation?: { startOffset: number; endOffset: number } };

function maskTargetText(html: string, ids: string[]): string | undefined {
  const tree = parseFragment(html, { sourceCodeLocationInfo: true }) as Node;
  const replacements: Array<{ start: number; end: number }> = [];
  const found = new Map(ids.map(id => [id, 0]));
  const walk = (node: Node) => {
    for (const id of ids) {
      if (!elementMatchesIdentity(node.attrs, id)) continue;
      found.set(id, (found.get(id) || 0) + 1);
      const children = node.childNodes || [];
      if (children.length !== 1 || children[0]?.nodeName !== "#text" || !children[0].sourceCodeLocation) return;
      replacements.push({ start: children[0].sourceCodeLocation.startOffset, end: children[0].sourceCodeLocation.endOffset });
    }
    for (const child of node.childNodes || []) walk(child);
  };
  walk(tree);
  if (ids.some(id => found.get(id) !== 1) || replacements.length !== ids.length) return undefined;
  return replacements.sort((a, b) => b.start - a.start).reduce((text, item) =>
    text.slice(0, item.start) + "__VITRIS_PLANNED_TEXT__" + text.slice(item.end), html);
}

/** For exact copy plans, every source byte outside the named text fields must stay fixed. */
export function copyImpactFailures(root: string, requestId: string, plan: ChangePlanRecord, changedFiles: string[]): string[] {
  if (plan.facets.length !== 1 || plan.facets[0] !== "copy" ||
    plan.acceptanceCriteria.some(item => item.kind !== "exact_text")) return [];
  const ids = plan.targets.map(target => target.split("#")[1]).filter((id): id is string => Boolean(id));
  if (!ids.length) return ["Exact copy plan has no route#field target for source impact validation"];
  const failures: string[] = [];
  for (const file of changedFiles) {
    if (!file.endsWith(".html")) { failures.push(`Exact copy plan changed unrelated source file ${file}`); continue; }
    const backup = join(root, `agent/requests/${requestId}/source-backup`, file);
    if (!existsSync(backup)) { failures.push(`Exact copy plan has no baseline for ${file}`); continue; }
    const before = readFileSync(backup, "utf8"), after = readFileSync(join(root, file), "utf8");
    const applicable = ids.filter(id => before.includes(id) || after.includes(id));
    const maskedBefore = maskTargetText(before, applicable), maskedAfter = maskTargetText(after, applicable);
    if (maskedBefore === undefined || maskedAfter === undefined || maskedBefore !== maskedAfter) {
      failures.push(`Unplanned source impact inside ${file}; exact copy plan permits only named field text`);
    }
  }
  return failures;
}
