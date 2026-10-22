import { escapeAttr } from '../html.ts';
import { getIcon, ICON_VARIANTS, availableIconVariants, searchIcons as searchCatalogIcons } from './catalog.ts';
import type { StudioVariant } from './studio.ts';
import { findIconIndustry, iconsForIndustry } from './coverage.ts';
import { industryIconReviews } from './industry-review.ts';
import { industryStudioReviews } from './studio-industry-review.ts';
import type { IconVariant } from './catalog.ts';
export { icons, iconNames, iconAliases, getIcon, ICON_VERSION, ICON_VARIANTS, BASE_ICON_VARIANTS, availableIconVariants, iconVariantCount } from './catalog.ts';
export { STUDIO_VARIANTS, studioFamilyInfo, studioIconNames, coreStudioIconNames, industryStudioIconNames } from './studio.ts';
export type { IconDefinition, IconVariant } from './catalog.ts';
export { iconIndustries, iconsForIndustry, industriesForIcon, findIconIndustry } from './coverage.ts';
export type { IconIndustry } from './coverage.ts';
export { industryIconReviews, INDUSTRY_REVIEW_VERSION, industryReviewCount } from './industry-review.ts';
export type { IndustryIconReview } from './industry-review.ts';
export { industryStudioReviews } from './studio-industry-review.ts';
export type { IndustryStudioReview } from './studio-industry-review.ts';

/** Build-time selection guidance. Never sent to a published page by renderIcon. */
export function inspectIcon(name: string) {
  const icon = getIcon(name);
  if (!icon) throw new Error(`Unknown Vitris icon "${name}". Use vitris-icons search.`);
  return { name: icon.name, category: icon.category, variants: availableIconVariants(icon.name),
    ...(icon.refinedVersion ? { refinedVersion: icon.refinedVersion } : {}),
    review: industryIconReviews[icon.name] ?? null,
    studioReview: industryStudioReviews[icon.name] ?? null,
    usage: 'Choose by meaning, keep a coherent family and a visible service label. Below the recommended size, use a simpler related symbol with the same text or omit the icon. A compact alternative is broader, not an equivalent replacement. Inspect the actual page at its display size and check both duotone layers against the background.',
  };
}

/** Exact industry aliases also resolve to curated groups (e.g. OB-GYN, SaaS). */
export function searchIcons(query = '', category?: string) {
  const industry = findIconIndustry(query);
  return industry ? iconsForIndustry(industry).filter(icon => !category || icon.category === category) : searchCatalogIcons(query, category);
}

export type IconOptions = {
  variant?: IconVariant;
  /** Decorative by default. Give meaningful images a label, and controls their own label. */
  label?: string;
  labelledby?: string;
  className?: string;
  id?: string;
  width?: string;
  height?: string;
  describedby?: string;
  data?: Record<string, string>;
};

/** Build-time renderer. Never include this module or the catalog in a client island. */
export function renderIcon(name: string, options: IconOptions = {}): string {
  const icon = getIcon(name);
  if (!icon) {
    const suggestions = searchIcons(name.replace(/[-_]/g, ' ')).slice(0, 5).map(i => i.name);
    throw new Error(`Unknown Vitris icon "${name}".${suggestions.length ? ` Try: ${suggestions.join(', ')}.` : ''} Use vitris-icons search or vitris-icons list.`);
  }
  const variant = options.variant ?? 'regular';
  const studio = icon.families?.[variant as StudioVariant];
  const filled = variant === 'solid' || variant === 'duotone' || !!studio;
  if (!(ICON_VARIANTS as readonly string[]).includes(variant)) throw new Error(`Unknown Vitris icon variant "${variant}". Use ${ICON_VARIANTS.join(', ')}.`);
  if (!availableIconVariants(icon.name).includes(variant)) throw new Error(`Vitris icon "${icon.name}" has no authored "${variant}" master. Available: ${availableIconVariants(icon.name).join(', ')}. Choose another icon or an available family.`);
  if (options.label && options.labelledby) throw new Error('Vitris icon accepts either aria-label or aria-labelledby, not both.');
  const attrs: Record<string, string> = {
    xmlns: 'http://www.w3.org/2000/svg',
    class: ['vitris-icon', options.className].filter(Boolean).join(' '),
    'data-vitris-icon': icon.name,
    'data-icon-variant': variant,
    viewBox: '0 0 24 24',
    width: options.width ?? '1em', height: options.height ?? '1em',
    fill: filled ? 'currentColor' : 'none',
    stroke: filled ? 'none' : 'currentColor',
    ...(filled ? {} : { 'stroke-width': variant === 'light' ? '1.2' : '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    focusable: 'false',
  };
  for (const key of ['width', 'height']) if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%)?$/.test(attrs[key]!)) throw new Error(`Invalid Vitris icon ${key}: "${attrs[key]}". Use a positive SVG length.`);
  if (options.id) attrs.id = options.id;
  if (options.label || options.labelledby) {
    attrs.role = 'img';
    if (options.label) attrs['aria-label'] = options.label;
    if (options.labelledby) attrs['aria-labelledby'] = options.labelledby;
    if (options.describedby) attrs['aria-describedby'] = options.describedby;
  } else attrs['aria-hidden'] = 'true';
  for (const [key, value] of Object.entries(options.data ?? {})) {
    if (!/^data-[a-z][a-z0-9-]*$/.test(key) || key === 'data-vitris-icon' || key === 'data-icon-variant') throw new Error(`Unsupported Vitris icon data attribute: ${key}`);
    attrs[key] = value;
  }
  // A consistent optical inset also reserves room for rounded strokes at edges.
  const geometry = studio ?? (variant === 'duotone'
    ? `<g class="vitris-icon__secondary" style="color:var(--icon-secondary-color,currentColor);opacity:var(--icon-secondary-opacity,.35)">${icon.duotone.secondary}</g><g class="vitris-icon__primary" style="color:var(--icon-primary-color,currentColor);opacity:var(--icon-primary-opacity,1)">${icon.duotone.primary}</g>`
    : variant === 'solid' ? icon.solid : icon.outline);
  return `<svg ${Object.entries(attrs).map(([key, value]) => `${key}="${escapeAttr(value)}"`).join(' ')}><g transform="translate(1.2 1.2) scale(.9)">${geometry}</g></svg>`;
}

// Emitted only on pages that contain library icons. Presentation attributes keep
// icons usable without CSS and let site CSS deliberately override their styling.
export const iconCss = '.vitris-icon{display:inline-block;pointer-events:none;vertical-align:-.125em;flex-shrink:0}.btn-arrow:has(.vitris-icon)::after{content:none}';
