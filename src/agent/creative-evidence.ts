import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { files, fingerprint, json, save, type Business, type MediaInventory } from "./artifacts.ts";
import type { CreativeBrief, CreativeCandidate, CreativeFinding } from "./creative-contract.ts";

export type EvidenceNode = {
  id: string;
  kind: "source" | "fact" | "asset" | "visitor_need" | "hypothesis" | "candidate" | "finding" | "render" | "decision" | "section";
  label: string;
  sourcePath: string;
  sourceHash: string;
  excerpt?: string;
  provenance: "customer" | "operator" | "derived" | "external_untrusted";
  uncertainty?: string;
};
export type EvidenceEdge = {
  from: string;
  to: string;
  relation: "supports" | "depicts" | "answers" | "expresses" | "implements" | "contradicts" | "supersedes" | "uses" | "evaluates";
  sourcePath: string;
  sourceHash: string;
  uncertainty?: string;
};
export type EvidenceIndex = { schemaVersion: 1; inputHash: string; nodes: EvidenceNode[]; edges: EvidenceEdge[]; unresolvedAliases: string[] };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = <T>(root: string, path: string): T | undefined => existsSync(join(root, path)) ? json<T>(join(root, path)) : undefined;
const source = (root: string, path: string): string => existsSync(join(root, path)) ? sha(readFileSync(join(root, path))) : "";

