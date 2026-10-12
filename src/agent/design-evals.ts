import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { json, save, type UsageReceipt } from "./artifacts.ts";

export const EVAL_OVERALL = ["A", "B", "tie", "neither"] as const;
export type EvalOverall = (typeof EVAL_OVERALL)[number];
export const EVAL_ELEMENTS = ["business-specificity", "composition", "typography", "media", "copy", "mobile"] as const;
export type EvalElement = (typeof EVAL_ELEMENTS)[number];

export type DesignEvalCase = {
  schemaVersion: 1;
  caseId: string;
  version: string;
  business: string;
  holdout: boolean;
  sourceRevision?: string;
  workflowRevision?: string;
  authorModel?: string;
  reviewerModel?: string;
  theme?: string;
  notes: string;
  fixtures?: string[];
  operatorLabels: {
    overallSet?: "rejected" | "accepted" | "unlabeled";
    setNote?: string;
    pairs: DesignEvalPairLabel[];
  };
};

export type DesignEvalPairLabel = {
  pairId: string;
  left: string;
  right: string;
  overall: EvalOverall | "";
  elements: Partial<Record<EvalElement, EvalOverall | "">>;
  note?: string;
  labeledBy?: string;
  holdout?: boolean;
};

export type WeakFixtureKind =
  | "attractive-generic"
  | "diverse-poor"
  | "good-desktop-poor-mobile"
  | "missing-original-media"
  | "unsupported-copy"
  | "strong-fit-restrained";

export type WeakFixture = {
  id: string;
  kind: WeakFixtureKind;
  expectedQuality: "fail";
  diversityMayPass: boolean;
  note: string;
};

export const WEAK_FIXTURES: WeakFixture[] = [
  { id: "attractive-generic", kind: "attractive-generic", expectedQuality: "fail", diversityMayPass: true, note: "Polished interchangeable layout with no evidenced offer." },
  { id: "diverse-poor", kind: "diverse-poor", expectedQuality: "fail", diversityMayPass: true, note: "Five distinct looks that all miss composition and media craft." },
  { id: "good-desktop-poor-mobile", kind: "good-desktop-poor-mobile", expectedQuality: "fail", diversityMayPass: true, note: "Desktop hierarchy collapses into an uncomposed stack on phone." },
  { id: "missing-original-media", kind: "missing-original-media", expectedQuality: "fail", diversityMayPass: true, note: "Important retained source assets absent from the first screen." },
  { id: "unsupported-copy", kind: "unsupported-copy", expectedQuality: "fail", diversityMayPass: true, note: "Attractive headlines that invent proof." },
  { id: "strong-fit-restrained", kind: "strong-fit-restrained", expectedQuality: "fail", diversityMayPass: false, note: "Used as a contrast fixture: strong business fit with restrained visuals should not be auto-failed for lacking decoration; critic still needs evidence. Default expectation in harness is fail until an operator labels it." },
];

export function evalCasesDir(kernel: string): string {
  return join(resolve(kernel), "design-system/evals");
}

export function anonymousPairOrder(left: string, right: string, seed: string): { A: string; B: string } {
  const hex = createHash("sha256").update(seed + left + right).digest();
  return hex[0]! % 2 ? { A: left, B: right } : { A: right, B: left };
}

export function missingLabelState(pair: DesignEvalPairLabel): "missing-overall" | "missing-elements" | "labeled" | "partial" {
  const overall = pair.overall && EVAL_OVERALL.includes(pair.overall as EvalOverall);
  const elementValues = EVAL_ELEMENTS.map(el => pair.elements[el]);
  const labeledElements = elementValues.filter(v => v && EVAL_OVERALL.includes(v as EvalOverall)).length;
  if (!overall && labeledElements === 0) return "missing-overall";
  if (overall && labeledElements === EVAL_ELEMENTS.length) return "labeled";
  if (!overall) return "missing-overall";
  if (labeledElements === 0) return "missing-elements";
  return "partial";
}

