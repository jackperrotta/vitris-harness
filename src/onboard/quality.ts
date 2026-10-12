/** Reject rendered error documents even when the host reports HTTP 200. */
export function isErrorPage(page: { title: string; headings?: string[]; outline?: string[] }): boolean {
  return /page not found|404(?:\s+error)?|not found\s*\(/i.test(page.title) ||
    [...(page.headings || []), ...(page.outline || [])].some(h => /^(page not found|404(?: error)?|we (?:could|can) not find (?:the|this) (?:page|product)|we couldn't find (?:the|this) (?:page|product)|(?:the|this) (?:page|product) (?:does not|doesn't) exist)/i.test(h));
}