/** Rebuilds from authoritative site files. Direction: from subject to object, e.g. fact supports need. */
export function buildEvidenceIndex(root: string, creativeRoot?: string): EvidenceIndex {
  const paths = ["onboarding/business.json", "onboarding/media-inventory.json", "onboarding/direction.json", "onboarding/storyboard.json"];
  const inputHash = fingerprint(root, paths);
  const nodes: EvidenceNode[] = [], edges: EvidenceEdge[] = [], aliases: string[] = [];
  const seen = new Set<string>();
  const add = (node: EvidenceNode) => {
    if (seen.has(node.id)) {
      aliases.push(node.id);
      let suffix = 2;
      while (seen.has(`${node.id}~${suffix}`)) suffix++;
      node = { ...node, id: `${node.id}~${suffix}`, uncertainty: `Unresolved alias of ${node.id}; references to the unsuffixed ID are ambiguous` };
    }
    seen.add(node.id); nodes.push(node);
  };
  const business = read<Business>(root, paths[0]!);
  if (business) {
    const hash = source(root, paths[0]!);
    for (const item of business.evidence || []) add({ id: `source:${item.id}`, kind: "source", label: item.source, excerpt: item.excerpt, sourcePath: paths[0]!, sourceHash: hash, provenance: "external_untrusted" });
    for (const fact of business.facts || []) {
      const id = `fact:${fact.id}`;
      add({ id, kind: "fact", label: fact.claim, sourcePath: paths[0]!, sourceHash: hash, provenance: "derived" });
      for (const evidence of fact.evidence || []) edges.push({ from: `source:${evidence}`, to: id, relation: "supports", sourcePath: paths[0]!, sourceHash: hash });
    }
    for (const [i, uncertainty] of (business.uncertainties || []).entries()) add({ id: `need:uncertainty-${i}`, kind: "visitor_need", label: uncertainty.question, sourcePath: paths[0]!, sourceHash: hash, provenance: "derived", uncertainty: uncertainty.blocking ? "blocking" : "open" });
  }
  const media = read<MediaInventory>(root, paths[1]!);
  if (media) {
    const hash = source(root, paths[1]!);
    for (const asset of media.assets || []) {
      add({ id: `asset:${asset.id}`, kind: "asset", label: asset.description, sourcePath: paths[1]!, sourceHash: hash, provenance: asset.origin === "customer" ? "customer" : "external_untrusted", uncertainty: asset.disposition === "unresolved" ? "unresolved disposition" : undefined });
      for (const raw of asset.sources || []) {
        const sourceId = `source:${raw}`;
        if (seen.has(sourceId)) edges.push({ from: sourceId, to: `asset:${asset.id}`, relation: "depicts", sourcePath: paths[1]!, sourceHash: hash, uncertainty: "Source describes this asset; inspect image before treating as proof" });
      }
    }
  }
  const direction = read<{ decisions?: { id: string; choice: string }[] }>(root, paths[2]!);
  if (direction) {
    const hash = source(root, paths[2]!);
    for (const decision of direction.decisions || []) add({ id: `decision:${decision.id}`, kind: "decision", label: decision.choice, sourcePath: paths[2]!, sourceHash: hash, provenance: "derived" });
  }
  const storyboard = read<{ pages?: { path: string; sections?: { id: string; question?: string; message?: string; facts?: string[]; media?: string[]; decisionIds?: string[] }[] }[] }>(root, paths[3]!);
  if (storyboard) {
    const hash = source(root, paths[3]!);
    for (const page of storyboard.pages || []) for (const section of page.sections || []) {
      const id = `section:${page.path}:${section.id}`, need = `need:${page.path}:${section.id}`;
      add({ id, kind: "section", label: section.message || section.id, sourcePath: paths[3]!, sourceHash: hash, provenance: "derived" });
      if (section.question) {
        add({ id: need, kind: "visitor_need", label: section.question, sourcePath: paths[3]!, sourceHash: hash, provenance: "derived" });
        edges.push({ from: id, to: need, relation: "answers", sourcePath: paths[3]!, sourceHash: hash });
      }
      for (const fact of section.facts || []) edges.push({ from: `fact:${fact}`, to: id, relation: "supports", sourcePath: paths[3]!, sourceHash: hash });
      for (const asset of section.media || []) edges.push({ from: id, to: `asset:${asset}`, relation: "uses", sourcePath: paths[3]!, sourceHash: hash });
      for (const decision of section.decisionIds || []) edges.push({ from: id, to: `decision:${decision}`, relation: "implements", sourcePath: paths[3]!, sourceHash: hash });
    }
  }
  if (creativeRoot) {
    const briefPath = join(creativeRoot, "brief.json"), conceptsPath = join(creativeRoot, "candidates.json"), findingsPath = join(creativeRoot, "findings.json");
    const brief = existsSync(briefPath) ? json<CreativeBrief>(briefPath) : undefined;
    const briefHash = existsSync(briefPath) ? sha(readFileSync(briefPath)) : "";
    for (const [i, link] of (brief?.links || []).entries()) {
      const need = `need:creative-${i}`, hypothesis = `hypothesis:creative-${i}`;
      add({ id: need, kind: "visitor_need", label: link.visitorTask, sourcePath: briefPath, sourceHash: briefHash, provenance: "derived" });
      add({ id: hypothesis, kind: "hypothesis", label: link.hypothesis, sourcePath: briefPath, sourceHash: briefHash, provenance: "derived", uncertainty: "unmeasured" });
      edges.push({ from: hypothesis, to: need, relation: "answers", sourcePath: briefPath, sourceHash: briefHash });
      for (const evidence of link.evidenceIds) edges.push({ from: evidence, to: hypothesis, relation: "supports", sourcePath: briefPath, sourceHash: briefHash });
    }
    const candidates = existsSync(conceptsPath) ? json<CreativeCandidate[]>(conceptsPath) : [];
    const conceptsHash = existsSync(conceptsPath) ? sha(readFileSync(conceptsPath)) : "";
    for (const candidate of candidates) {
      const id = `candidate:${candidate.id}`;
      add({ id, kind: "candidate", label: candidate.centralIdea, sourcePath: conceptsPath, sourceHash: conceptsHash, provenance: "derived", uncertainty: "design hypothesis" });
      for (const evidence of candidate.evidenceIds) edges.push({ from: evidence, to: id, relation: "supports", sourcePath: conceptsPath, sourceHash: conceptsHash });
      const child = join(creativeRoot, "candidates", candidate.id);
      if (existsSync(join(child, "onboarding/storyboard.json"))) {
        const childIndex = buildEvidenceIndex(child);
        const local = childIndex.nodes.filter(n => ["section", "decision", "visitor_need"].includes(n.kind));
        const ids = new Map(local.map(n => [n.id, `${id}:${n.id}`]));
        const childPath = (path: string) => relative(root, join(child, path)).replaceAll("\\", "/");
        for (const node of local) {
          const namespaced = ids.get(node.id)!;
          add({ ...node, id: namespaced, sourcePath: childPath(node.sourcePath) });
          if (node.kind === "section") edges.push({ from: namespaced, to: id, relation: "implements", sourcePath: childPath(node.sourcePath), sourceHash: node.sourceHash });
        }
        for (const edge of childIndex.edges) {
          if (!ids.has(edge.from) && !ids.has(edge.to)) continue;
          const from = ids.get(edge.from) || edge.from, to = ids.get(edge.to) || edge.to;
          if (seen.has(from) && seen.has(to)) edges.push({ ...edge, from, to, sourcePath: childPath(edge.sourcePath) });
        }
      }
    }
    const findings = existsSync(findingsPath) ? json<CreativeFinding[]>(findingsPath) : [];
    const findingsHash = existsSync(findingsPath) ? sha(readFileSync(findingsPath)) : "";
    for (const [i, finding] of findings.entries()) {
      const id = `finding:${i}`;
      add({ id, kind: "finding", label: finding.observation, sourcePath: findingsPath, sourceHash: findingsHash, provenance: "derived", uncertainty: finding.source === "measured" ? undefined : "self-review" });
      edges.push({ from: id, to: `candidate:${finding.candidateId}`, relation: "evaluates", sourcePath: findingsPath, sourceHash: findingsHash });
    }
    const renderDirs = [join(creativeRoot, "study-renders"), ...candidates.flatMap(candidate => ["representative-browser", "browser"].map(stage => join(creativeRoot, "candidates", candidate.id, "agent/screenshots", stage)))];
    for (const renderDir of renderDirs) for (const full of files(renderDir).filter(path => path.toLowerCase().endsWith(".png"))) {
      const path = relative(root, full).replaceAll("\\", "/");
      add({ id: `render:${path}`, kind: "render", label: basename(full), sourcePath: path, sourceHash: sha(readFileSync(full)), provenance: "derived" });
      const owner = candidates.find(c => path.includes(`/candidates/${c.id}/`));
      if (owner) edges.push({ from: `render:${path}`, to: `candidate:${owner.id}`, relation: "depicts", sourcePath: path, sourceHash: sha(readFileSync(full)) });
    }
    for (const [i, finding] of findings.entries()) for (const evidence of finding.evidenceIds || []) if (seen.has(evidence)) edges.push({ from: evidence, to: `finding:${i}`, relation: "supports", sourcePath: findingsPath, sourceHash: findingsHash });
  }
  return { schemaVersion: 1, inputHash: sha(JSON.stringify({ inputHash, nodes, edges })), nodes, edges, unresolvedAliases: aliases };
}

