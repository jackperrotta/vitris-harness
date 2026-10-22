/** Agent visual review of the core industry masters. No human preference labels.
 * Hashes bind each review to its geometry; tests reject stale review metadata.
 * Updating geometry requires a fresh rendered review, never an automatic re-stamp.
 */
import data from './industry-review-v4.json' with { type: 'json' };
export type IndustryIconReview = {
  version: number;
  decision: 'redrawn' | 'retained';
  geometrySha256: string;
  minSize: 16 | 24 | 32;
  compactAlternative: string | null;
  note: string;
};
export const industryIconReviews: Readonly<Record<string, IndustryIconReview>> = Object.freeze(
  Object.fromEntries(Object.entries(data).map(([name, review]) => [name, Object.freeze(review as IndustryIconReview)])),
);
export const INDUSTRY_REVIEW_VERSION = 4;
export const industryReviewCount = Object.keys(industryIconReviews).length;
