import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { files, json, save, sha256, within } from './artifacts.ts';
import { sourceRevision } from '../engine/revision.ts';
import type {AdminMaintenanceBinding} from './package-maintenance.ts';
import type { CareConfig } from './site-care/config.ts';
import { careReviewBrief } from './site-care/brief.ts';

export const MANAGER_SKILL = '.agents/skills/vitris-site-manager/SKILL.md';
export const MANAGER_CONTEXT = 'agent/site-manager/CONTEXT.md';
export const MANAGER_TASK = 'agent/site-manager/review-task.md';

export interface SiteManagerConfig {
  version: 1;
  reviewPolicy: 'report-and-prepare-local-fixes';
  schedule: { cadence: string | null; timezone: string | null };
  care?: CareConfig;
  updates?: {version:1;policy:'prepare-and-test';admin?:AdminMaintenanceBinding};
}

const defaultConfig = (): SiteManagerConfig => ({ version: 1, reviewPolicy: 'report-and-prepare-local-fixes',
  schedule: { cadence: null, timezone: null } });

export function readSiteManagerConfig(root: string): SiteManagerConfig {
  if (!existsSync(join(root, 'site-manager.json'))) return defaultConfig();
  const config = json<SiteManagerConfig>(join(root, 'site-manager.json'));
  if (config.version !== 1 || config.reviewPolicy !== 'report-and-prepare-local-fixes' || !config.schedule ||
      ['cadence', 'timezone'].some(key => {
        const value = config.schedule[key as keyof SiteManagerConfig['schedule']];
        return value !== null && (typeof value !== 'string' || !value.trim());
      })) throw new Error('Invalid site-manager.json: use version 1, report-and-prepare-local-fixes, and nullable schedule fields');
  if (config.schedule.timezone) new Intl.DateTimeFormat('en', { timeZone: config.schedule.timezone });
  if (config.care !== undefined && (!config.care || typeof config.care !== 'object' || typeof config.care.siteId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(config.care.siteId) || !['local', 'remote'].includes(config.care.state) || typeof config.care.time !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.care.time))) throw new Error('Invalid site-manager.json care settings; preserve and resolve explicitly');
  if(config.updates!==undefined&&(config.updates.version!==1||config.updates.policy!=='prepare-and-test'||config.updates.admin&&(!config.updates.admin.directory||config.updates.admin.version!==1||!config.updates.admin.installationId||!config.updates.admin.siteId||!config.updates.admin.adminOrigin)))throw new Error('Invalid package maintenance binding; preserve and resolve explicitly');
  return config;
}

/** Only public origins enter generated context; never serialize whole connection objects. */
function publicOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.origin;
  } catch { return undefined; }
}

