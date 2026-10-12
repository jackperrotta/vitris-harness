import type { Env } from "./env.ts";
import { isDevLogin } from "./env.ts";
import type { SiteConfig, ThemeTokens } from "../types.ts";
import { defaultTheme } from "../types.ts";

const DEMO_TENANT = "00000000-0000-0000-0000-000000000010";
const DEMO_OWNER = "00000000-0000-0000-0000-000000000011";
const DEMO_OPS = "00000000-0000-0000-0000-000000000012";

export const demoSite: SiteConfig = {
  name: "Demo Shop",
  slug: "demo",
  motion: { strength: "editorial", stagger: true },
};

export const demoTheme: ThemeTokens = { ...defaultTheme };
export const demoContent = {};

async function refreshDemoSnapshot(env: Env): Promise<void> {
  const siteJson = JSON.stringify(demoSite);
  const contentJson = JSON.stringify(demoContent);
  const themeJson = JSON.stringify(demoTheme);
  await env.DB.batch([
    env.DB.prepare(`UPDATE site_config SET json = ? WHERE tenant_id = ?`).bind(siteJson, DEMO_TENANT),
    env.DB.prepare(`UPDATE content SET json = ? WHERE tenant_id = ?`).bind(contentJson, DEMO_TENANT),
    env.DB.prepare(`UPDATE theme SET json = ? WHERE tenant_id = ?`).bind(themeJson, DEMO_TENANT),
    env.DB.prepare(`UPDATE tenants SET name = ?, content_version = content_version + 1 WHERE id = ?`).bind(
      demoSite.name,
      DEMO_TENANT,
    ),
  ]);
}

export async function ensureSeed(env: Env, request?: Request): Promise<void> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM tenants").first<{ n: number }>();
  const siteJson = JSON.stringify(demoSite);
  const contentJson = JSON.stringify(demoContent);
  const themeJson = JSON.stringify(demoTheme);

  if (row && row.n > 0) {
    if (isDevLogin(env, request)) await refreshDemoSnapshot(env);
    return;
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, slug, name, pages_project, kernel_version, status)
       VALUES (?, 'demo', ?, 'vitris-demo', '0.1.0', 'active')`,
    ).bind(DEMO_TENANT, demoSite.name),
    env.DB.prepare(`INSERT INTO hostnames (hostname, tenant_id, kind) VALUES ('demo.pages.dev', ?, 'pages')`).bind(DEMO_TENANT),
    env.DB.prepare(`INSERT INTO users (id, email) VALUES (?, 'owner@demo.test')`).bind(DEMO_OWNER),
    env.DB.prepare(`INSERT INTO users (id, email) VALUES (?, 'ops@demo.test')`).bind(DEMO_OPS),
    env.DB.prepare(`INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, 'owner')`).bind(DEMO_OWNER, DEMO_TENANT),
    env.DB.prepare(`INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, 'operator')`).bind(DEMO_OPS, DEMO_TENANT),
    env.DB.prepare(`INSERT INTO site_config (tenant_id, json) VALUES (?, ?)`).bind(DEMO_TENANT, siteJson),
    env.DB.prepare(`INSERT INTO content (tenant_id, json) VALUES (?, ?)`).bind(DEMO_TENANT, contentJson),
    env.DB.prepare(`INSERT INTO theme (tenant_id, json) VALUES (?, ?)`).bind(DEMO_TENANT, themeJson),
  ]);
}

export {
  demoSite as localServiceSite,
  demoContent as localServiceContent,
  demoTheme as localServiceTheme,
};
