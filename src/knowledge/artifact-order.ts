// Compare normalized artifact paths by Unicode code point, independent of locale.
export function compareArtifactPaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
