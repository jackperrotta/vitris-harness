import { hmacHex } from "./auth.ts";
import { approveSecret, type Env } from "./env.ts";
import type { TenantRow } from "./tenant.ts";

export type UpdateJobStatus =
  | "queued"
  | "running"
  | "preview"
  | "approved"
  | "merged"
  | "rejected"
  | "failed";

export type UpdateJob = {
  id: string;
  tenant_id: string;
  workflow_instance_id: string | null;
  sender_email: string;
  prompt: string;
  branch: string | null;
  preview_url: string | null;
  summary: string | null;
  status: UpdateJobStatus;
  media_r2_prefix: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantGithub = TenantRow & {
  github_owner: string | null;
  github_repo: string | null;
};

export async function findAuthorizedSender(
  env: Env,
  email: string,
  slugHint?: string | null,
): Promise<{ tenant: TenantGithub; email: string; role: string } | null> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return null;

  if (slugHint) {
    const allow = await env.DB.prepare(
      `SELECT tenants.*, sender_allowlist.email AS sender
       FROM sender_allowlist
       JOIN tenants ON tenants.id = sender_allowlist.tenant_id
       WHERE sender_allowlist.email = ? AND tenants.slug = ?`,
    )
      .bind(normalized, slugHint)
      .first<TenantGithub & { sender: string }>();
    if (allow) return { tenant: allow, email: normalized, role: "allowlist" };

    const member = await env.DB.prepare(
      `SELECT tenants.*, memberships.role AS role
       FROM users
       JOIN memberships ON memberships.user_id = users.id
       JOIN tenants ON tenants.id = memberships.tenant_id
       WHERE users.email = ? AND tenants.slug = ?
       LIMIT 1`,
    )
      .bind(normalized, slugHint)
      .first<TenantGithub & { role: string }>();
    if (member) return { tenant: member, email: normalized, role: member.role };
    return null;
  }

  const allow = await env.DB.prepare(
    `SELECT tenants.*, sender_allowlist.email AS sender
     FROM sender_allowlist
     JOIN tenants ON tenants.id = sender_allowlist.tenant_id
     WHERE sender_allowlist.email = ?
     LIMIT 1`,
  )
    .bind(normalized)
    .first<TenantGithub & { sender: string }>();
  if (allow) return { tenant: allow, email: normalized, role: "allowlist" };

  const member = await env.DB.prepare(
    `SELECT tenants.*, memberships.role AS role
     FROM users
     JOIN memberships ON memberships.user_id = users.id
     JOIN tenants ON tenants.id = memberships.tenant_id
     WHERE users.email = ?
     LIMIT 1`,
  )
    .bind(normalized)
    .first<TenantGithub & { role: string }>();
  if (member) return { tenant: member, email: normalized, role: member.role };
  return null;
}

export async function insertUpdateJob(
  env: Env,
  opts: {
    id: string;
    tenantId: string;
    senderEmail: string;
    prompt: string;
    mediaPrefix?: string | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO update_jobs (id, tenant_id, sender_email, prompt, status, media_r2_prefix)
     VALUES (?, ?, ?, ?, 'queued', ?)`,
  )
    .bind(opts.id, opts.tenantId, opts.senderEmail.toLowerCase(), opts.prompt, opts.mediaPrefix ?? null)
    .run();
}

export async function getUpdateJob(env: Env, id: string): Promise<UpdateJob | null> {
  return env.DB.prepare("SELECT * FROM update_jobs WHERE id = ?").bind(id).first<UpdateJob>();
}

export async function listUpdateJobs(env: Env, tenantId: string, limit = 50): Promise<UpdateJob[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM update_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(tenantId, limit)
    .all<UpdateJob>();
  return rows.results ?? [];
}

export type UpdateJobWithTenant = UpdateJob & {
  tenant_name: string;
  tenant_slug: string;
  github_owner: string | null;
  github_repo: string | null;
  pages_project: string | null;
};

export async function listAllUpdateJobs(env: Env, limit = 80): Promise<UpdateJobWithTenant[]> {
  const rows = await env.DB.prepare(
    `SELECT update_jobs.*, tenants.name AS tenant_name, tenants.slug AS tenant_slug,
            tenants.github_owner, tenants.github_repo, tenants.pages_project
     FROM update_jobs
     JOIN tenants ON tenants.id = update_jobs.tenant_id
     ORDER BY update_jobs.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<UpdateJobWithTenant>();
  return rows.results ?? [];
}

export async function patchUpdateJob(
  env: Env,
  id: string,
  fields: Partial<{
    workflow_instance_id: string;
    branch: string;
    preview_url: string;
    summary: string;
    status: UpdateJobStatus;
    error: string | null;
  }>,
): Promise<void> {
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await env.DB.prepare(`UPDATE update_jobs SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function signApproveToken(env: Env, jobId: string, decision: "approve" | "reject"): Promise<{
  exp: number;
  sig: string;
}> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const sig = await hmacHex(approveSecret(env), `${decision}:${jobId}:${exp}`);
  return { exp, sig };
}

export async function verifyApproveToken(
  env: Env,
  jobId: string,
  decision: "approve" | "reject",
  exp: string,
  sig: string,
): Promise<boolean> {
  const expNum = Number(exp);
  if (!expNum || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(approveSecret(env), `${decision}:${jobId}:${expNum}`);
  return expected === sig;
}

export function parseSlugFromRecipient(to: string): string | null {
  // updates+acme@domain or acme@updates.domain
  const plus = to.match(/^[^+]+?\+([a-z0-9-]+)@/i);
  if (plus) return plus[1]!.toLowerCase();
  const local = to.split("@")[0]?.toLowerCase() || "";
  if (/^[a-z0-9-]+$/.test(local) && local !== "updates" && local !== "hello") return local;
  return null;
}

export function parseSlugFromSubject(subject: string): string | null {
  const m = subject.match(/\[site:\s*([a-z0-9-]+)\]/i) || subject.match(/\bslug:\s*([a-z0-9-]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}
