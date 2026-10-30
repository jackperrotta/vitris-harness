import type { SiteConfig, ThemeTokens } from './types.ts';

export const TYPE_ROLES = ['display', 'section', 'subheading', 'card-title', 'body', 'ui', 'caption', 'label'] as const;
export type TypeRole = typeof TYPE_ROLES[number];
export type TypeStyle = { size: string; weight: number; lineHeight: string; tracking: string; font: 'body' | 'display' };
export type TypographySystem = {
  roles: Partial<Record<TypeRole, Partial<TypeStyle>>>;
  variants?: Record<string, Partial<TypeStyle> & { role: TypeRole; reason: string }>;
};
export const MINIMUM_TYPE_PX = 12;
export const DEFAULT_TYPE_ROLES: Record<TypeRole, TypeStyle> = {
  display: { size: 'clamp(2.75rem, 1.8rem + 4vw, 5rem)', weight: 600, lineHeight: '1.08', tracking: '-0.03em', font: 'display' },
  section: { size: 'clamp(2rem, 1.5rem + 2vw, 3.5rem)', weight: 600, lineHeight: '1.15', tracking: '-0.025em', font: 'display' },
  subheading: { size: 'clamp(1.5rem, 1.3rem + 0.8vw, 2rem)', weight: 600, lineHeight: '1.25', tracking: '-0.015em', font: 'display' },
  'card-title': { size: '1.5rem', weight: 600, lineHeight: '1.3', tracking: '-0.01em', font: 'display' },
  body: { size: '1.125rem', weight: 400, lineHeight: '1.6', tracking: 'normal', font: 'body' },
  ui: { size: '1rem', weight: 600, lineHeight: '1.5', tracking: 'normal', font: 'body' },
  caption: { size: '0.875rem', weight: 400, lineHeight: '1.5', tracking: 'normal', font: 'body' },
  label: { size: '0.875rem', weight: 600, lineHeight: '1.5', tracking: '0.02em', font: 'body' },
};
export const TYPE_SELECTORS: Record<TypeRole, string[]> = {
  display: ['h1'], section: ['h2', '.stat__value', '.stat--sm .stat__value', '.price__amount'],
  subheading: ['h3', '.card__body > h3'],
  'card-title': ['h4', '.card__body > h4', '.brand', '.quote', '.quote--lg', '.quote--card'],
  body: ['body', '.lede', '.section__head .lede', '.lede--lg', '.list-check li', '.rating'],
  ui: ['h5', 'h6', 'button', 'input', 'select', 'textarea', 'nav a', '.nav-links a', 'summary', '.accordion summary', '.btn', '.btn-outline', '.btn-ghost', '.btn-arrow', '.skip-link', '.c-cookie-banner__title', '.c-cookie-banner__more', '.announcement a'],
  caption: ['small', 'figcaption', 'sub', 'sup', '.stat__label', '.price__period', '.byline', '.quote cite', '.quote footer', '.announcement', '.c-cookie-banner__text'],
  label: ['label', '.eyebrow', '.badge', '.table th', '.chips > legend', '.chips__label', '.chips span'],
};
export function typographyEnabled(site?: Pick<SiteConfig, 'typography'>): boolean {
  if (site?.typography && site.typography.version !== 1) throw Error('Unsupported typography policy version');
  return site?.typography?.version === 1;
}
export function resolvedTypography(theme: Pick<ThemeTokens, 'typography'> = {}): Record<TypeRole, TypeStyle> {
  return Object.fromEntries(TYPE_ROLES.map(role => [role, { ...DEFAULT_TYPE_ROLES[role], ...theme.typography?.roles?.[role] }])) as Record<TypeRole, TypeStyle>;
}
/** Reject malformed values early; actual CSS lengths are resolved and checked in Chromium. */
export function validateTypography(value: unknown, requireRoles = false): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Typography requires a shared roles object in theme/defaults.json'];
  const system = value as TypographySystem;
  if (!system.roles || typeof system.roles !== 'object' || Array.isArray(system.roles)) return ['Typography roles must be an object'];
  if (requireRoles) for (const role of TYPE_ROLES) if (!system.roles[role] || typeof system.roles[role] !== 'object' || Object.keys(DEFAULT_TYPE_ROLES[role]).some(key => !(key in system.roles[role]!))) errors.push(`Typography role ${role} must declare size, weight, lineHeight, tracking and font`);
  const check = (style: Partial<TypeStyle>, name: string) => {
    if (!style || typeof style !== 'object' || Array.isArray(style)) { errors.push(`Invalid typography style: ${name}`); return; }
    for (const key of ['size', 'lineHeight', 'tracking'] as const) if (style[key] !== undefined && (typeof style[key] !== 'string' || !style[key]!.trim() || /[;{}<>]/.test(style[key]!))) errors.push(`Invalid typography ${name}.${key}`);
    if (style.weight !== undefined && (!Number.isFinite(style.weight) || style.weight < 1 || style.weight > 1000)) errors.push(`Invalid typography ${name}.weight`);
    if (style.font !== undefined && !['body', 'display'].includes(style.font)) errors.push(`Invalid typography ${name}.font`);
    for (const key of Object.keys(style)) if (!['size','weight','lineHeight','tracking','font','role','reason'].includes(key)) errors.push(`Unknown typography property ${name}.${key}`);
  };
  for (const [role, style] of Object.entries(system.roles)) {
    if (!TYPE_ROLES.includes(role as TypeRole)) errors.push(`Unknown typography role: ${role}`);
    check(style, role);
  }
  if (system.variants !== undefined && (!system.variants || typeof system.variants !== 'object' || Array.isArray(system.variants))) errors.push('Typography variants must be an object');
  else for (const [name, variant] of Object.entries(system.variants || {})) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !variant || !TYPE_ROLES.includes(variant.role) || typeof variant.reason !== 'string' || !variant.reason.trim()) errors.push(`Typography variant ${name} needs a known role and reason`);
    check(variant, name);
  }
  return errors;
}
export function typographyVariables(theme: ThemeTokens): string {
  const errors = theme.typography ? validateTypography(theme.typography) : [];
  if (errors.length) throw Error(errors.join('\n'));
  const roles = resolvedTypography(theme);
  const values = (prefix: string, style: TypeStyle) => `  --type-${prefix}-size: ${style.size};\n  --type-${prefix}-weight: ${style.weight};\n  --type-${prefix}-leading: ${style.lineHeight};\n  --type-${prefix}-tracking: ${style.tracking};\n  --type-${prefix}-font: var(--font-${style.font});`;
  return [...TYPE_ROLES.map(role => values(role, roles[role])), ...Object.entries(theme.typography?.variants || {}).map(([name, variant]) => values(`variant-${name}`, { ...roles[variant.role], ...variant }))].join('\n');
}
export function typographyCss(): string {
  const declarations = (name: string) => `font-size:var(--type-${name}-size);font-weight:var(--type-${name}-weight);line-height:var(--type-${name}-leading);letter-spacing:var(--type-${name}-tracking);font-family:var(--type-${name}-font);font-synthesis:none`;
  return [...TYPE_ROLES.map(role => `${TYPE_SELECTORS[role].join(',')}{${declarations(role)}}`), ...TYPE_ROLES.map(role => `[data-type-role="${role}"][data-type-role]{${declarations(role)}}`)].join('\n');
}
export function typographyVariantCss(theme: ThemeTokens): string {
  return Object.keys(theme.typography?.variants || {}).map(name => `[data-type-variant="${name}"][data-type-variant][data-type-variant]{font-size:var(--type-variant-${name}-size);font-weight:var(--type-variant-${name}-weight);line-height:var(--type-variant-${name}-leading);letter-spacing:var(--type-variant-${name}-tracking);font-family:var(--type-variant-${name}-font)}`).join('\n');
}