export function siteManagerStatus(siteRoot: string) {
  const root = resolve(siteRoot);
  if (!existsSync(join(root, 'site.json')) || !existsSync(join(root, 'launch.json'))) throw new Error('Site management requires a website repository with site.json and launch.json');
  const site = json<{ name?: string; slug?: string }>(join(root, 'site.json'));
  const launch = json<{ mode?: string; publicOrigin?: string; backendOrigin?: string; webAnalyticsToken?: string;
    forms?: unknown[]; scheduling?: { enabled?: boolean; apiOrigin?: string } }>(join(root, 'launch.json'));
  const config = readSiteManagerConfig(root);
  const schedulePath = join(root, 'agent/site-manager/schedule.json');
  const scheduler = existsSync(schedulePath) ? json<{ provider: string; taskId: string }>(schedulePath) : null;
  if (scheduler && (typeof scheduler.provider !== 'string' || !scheduler.provider.trim() || typeof scheduler.taskId !== 'string' || !scheduler.taskId.trim())) throw new Error('Invalid local site manager schedule reference');
  const revision = sourceRevision(root);
  const productionOrigin = publicOrigin(launch.publicOrigin);
  const releases = files(join(root, 'agent/releases')).filter(path => path.endsWith('.json')).flatMap(path => {
    try {
      const record = json<{ deployment?: { environment?: string; url?: string; issuedAt?: string }; release?: { sourceRevision?: string; policyId?: string } }>(path);
      if (record.deployment?.environment !== 'production' || !Number.isFinite(Date.parse(record.deployment.issuedAt || ''))) return [];
      return [{ path: relative(root, path).replaceAll('\\', '/'), issuedAt: record.deployment.issuedAt!,
        origin: publicOrigin(record.deployment.url), sourceRevision: record.release?.sourceRevision, policyId: record.release?.policyId }];
    } catch { return []; } // A malformed historical record is not deployment evidence.
  }).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
  return { version: 1, generatedAt: new Date().toISOString(), name: site.name || site.slug || 'Website',
    mode: launch.mode === 'preserve' ? 'preserve' : 'redesign', sourceRevision: revision.digest,
    productionOrigin: productionOrigin || null, liveHealth: 'not-checked',
    lastProductionRelease: releases[0] || null,
    analytics: { firstParty: publicOrigin(launch.backendOrigin) ? 'configured-unverified' : 'not-configured',
      fieldPerformance: /^[a-f0-9]{32}$/i.test(launch.webAnalyticsToken || '') ? 'configured-unverified' : 'not-configured',
      dataAccess: 'not-checked' },
    integrations: { forms: Array.isArray(launch.forms) ? launch.forms.length : 0,
      booking: launch.scheduling?.enabled === true ? 'configured-unverified' : 'not-configured',
      bookingOrigin: publicOrigin(launch.scheduling?.apiOrigin) || null },
    inventory: revision.inputs.map(input => input.path),
    config, scheduler, scheduleState: scheduler ? 'recorded-unverified' : 'not-connected',
    installed: existsSync(join(root, MANAGER_SKILL)), contextPresent: existsSync(join(root, MANAGER_CONTEXT)) };
}

