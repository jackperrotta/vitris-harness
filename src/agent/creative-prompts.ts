/** Design reasoning is staged inside the same active agent, without extra model calls. */
export const CREATIVE_PLANNING_METHOD = `
Creative exploration method:
1. Identify the business tension: what the visitor needs to understand, believe or accomplish, what currently prevents it, and what this business can genuinely prove. Turn that into objective -> visitor task -> supported evidence -> experience hypothesis -> observable outcome. When proof is missing, design honestly around the gap.
2. Start each concept from a different organizing idea grounded in that tension. Possibilities include an artifact-led explanation, guided decision, editorial narrative, spatial/product exploration or service process. These are prompts for invention, not templates or required styles. Explain why the idea belongs to this business.
3. Make the concepts differ in information hierarchy, narrative and composition before choosing colors. Typography, imagery, crop, spacing, motion and interaction should reinforce each concept. A palette swap or a renamed split hero is insufficient. In sparse-media cases, expressive typography, diagrams of supported processes and useful content can supply character; invented customer proof cannot.
4. Sketch both the homepage and one consequential interior at once. Use plausible final-length copy derived from approved facts and real assets. Show a primary action, a proof moment and a mobile treatment. Make the interior develop the idea instead of repeating the homepage hero.
5. Ask the counterfactual: if the logo and business name changed, would the site still fit almost any competitor? Identify the business-specific content, composition or interaction that prevents this. Avoid visual novelty that hides navigation, reduces legibility or obstructs the visitor task.
6. Before submitting, compare the concepts by central idea, visitor journey, proof structure, composition, imagery and mobile behavior. Check the actual studies for those differences. Preserve the alternatives for review; do not silently converge them to one preferred template.
Keep exploration bounded. Build two inexpensive studies by default; use a third only for a materially different unresolved hypothesis. The production candidate is developed after pixel-based comparison.
`;

export const CREATIVE_CRITIQUE_METHOD = `
Use these reasoning passes sequentially in this active session; they are roles, not additional agents:
- Visitor: attempt the brief's actual tasks from the rendered pages. Locate the offer, differentiation, relevant proof and next step. Note where effort, ambiguity or unnecessary interaction gets in the way.
- Art director: inspect hierarchy, type, image treatment, rhythm, density, transitions, spatial relationships and interior coherence at phone and desktop widths. Identify what makes the result specific and memorable. Do not equate added decoration with creativity.
- Skeptic: challenge the strongest conclusion. Identify unsupported claims, weak proof, a plausible stronger alternative, compromised mobile behavior or a repeated template pattern. A technical pass does not establish creative quality.
- Editor: select the one to three highest-impact findings. For each, distinguish visible observation from causal hypothesis and expected improvement. Locate the page, viewport, state and section; cite the actual render ID. A screenshot supports visible claims, not unperformed interactions or conversion lift.
Evaluate business fit, distinctive idea, visual craft, task clarity, responsive behavior and factual credibility separately. Do not average away a blocking defect. Do not invent human preference labels or precise performance scores.
Prefer a focused joint revision when the central idea is promising but copy, media and composition do not yet work together. Retire a disproven organizing idea. Request a challenger only when the uncertainty is material enough to justify its production cost. Select a qualified result when further exploration has low expected value, then preserve its strongest identity choices during expansion.
Review prior findings and revision results before proposing another change. Explain whether the previous acceptance observations were achieved and avoid repeating an ineffective intervention. Budget pressure limits exploration; it cannot convert a known blocker into a pass.
`;

export const CREATIVE_REVISION_METHOD = `
Creative revision method:
- Start from each located finding, the attempted fix history, and its observable acceptance condition. Preserve the selected concept's strongest identity decisions.
- Change copy, media placement and composition together where they depend on one another. Name the affected routes and source files. Shared styles or components require review across all routes.
- Re-render and check the actual outcome; a source edit or passing technical check alone does not establish visual improvement. Keep unresolved risks explicit.
`;

export const CREATIVE_FINAL_AUDIT_METHOD = `
Final creative audit method:
- Inspect the full rendered site at phone and desktop widths, including consequential interiors. Check identity, visual craft, factual credibility, responsive behavior and every declared visitor task separately.
- Attempt supported actions. Distinguish an observed usable CTA from an unverified backend integration or an unmeasured conversion result.
- Locate consequential blockers with current render evidence. Preserve strengths during a focused repair and repeat final whole-site verification.
`;

/** One authoritative method per creative role, shared by ordinary and efficiency packets. */
export function creativeMethod(role: "plan" | "study-review" | "decision" | "revision" | "final-review"): string {
  if (role === "plan") return CREATIVE_PLANNING_METHOD;
  if (role === "revision") return CREATIVE_REVISION_METHOD;
  if (role === "final-review") return `${CREATIVE_CRITIQUE_METHOD}\n${CREATIVE_FINAL_AUDIT_METHOD}`;
  return CREATIVE_CRITIQUE_METHOD;
}
