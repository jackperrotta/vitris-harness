import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { typographyEnabled, validateTypography } from '../typography.ts';
import type { SiteConfig, ThemeTokens } from '../types.ts';
export function typographyPolicy(root: string): { enabled: boolean; theme: Partial<ThemeTokens> } {
  const read = (path: string) => existsSync(join(root,path)) ? JSON.parse(readFileSync(join(root,path),'utf8')) : {};
  return { enabled: typographyEnabled(read('site.json') as SiteConfig), theme: read('theme/defaults.json') };
}
export function typographyDirectionFailures(root: string): string[] {
  const policy = typographyPolicy(root);
  return policy.enabled ? validateTypography(policy.theme.typography, true) : [];
}