export function writeEvidenceIndex(root: string, outputPath: string, creativeRoot?: string): EvidenceIndex {
  const index = buildEvidenceIndex(root, creativeRoot);
  save(outputPath, index);
  return index;
}
export function connectedEvidence(index: EvidenceIndex, id: string, depth = 1): { nodes: EvidenceNode[]; edges: EvidenceEdge[] } {
  if (!Number.isSafeInteger(depth) || depth < 0 || depth > 8) throw new Error("Evidence depth must be an integer from 0 to 8");
  const reached = new Set([id]);
  let frontier = new Set([id]);
  for (let i = 0; i < depth && frontier.size; i++) {
    const next = new Set<string>();
    for (const edge of index.edges) {
      if (frontier.has(edge.from) && !reached.has(edge.to)) next.add(edge.to);
      if (frontier.has(edge.to) && !reached.has(edge.from)) next.add(edge.from);
    }
    for (const item of next) reached.add(item);
    frontier = next;
  }
  return { nodes: index.nodes.filter(node => reached.has(node.id)).sort((a,b) => a.id.localeCompare(b.id)), edges: index.edges.filter(edge => reached.has(edge.from) && reached.has(edge.to)).sort((a,b) => `${a.from}:${a.relation}:${a.to}`.localeCompare(`${b.from}:${b.relation}:${b.to}`)) };
}

