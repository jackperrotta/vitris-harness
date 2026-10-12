export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  AE?: AnalyticsEngineDataset;
  /** Dormant: workflow class still deploys, but intake no longer creates instances. */
  SITE_UPDATE?: Workflow;
  APP_HOST?: string;
  OPS_HOST?: string;
  VITRIS_BACKEND_ORIGIN?: string;
  /** @deprecated Use VITRIS_BACKEND_ORIGIN. */
  KERNEL_ORIGIN?: string;
  ASSETS_ORIGIN?: string;
  DEV_LOGIN?: string;
  VITRIS_PREVIEW?: string;
  SESSION_SECRET?: string;
  APPROVE_SECRET?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  DEPLOY_TOKEN?: string;
  PUBLISH_ATTESTATION_SECRET?: string;
  /** @deprecated Prefer Gmail SA; kept for magic-link fallback */
  MAIL_API_KEY?: string;
  MAIL_FROM?: string;
  GITHUB_TOKEN?: string;
  GMAIL_SA_CLIENT_EMAIL?: string;
  GMAIL_SA_PRIVATE_KEY?: string;
  GMAIL_IMPERSONATE?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPERATOR_NOTIFY_EMAIL?: string;
  FORMS_EMAIL?: SendEmail;
  /** Optional isolated operator sink; test mode otherwise captures only. */
  FORMS_TEST_EMAIL?: SendEmail;
  FORMS_TEST_RECIPIENT?: string;
  FORMS_FROM?: string;
  FORMS_SENDER_READY?: string;
  FORMS_TURNSTILE_SECRETS?: string;
  FORMS_SETUP_TOKENS?: string;
  FORMS_ABUSE_SECRET?: string;
  FORMS_SANDBOX?: string;
}

export function kernelOrigin(env: Env, request?: Request): string {
  if (env.VITRIS_BACKEND_ORIGIN) return env.VITRIS_BACKEND_ORIGIN;
  if (env.KERNEL_ORIGIN) return env.KERNEL_ORIGIN;
  if (request) return new URL(request.url).origin;
  return "http://127.0.0.1:8787";
}

export function isDevLogin(env: Env, request?: Request): boolean {
  if (!request || (env.DEV_LOGIN !== "1" && env.DEV_LOGIN !== "true")) return false;
  return isLocalRequest(request);
}

export function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]";
}

export function hasSafeSessionSecret(env: Env, request: Request): boolean {
  return isLocalRequest(request) || !!env.SESSION_SECRET && env.SESSION_SECRET.length >= 32;
}

export function secret(env: Env): string {
  return env.SESSION_SECRET || "dev-insecure-session-secret";
}

export function approveSecret(env: Env): string {
  return env.APPROVE_SECRET || secret(env);
}

export const backendOrigin = kernelOrigin;
