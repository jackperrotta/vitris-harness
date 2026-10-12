import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { json } from "../artifacts.ts";

/**
 * Local brand and craft preference rubric utilities.
 *
 * NOTE: These rubrics provide local keyword/heuristic scoring rules.
 * They are local algorithmic helpers, NOT evaluated TypeSafe/Jev neural model rubrics or Choice/Score model inference endpoints.
 * Demonstrated token savings, cross-stage consistency, focused critic context, typed coverage partitions, and remote preference scoring remain pending.
 */

export interface PreferenceCriterion {
  id: string;
  name: string;
  weight: number; // e.g. 1.0
  positiveSignals: string[];
  negativeAntiPatterns: string[];
}

export interface PreferenceRubric {
  version: number;
  rubricId: string;
  name: string;
  description: string;
  criteria: PreferenceCriterion[];
}

export interface CriterionMatchScore {
  score: number;
  weight: number;
  positivesMatched: string[];
  antiPatternsMatched: string[];
}

export interface PreferenceMatchResult {
  rubricId: string;
  overallScore: number; // 0 to 1
  matchedSignals: string[];
  matchedAntiPatterns: string[];
  criterionScores: Record<string, CriterionMatchScore>;
  acceptable: boolean;
}

export const DEFAULT_BRAND_PREFERENCE_RUBRIC: PreferenceRubric = {
  version: 1,
  rubricId: "brand_authenticity_v1",
  name: "Brand Authenticity & Craft Rubric",
  description: "Evaluates visual directions and copy against authenticity and craftsmanship expectations",
  criteria: [
    {
      id: "vernacular_grounding",
      name: "Vernacular Grounding",
      weight: 1.5,
      positiveSignals: ["heritage", "stone", "masonry", "cotswold", "traditional", "craft", "restoration", "conservation"],
      negativeAntiPatterns: ["modern turnkey", "saas", "crypto", "instant booking", "ai-powered"],
    },
    {
      id: "clarity_and_honesty",
      name: "Clarity & Honesty",
      weight: 1.0,
      positiveSignals: ["guarantee", "insured", "direct quote", "inspection", "transparent", "family-owned"],
      negativeAntiPatterns: ["free trial", "no credit card required", "limited time offer", "100% risk free discount"],
    },
    {
      id: "typographic_restraint",
      name: "Typographic Restraint",
      weight: 1.0,
      positiveSignals: ["serif", "editorial", "restrained", "balanced", "warm", "humanist"],
      negativeAntiPatterns: ["neon", "cyberpunk", "overly saturated", "rainbow gradient"],
    },
  ],
};

export function defaultPreferencesPath(root: string): string {
  return join(root, "onboarding/preferences.json");
}

export function loadPreferences(root: string, customPath?: string): PreferenceRubric {
  const targetPath = customPath || defaultPreferencesPath(root);
  if (existsSync(targetPath)) {
    try {
      const parsed = json<PreferenceRubric>(targetPath);
      if (parsed.rubricId && Array.isArray(parsed.criteria)) {
        return parsed;
      }
    } catch {}
  }
  return DEFAULT_BRAND_PREFERENCE_RUBRIC;
}

export function savePreferences(root: string, rubric: PreferenceRubric, customPath?: string): void {
  const targetPath = customPath || defaultPreferencesPath(root);
  const dir = join(targetPath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(targetPath, JSON.stringify(rubric, null, 2), "utf8");
}

export function matchPreferences(
  rubric: PreferenceRubric,
  contentOrSpecification: string,
  minAcceptableScore = 0.60
): PreferenceMatchResult {
  const text = contentOrSpecification.toLowerCase();
  const allMatchedSignals: string[] = [];
  const allMatchedAntiPatterns: string[] = [];
  const criterionScores: Record<string, CriterionMatchScore> = {};

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const criterion of rubric.criteria) {
    const weight = criterion.weight || 1.0;
    totalWeight += weight;

    const positivesMatched: string[] = [];
    const antiPatternsMatched: string[] = [];

    for (const signal of criterion.positiveSignals) {
      if (text.includes(signal.toLowerCase())) {
        positivesMatched.push(signal);
        allMatchedSignals.push(signal);
      }
    }

    for (const anti of criterion.negativeAntiPatterns) {
      if (text.includes(anti.toLowerCase())) {
        antiPatternsMatched.push(anti);
        allMatchedAntiPatterns.push(anti);
      }
    }

    const posFraction = criterion.positiveSignals.length > 0 ? positivesMatched.length / criterion.positiveSignals.length : 0;
    const negFraction = criterion.negativeAntiPatterns.length > 0 ? antiPatternsMatched.length / criterion.negativeAntiPatterns.length : 0;

    let score = 0.5 + (posFraction * 0.5) - (negFraction * 0.5);
    score = Math.max(0.0, Math.min(1.0, parseFloat(score.toFixed(3))));

    criterionScores[criterion.id] = {
      score,
      weight,
      positivesMatched,
      antiPatternsMatched,
    };

    totalWeightedScore += score * weight;
  }

  const overallScore = totalWeight > 0 ? parseFloat((totalWeightedScore / totalWeight).toFixed(3)) : 0.5;
  const acceptable = overallScore >= minAcceptableScore && allMatchedAntiPatterns.length === 0;

  return {
    rubricId: rubric.rubricId,
    overallScore,
    matchedSignals: allMatchedSignals,
    matchedAntiPatterns: allMatchedAntiPatterns,
    criterionScores,
    acceptable,
  };
}