/** Rank an objective's seeds and their bounded neighborhoods. Preserve provenance in the packet. */
export function retrieveCreativeEvidence(index: EvidenceIndex, opts: { query: string; seedIds?: string[]; maxNodes?: number; maxChars?: number; depth?: number }) {
  const maxNodes = opts.maxNodes ?? 32, maxChars = opts.maxChars ?? 9000;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || !Number.isSafeInteger(maxChars) || maxChars < 1) throw new Error("Invalid evidence packet bounds");
  const words = [...new Set(opts.query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();
  for (const node of index.nodes) {
    const text = `${node.label} ${node.excerpt || ""}`.toLowerCase();
    const score = words.reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0);
    if (score) { scores.set(node.id, score); reasons.set(node.id, "objective terms"); }
  }
  const seeds = [...new Set(opts.seedIds || [])];
  for (const seed of seeds) { scores.set(seed, 100); reasons.set(seed, "explicit objective evidence"); }
  const roots = [...seeds, ...[...scores.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([id]) => id)];
  for (const seed of roots) for (const node of connectedEvidence(index, seed, opts.depth ?? 2).nodes) {
    if (!scores.has(node.id)) { scores.set(node.id, 2); reasons.set(node.id, `connected to ${seed}`); }
  }
  const sorted = [...index.nodes].sort((a,b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0) || a.id.localeCompare(b.id));
  const nodes: EvidenceNode[] = [];
  let chars = 0;
  for (const node of sorted) {
    const size = JSON.stringify(node).length;
    if (nodes.length >= maxNodes || chars + size > maxChars) continue;
    nodes.push(node); chars += size;
  }
  const ids = new Set(nodes.map(n => n.id));
  return { nodes, omitted: index.nodes.length - nodes.length, chars, reasons: Object.fromEntries(nodes.map(n => [n.id, reasons.get(n.id) || "fallback context"])), edges: index.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
}
export function proofForSection(index: EvidenceIndex, sectionId: string): EvidenceNode[] {
  const facts = index.edges.filter(edge => edge.to === sectionId && edge.relation === "supports").map(edge => edge.from);
  const sources = index.edges.filter(edge => facts.includes(edge.to) && edge.relation === "supports").map(edge => edge.from);
  return index.nodes.filter(node => [...facts, ...sources].includes(node.id));
}
export function imagesForSection(index: EvidenceIndex, sectionId: string): EvidenceNode[] {
  const assets = index.edges.filter(edge => edge.from === sectionId && edge.relation === "uses").map(edge => edge.to);
  return index.nodes.filter(node => assets.includes(node.id) && node.kind === "asset");
}
export function sectionsAffectedByDecision(index: EvidenceIndex, decisionId: string): EvidenceNode[] {
  const sections = index.edges.filter(edge => edge.to === decisionId && edge.relation === "implements").map(edge => edge.from);
  return index.nodes.filter(node => sections.includes(node.id) && node.kind === "section");
}

/** A storyboard answer is an intent; this flags answers without source-backed facts. */
export function visitorQuestionsWithoutProof(index: EvidenceIndex): { sectionId: string; questionId: string; question: string }[] {
  const byId = new Map(index.nodes.map(node => [node.id, node]));
  return index.edges.filter(edge => edge.relation === "answers" && byId.get(edge.from)?.kind === "section" && byId.get(edge.to)?.kind === "visitor_need")
    .filter(edge => !proofForSection(index, edge.from).some(node => node.kind === "source"))
    .map(edge => ({ sectionId: edge.from, questionId: edge.to, question: byId.get(edge.to)!.label }));
}
