import type { ContentTree, SiteConfig, ThemeTokens } from "../types.ts";
import { defaultTheme } from "../types.ts";
import type { Env } from "./env.ts";

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  pages_project: string | null;
  kernel_version: string | null;
  content_version: number;
  status: string;
  github_owner?: string | null;
  github_repo?: string | null;
};

export async function tenantBySlug(env: Env, slug: string): Promise<TenantRow | null> {
  return env.DB.prepare("SELECT * FROM tenants WHERE slug = ?").bind(slug).first<TenantRow>();
}

export async function tenantById(env: Env, id: string): Promise<TenantRow | null> {
  return env.DB.prepare("SELECT * FROM tenants WHERE id = ?").bind(id).first<TenantRow>();
}

export async function tenantByHostname(env: Env, hostname: string): Promise<TenantRow | null> {
  const cached = await env.KV.get(`host:${hostname}`);
  if (cached) return tenantById(env, cached);
  const row = await env.DB.prepare(
    `SELECT tenants.* FROM tenants JOIN hostnames ON hostnames.tenant_id = tenants.id WHERE hostnames.hostname = ?`,
  )
    .bind(hostname.toLowerCase())
    .first<TenantRow>();
  if (row) await env.KV.put(`host:${hostname}`, row.id, { expirationTtl: 3600 });
  return row;
}

export async function loadSiteSnapshot(env: Env, tenantId: string): Promise<{
  site: SiteConfig;
  content: ContentTree;
  theme: ThemeTokens;
} | null> {
  const siteRow = await env.DB.prepare("SELECT json FROM site_config WHERE tenant_id = ?").bind(tenantId).first<{ json: string }>();
  const contentRow = await env.DB.prepare("SELECT json FROM content WHERE tenant_id = ?").bind(tenantId).first<{ json: string }>();
  const themeRow = await env.DB.prepare("SELECT json FROM theme WHERE tenant_id = ?").bind(tenantId).first<{ json: string }>();
  if (!siteRow || !contentRow || !themeRow) return null;
  return {
    site: JSON.parse(siteRow.json) as SiteConfig,
    content: JSON.parse(contentRow.json) as ContentTree,
    theme: { ...defaultTheme, ...(JSON.parse(themeRow.json) as ThemeTokens) },
  };
}

export async function bumpVersion(env: Env, tenantId: string): Promise<number> {
  const row = await env.DB.prepare(
    "UPDATE tenants SET content_version = content_version + 1 WHERE id = ? RETURNING content_version",
  )
    .bind(tenantId)
    .first<{ content_version: number }>();
  return row?.content_version ?? 1;
}