export function prepareSiteManager(siteRoot: string, harnessRoot: string) {
  const root = resolve(siteRoot), harness = resolve(harnessRoot);
  const status = siteManagerStatus(root);
  const skillText = readFileSync(join(harness, 'templates/site', MANAGER_SKILL), 'utf8');
  const installationPath = 'agent/site-manager/installation.json';
  const previous = existsSync(join(root, installationPath)) ? json<{ skillHash?: string }>(join(root, installationPath)) : undefined;
  const destinations = [MANAGER_SKILL, MANAGER_CONTEXT, MANAGER_TASK, installationPath, 'site-manager.json', 'SITE-MANAGER.md', 'agent/refs/site-manager.md', 'agent/refs/site-care.md', 'agent/refs/package-updates.md', '.gitignore'];
  // Validate all output paths and skill provenance before installing anything.
  for (const path of destinations) within(root, path);
  const skillPath = join(root, MANAGER_SKILL);
  if (existsSync(skillPath)) {
    const current = sha256(readFileSync(skillPath, 'utf8'));
    if (current !== sha256(skillText) && current !== previous?.skillHash) throw new Error(`Site customized ${MANAGER_SKILL}, or provenance is unknown; preserve it and resolve explicitly`);
  }
  const write = (path: string, text: string) => {
    const dest = within(root, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  };
  const ignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
  const missingIgnores = ['agent/site-manager/', 'artifacts/site-manager/'].filter(rule => !ignore.split(/\r?\n/).includes(rule));
  if (missingIgnores.length) write('.gitignore', `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}${missingIgnores.join('\n')}\n`);
  if (!existsSync(join(root, 'SITE-MANAGER.md'))) write('SITE-MANAGER.md', readFileSync(join(harness, 'templates/site/SITE-MANAGER.md'), 'utf8'));
  if (!existsSync(join(root, 'site-manager.json'))) save(join(root, 'site-manager.json'), status.config);
  // Existing sites can adopt management without replacing their AGENTS.md or other kit files.
  if (!existsSync(join(root, 'agent/refs/site-manager.md'))) write('agent/refs/site-manager.md', readFileSync(join(harness, 'agent/refs/site-manager.md'), 'utf8'));
  if (!existsSync(join(root, 'agent/refs/site-care.md'))) write('agent/refs/site-care.md', readFileSync(join(harness, 'agent/refs/site-care.md'), 'utf8'));
  if (!existsSync(join(root,'agent/refs/package-updates.md'))) write('agent/refs/package-updates.md',readFileSync(join(harness,'agent/refs/package-updates.md'),'utf8'));
  write(MANAGER_SKILL, skillText);
  save(join(root, installationPath), { version: 1, skillHash: sha256(skillText) });
  const inventory = (prefix: string) => status.inventory.filter(path => path.startsWith(prefix)).map(path => `- \`${path}\``).join('\n') || '- None recorded';
  write(MANAGER_CONTEXT, `# Current site context\n\nGenerated ${status.generatedAt}. Run \`vitris manage prepare --site .\` to refresh. This file indexes local evidence; it does not certify live health.\n\n` +
    `Site: ${status.name}\nMode: ${status.mode}\nSource revision: \`${status.sourceRevision}\`\nProduction origin: ${status.productionOrigin || 'unknown; do not substitute the harvest source or a preview'}\nLive health: not checked\n\n` +
    `## Harness updates and site consistency\n\nRelease availability and compatibility: not checked by this local preparation. Run \`vitris manage updates --site . --out agent/site-manager/package-updates.json --json\` during daily care and before publication. Bind the actual separate admin once with \`--admin-dir PATH --bind\` after its identity matches this website; a tool dependency is not its installed version. Read the website's package/lockfile, installed metadata and managed-kit manifest, plus the actual separate admin's package/configuration and deployment evidence when present. Follow \`agent/refs/site-manager.md\` to check published releases, identify drift and anomalies, and assess every proposed change against the accepted design system, shared components, route conventions and integration contracts. Record the verified system baseline and intentional exceptions in \`SITE-MANAGER.md\`.\n\n` +
    `## Knowledge map\n\n- \`SITE-MANAGER.md\`: owner goals, important journeys, service ownership and maintenance decisions\n- \`launch.json\`, \`site.json\`: current public configuration and identity\n- \`agent/site-memory.json\`: accepted preferences and unresolved items (if present)\n- \`agent/overrides/refs/site-manager.md\`: site-specific instructions (if present)\n- \`agent/refs/site-manager.md\`: management workflow\n- \`agent/requests/\`, \`agent/reviews/\`: change baselines and verification evidence\n- \`agent/releases/\`: deployment records; no current health guarantee\n- \`artifacts/site-manager/\`: dated operational reports and evidence\n\n` +
    `## Production record\n\n${status.lastProductionRelease ? JSON.stringify(status.lastProductionRelease, null, 2) : 'No production deployment receipt recorded. A configured origin may still be live; verify it independently.'}\n\n` +
    `## Integrations\n\nFirst-party analytics: ${status.analytics.firstParty}\nField performance: ${status.analytics.fieldPerformance}\nAnalytics access/results: not checked\nForms configured: ${status.integrations.forms}\nBooking: ${status.integrations.booking}\nBooking API: ${status.integrations.bookingOrigin || 'unknown'}\nAdmin, DNS, email, other analytics and external services: inspect the handbook and existing configuration; connection and health unverified.\n\n` +
    `## Page sources\n\n${inventory(status.mode === 'preserve' ? 'preserved/' : 'pages/')}\n\n## Components and theme\n\n${inventory('components/')}\n${inventory('theme/')}\n\n## Business, content and media evidence\n\n${inventory('onboarding/')}\n${inventory('media/')}\n${inventory('public/')}\n\n` +
    `## Recurring review\n\nPolicy: report findings and prepare justified fixes locally for approval.\nSchedule: ${status.scheduleState}; external task state must be checked in its scheduler.\nPreferences: \`site-manager.json\`. Local task reference: \`agent/site-manager/schedule.json\`. Task prompt: \`agent/site-manager/review-task.md\`.\n`);
  write(MANAGER_TASK, careReviewBrief);
  return { ...status, installed: true, contextPresent: true, context: MANAGER_CONTEXT, taskBrief: MANAGER_TASK };
}
