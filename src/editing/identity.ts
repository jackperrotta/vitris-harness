export type HtmlAttribute = { name: string; value: string };

export function attribute(attrs: HtmlAttribute[] | undefined, name: string): string | undefined {
  return attrs?.find(item => item.name === name)?.value;
}

/** One identity rule for the manifest, source edit, and rendered outcome. */
export function elementMatchesIdentity(attrs: HtmlAttribute[] | undefined, identity: string): boolean {
  return attribute(attrs, "data-vitris-field") === identity || attribute(attrs, "id") === identity;
}
