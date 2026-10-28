import { parseFragment } from "parse5";

export function hasRefinementPlaceholder(html: string): boolean {
  const token = /\[TODO\b|\[INSERT\b|\[TBD\b|\bundefined\b|\bNaN\b/i;
  type Node = { nodeName: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[]; content?: Node };
  const contains = (node: Node): boolean => {
    if (["script", "style", "#comment"].includes(node.nodeName)) return false;
    if (node.nodeName === "#text" && token.test(node.value || "")) return true;
    if (node.attrs?.some(attr => !/^on/i.test(attr.name) && attr.name !== "style" && token.test(attr.value))) return true;
    return (node.childNodes || []).some(contains) || !!(node.content && contains(node.content));
  };
  return contains(parseFragment(html) as Node);
}

/** Load laid-out lazy images in the isolated verification page before judging them. */
export async function settleRefinementImages(page: { evaluate: (expression: string) => Promise<unknown> }, timeoutMs = 5000): Promise<void> {
  await page.evaluate(`(async () => {
    let timer;
    try {
      await Promise.race([
        Promise.all([...document.images].filter(image => image.getClientRects().length).map(image => {
          image.loading = 'eager';
          return image.decode().catch(() => {});
        })),
        new Promise(resolve => { timer = setTimeout(resolve, ${Math.max(0, timeoutMs)}); })
      ]);
    } finally { clearTimeout(timer); }
  })()`);
}