export function recordSetLevelRejection(opts: {
  kernel: string;
  caseId: string;
  note: string;
  dest?: string;
}): DesignEvalCase {
  const dir = opts.dest || join(evalCasesDir(opts.kernel), opts.caseId);
  mkdirSync(dir, { recursive: true });
  const existingPath = join(dir, "case.json");
  const existing = existsSync(existingPath) ? json<DesignEvalCase>(existingPath) : undefined;
  const recorded: DesignEvalCase = existing || {
    schemaVersion: 1,
    caseId: opts.caseId,
    version: "1",
    business: "Unspecified business",
    holdout: false,
    notes: "Recorded set-level feedback. Pairwise labels require separate observations.",
    operatorLabels: { overallSet: "unlabeled", pairs: [] },
  };
  recorded.operatorLabels.overallSet = "rejected";
  recorded.operatorLabels.setNote = opts.note;
  save(existingPath, recorded);
  return recorded;
}

export function createPairwiseSession(opts: {
  dest: string;
  caseId: string;
  versions: { id: string; label: string }[];
  seed?: string;
}): { pairs: { pairId: string; A: string; B: string; leftId: string; rightId: string }[]; labelsPath: string } {
  if (existsSync(join(opts.dest, "session.json"))) throw new Error("Evaluation session already exists");
  mkdirSync(opts.dest, { recursive: true });
  const seed = opts.seed || String(randomInt(1e9));
  const pairs: { pairId: string; A: string; B: string; leftId: string; rightId: string }[] = [];
  for (let i = 0; i < opts.versions.length; i++) {
    for (let j = i + 1; j < opts.versions.length; j++) {
      const left = opts.versions[i]!;
      const right = opts.versions[j]!;
      const order = anonymousPairOrder(left.id, right.id, seed + i + ":" + j);
      pairs.push({ pairId: `pair-${pairs.length + 1}`, A: order.A, B: order.B, leftId: left.id, rightId: right.id });
    }
  }
  const labels: DesignEvalPairLabel[] = pairs.map(pair => ({
    pairId: pair.pairId,
    left: pair.A,
    right: pair.B,
    overall: "",
    elements: Object.fromEntries(EVAL_ELEMENTS.map(el => [el, ""])) as DesignEvalPairLabel["elements"],
  }));
  save(join(opts.dest, "session.json"), { schemaVersion: 1, caseId: opts.caseId, seed, anonymous: true, pairs });
  save(join(opts.dest, "labels.json"), { schemaVersion: 1, overallSet: "", pairs: labels });
  writeFileSync(join(opts.dest, "README.txt"), [
    "Anonymous randomized pairs. Labels are independent: overall preference is not an element rank.",
    "Use A, B, tie, or neither. Do not infer A-E ranks from a set-level rejection.",
    "Holdout cases are marked in case.json and must not be used for prompt tuning.",
    "",
  ].join("\n"));
  return { pairs, labelsPath: join(opts.dest, "labels.json") };
}

export function labelStatus(labels: { overallSet?: string; pairs: DesignEvalPairLabel[] }): { missing: string[]; labeled: number } {
  const missing: string[] = [];
  if (!labels.overallSet || labels.overallSet === "unlabeled" || labels.overallSet === "") missing.push("set-level overall");
  let labeled = 0;
  for (const pair of labels.pairs) {
    const state = missingLabelState(pair);
    if (state === "labeled") labeled += 1;
    else missing.push(`${pair.pairId}:${state}`);
  }
  return { missing, labeled };
}

export function refuseManufacturedRanks(caseFile: DesignEvalCase): string[] {
  const errors: string[] = [];
  if (caseFile.operatorLabels.overallSet === "rejected") {
    for (const pair of caseFile.operatorLabels.pairs) {
      if (pair.overall && pair.labeledBy === "inferred-from-set-rejection") {
        errors.push("Refusing manufactured pairwise labels inferred from a set-level rejection");
      }
    }
  }
  return errors;
}

export function listEvalCases(kernel: string): string[] {
  const dir = evalCasesDir(kernel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => existsSync(join(dir, name, "case.json"))).sort();
}
