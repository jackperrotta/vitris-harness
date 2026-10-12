const routeKey = (url: URL): string => `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
function decode(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", colon: ":", sol: "/" };
  return value.replace(/&#(x[0-9a-f]+|[0-9]+);?|&(amp|quot|apos|colon|sol);/gi, (whole: string, numeric?: string, name?: string) => {
    if (numeric) {
      const n = numeric[0]!.toLowerCase() === "x" ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return named[name!.toLowerCase()] ?? whole;
  });
}

/** Check rendered navigation/service attributes, excluding inert script/style text. */
export function legacyDependencies(html: string, routes: readonly { source: string }[]): string[] {
  const migrated = new Map(routes.map(r => [routeKey(new URL(r.source)), r]));
  const stripped = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const failures = new Set<string>();
  const attributes: Record<string, string> = { a: "href", area: "href", iframe: "src", form: "action" };
  for (const tag of stripped.matchAll(/<(a|area|iframe|form)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attribute = attributes[tag[1]!.toLowerCase()]!;
    const match = tag[0].match(new RegExp(`\\s${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const href = decode(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
    if (!/^(?:https?:)?\/\//i.test(href)) continue;
    for (const scheme of href.startsWith("//") ? ["https:", "http:"] : [""]) {
      let url: URL; try { url = new URL(scheme + href); } catch { continue; }
      const route = migrated.get(routeKey(url));
      if (route) failures.add(`Legacy-origin dependency: ${href} points to migrated route ${route.source}. Use a local route for navigation or a durable independent service destination; an old-site handoff cannot prove booking or form behavior.`);
    }
  }
  return [...failures];
}
