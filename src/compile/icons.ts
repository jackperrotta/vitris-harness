import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { renderIcon } from '../icons/index.ts';
import type { IconVariant } from '../icons/index.ts';

type Node = DefaultTreeAdapterMap['node'];
const allowed = new Set(['name', 'variant', 'class', 'id', 'width', 'height', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden']);

/** Replace only source spans of real icon elements; preserve all surrounding HTML. */
export function compileIcons(html: string, route = '/'): string {
  if (!/<vitris-icon[\s/>]/i.test(html)) return html;
  const edits: { start: number; end: number; svg: string }[] = [];
  function walk(node: Node) {
    if ('tagName' in node && node.tagName === 'vitris-icon') {
      try {
        const loc = node.sourceCodeLocation;
        if (!loc?.startTag || !loc.endTag) throw new Error('Use paired <vitris-icon name="…"></vitris-icon> tags; self-closing and unclosed tags are not supported in HTML.');
        if (node.childNodes.some(child => !('nodeName' in child && child.nodeName === '#text' && 'value' in child && !child.value.trim()))) throw new Error('Vitris icon tags must be empty. Put text labels outside the icon.');
        const attrs = Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]));
        for (const attr of node.attrs) if (attr.namespace || (!allowed.has(attr.name) && !/^data-[a-z][a-z0-9-]*$/.test(attr.name))) throw new Error(`Unsupported Vitris icon attribute: ${attr.name}`);
        if (!attrs.name) throw new Error('Vitris icon requires a name.');
        if (attrs['aria-hidden'] !== undefined && attrs['aria-hidden'] !== 'true') throw new Error('Use aria-label or aria-labelledby for meaningful icons; aria-hidden can only be true.');
        if (attrs['aria-hidden'] && (attrs['aria-label'] || attrs['aria-labelledby'])) throw new Error('A hidden Vitris icon cannot also have an accessible name.');
        if (attrs['aria-describedby'] && !(attrs['aria-label'] || attrs['aria-labelledby'])) throw new Error('A described Vitris icon needs an accessible name.');
        for (const key of ['aria-label', 'aria-labelledby']) if (attrs[key] !== undefined && !attrs[key]!.trim()) throw new Error(`Vitris icon ${key} must not be empty.`);
        edits.push({ start: loc.startOffset, end: loc.endOffset, svg: renderIcon(attrs.name, {
          variant: attrs.variant as IconVariant | undefined, className: attrs.class, id: attrs.id,
          width: attrs.width, height: attrs.height, label: attrs['aria-label'], labelledby: attrs['aria-labelledby'], describedby: attrs['aria-describedby'],
          data: Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))),
        }) });
      } catch (error) {
        throw new Error(`Icon error on ${route}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if ('childNodes' in node) for (const child of node.childNodes) walk(child);
    if ('tagName' in node && node.tagName === 'template' && 'content' in node) walk(node.content);
  }
  walk(parseFragment(html, { sourceCodeLocationInfo: true }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.svg + html.slice(edit.end);
  return html;
}
