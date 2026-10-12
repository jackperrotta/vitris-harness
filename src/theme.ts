import type { ThemeTokens } from "./types.ts";
import { defaultTheme } from "./types.ts";

export function mergeTheme(partial?: Partial<ThemeTokens> | null): ThemeTokens {
  const merged = { ...defaultTheme, ...partial };
  if (!partial?.colorFocus) merged.colorFocus = merged.colorAccent;
  if (!partial?.colorSurface2) {
    merged.colorSurface2 = partial?.colorSurface2 || defaultTheme.colorSurface2;
  }
  if (!partial?.radiusLg) merged.radiusLg = partial?.radiusLg || defaultTheme.radiusLg;
  return merged;
}

export function themeCss(tokens: ThemeTokens): string {
  const t = mergeTheme(tokens);
  return `:root {
  --color-bg: ${t.colorBg};
  --color-text: ${t.colorText};
  --color-muted: ${t.colorMuted};
  --color-accent: ${t.colorAccent};
  --color-accent-text: ${t.colorAccentText};
  --color-surface: ${t.colorSurface};
  --color-surface-2: ${t.colorSurface2};
  --color-border: ${t.colorBorder};
  --color-focus: ${t.colorFocus || t.colorAccent};
  --font-body: ${t.fontBody};
  --font-display: ${t.fontDisplay};
  --radius: ${t.radius};
  --radius-lg: ${t.radiusLg};
  --radius-pill: ${t.radiusPill};
  --max-width: ${t.maxWidth};
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4.5rem;
  --space-9: 6rem;
  --step-0: ${t.typeStep0 || 'clamp(0.9rem, 0.85rem + 0.2vw, 1rem)'};
  --step-1: ${t.typeStep1 || 'clamp(1rem, 0.95rem + 0.3vw, 1.125rem)'};
  --step-2: ${t.typeStep2 || 'clamp(1.2rem, 1.05rem + 0.6vw, 1.5rem)'};
  --step-3: ${t.typeStep3 || 'clamp(1.6rem, 1.25rem + 1.2vw, 2.25rem)'};
  --step-4: ${t.typeStep4 || 'clamp(2.1rem, 1.5rem + 2.2vw, 3.5rem)'};
  --step-5: ${t.typeStep5 || 'clamp(2.6rem, 1.7rem + 3.4vw, 4.75rem)'};
  --tap-min: 44px;
  --header-h: 4.75rem;
  --section-y: ${t.sectionY || 'clamp(3.5rem, 3rem + 3vw, 6rem)'};
  --blur-header: 12px;
  --shadow-1: 0 1px 2px color-mix(in srgb, var(--color-text) 6%, transparent);
  --shadow-2: 0 8px 24px color-mix(in srgb, var(--color-text) 8%, transparent);
  --shadow-3: 0 20px 48px color-mix(in srgb, var(--color-text) 12%, transparent);
  --ring: 0 0 0 3px color-mix(in srgb, var(--color-focus) 35%, transparent);
}
`;
}
