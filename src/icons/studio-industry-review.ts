/** Deliberate agent review of these forty studio masters, not human approval.
 * Geometry hashes are checked in tests. Do not re-stamp a changed master without
 * inspecting new renderings in its family and recording a fresh review.
 */
import data from './studio-industry-review-v5.json' with { type: 'json' };
import type { StudioVariant } from './studio.ts';
export type IndustryStudioReview = {
  version:number;
  rationale:string;
  note:string;
  minSizes:Readonly<Record<StudioVariant,number>>;
  geometrySha256:Readonly<Record<StudioVariant,string>>;
};
export const industryStudioReviews:Readonly<Record<string,IndustryStudioReview>> = Object.freeze(Object.fromEntries(
  Object.entries(data).map(([name,review])=>[name,Object.freeze({...review,minSizes:Object.freeze(review.minSizes),geometrySha256:Object.freeze(review.geometrySha256)})]),
));
