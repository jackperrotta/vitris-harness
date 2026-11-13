import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadSitePages } from '../build/index.ts';
import { chatgptBusinessConfig } from '../integrations/chatgpt-business.ts';
import type { SiteConfig } from '../types.ts';
import { EXIT_CODES, type CommandResult } from './types.ts';

const businessHub = 'https://chatgpt.com/business-hub';
const pathKey = (path: string) => path.replace(/\/$/, '') || '/';

export async function inspectChatGPTBusiness(siteRoot: string): Promise<CommandResult> {
  const [siteText, launchText, pages] = await Promise.all([
    readFile(resolve(siteRoot, 'site.json'), 'utf8'),
    readFile(resolve(siteRoot, 'launch.json'), 'utf8'),
    loadSitePages(siteRoot),
  ]);
  const site: SiteConfig = JSON.parse(siteText);
  const launch: { publicOrigin?: string; backendOrigin?: string } = JSON.parse(launchText);
  const config = chatgptBusinessConfig(site.chatgptBusiness);
  const issues: string[] = [];
  let origin: string | null = null;
  try {
    const url = new URL(launch.publicOrigin || '');
    if (url.protocol === 'https:' && url.origin === launch.publicOrigin && url.hostname.includes('.')) origin = url.origin;
  } catch { /* Report an invalid or missing origin as a setup issue. */ }
  if (!origin) issues.push('Set launch.json publicOrigin to the exact production HTTPS origin.');
  if (site.environment === 'preview' || site.indexing === 'noindex') issues.push('Check the production build separately from preview or noindex output.');
  if (!config) issues.push('Add site.json chatgptBusiness to opt in.');
  if (config?.crawlers?.search === 'disallow') issues.push('OAI-SearchBot is blocked by the configured policy.');
  const publicPages = pages.filter(page => page.indexing !== 'noindex' && page.path !== '/404');
  const inquiryPath = config?.inquiryPath;
  const inquiry = inquiryPath && publicPages.find(page => pathKey(page.path) === pathKey(inquiryPath));
  if (!inquiry) issues.push('Set chatgptBusiness.inquiryPath to an authored, indexable inquiry or contact page.');
  const profile = {
    name: site.name,
    website: origin,
    description: publicPages.find(page => page.path === '/')?.description || null,
    telephone: site.telephone || null,
    email: site.email || null,
    address: site.address || null,
    inquiryUrl: inquiry && inquiryPath && origin ? new URL(inquiryPath, origin).href : null,
  };
  const nextSteps = [
    'Open Business Hub and claim the matching business using a verification option it offers.',
    'If domain verification is offered, copy its exact DNS TXT name and value to your DNS provider and verify in Business Hub.',
    'Complete Persona in Business Hub. Review the public profile and preview a Business Agent if eligible.',
    'Verify the production canonical pages, sitemap, and CDN access for OpenAI’s published crawler IPs.',
  ];
  return {
    ok: true,
    exitCode: EXIT_CODES.SUCCESS,
    summary: [
      `ChatGPT Business Hub — ${businessHub}`,
      `Business: ${profile.name} | Website: ${origin || 'unavailable'} | Inquiry: ${profile.inquiryUrl || 'unavailable'}`,
      ...(issues.length ? issues : ['Local profile handoff is ready for review.']),
      ...nextSteps,
    ].join('\n'),
    data: {
      version: 1,
      configured: !!config,
      businessHub,
      profile,
      crawlers: config?.crawlers || {},
      websiteAnalyticsConfigured: !!launch.backendOrigin,
      issues,
      nextSteps,
    },
  };
}
