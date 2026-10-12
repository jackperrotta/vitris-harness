import {
  classifyChannel,
  classifyDevice,
  clampInt,
  isBotUa,
  isUuid,
  normalizePath,
  referrerHost,
  type ConvertGoal,
  type EngageAction,
  type EventKind,
} from "../../analytics.ts";
import { escapeHtml } from "../../html.ts";
import { hmacHex } from "../auth.ts";
import { kernelOrigin, secret, type Env } from "../env.ts";
import { html, json, readBody, text } from "../http.ts";
import { loadSiteSnapshot, tenantByHostname, tenantBySlug } from "../tenant.ts";
import { handleFormSubmission, handleFormsAdmin } from '../forms.ts';

const KINDS = new Set<EventKind>(["pageview", "leave", "convert", "engage", "ping"]);
const GOALS = new Set<ConvertGoal>(["form", "tel", "mailto", "maps"]);
const ACTIONS = new Set<EngageAction>(["nav", "btn", "img", "carousel"]);

export function nativeLeadConfirmation(referer: string | null): Response {
  let returnLink = "";
  try {
    const url = new URL(referer || "");
    if (url.protocol === "https:" || url.protocol === "http:") {
      returnLink = `<p><a href="${escapeHtml(url.toString())}">Return to website</a></p>`;
    }
  } catch { /* A missing or invalid referrer should not affect the confirmation. */ }
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Message accepted</title></head><body><main><h1>Message accepted</h1><p>Thank you. Your inquiry has been saved.</p>${returnLink}</main></body></html>`, 200, { "cache-control": "no-store", "x-content-type-options": "nosniff" });
}

function originHost(request: Request): string | null {
  const raw = request.headers.get("origin") || request.headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function previewSlug(request: Request): string | null {
  const raw = request.headers.get("referer") || "";
  const match = raw.match(/\/preview\/([^/]+)/);
  return match?.[1] ?? null;
}

async function tenantFromRequest(env: Env, request: Request) {
  const slug = previewSlug(request);
  if (slug) return tenantBySlug(env, slug);
  const host = originHost(request);
  if (!host) return null;
  const kernelHost = new URL(kernelOrigin(env, request)).host;
  if (host === kernelHost) return null;
  return tenantByHostname(env, host);
}

async function rateLimit(env: Env, key: string, limit: number): Promise<boolean> {
  const n = Number((await env.KV.get(key)) || "0");
  if (n > limit) return false;
  await env.KV.put(key, String(n + 1), { expirationTtl: 3600 });
  return true;
}

async function resolveVid(
  env: Env,
  request: Request,
  body: Record<string, string>,
  day: string,
): Promise<string> {
  const client = (body.vid || "").trim();
  if (isUuid(client)) return client;
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0";
  const ua = request.headers.get("user-agent") || "";
  return hmacHex(secret(env), `${day}|${ip}|${ua}`);
}

export async function insertConvertEvent(
  env: Env,
  opts: {
    tenantId: string;
    slug: string;
    path: string;
    vid: string;
    sid?: string;
    goal: ConvertGoal;
    src?: string;
    device?: string;
    hour?: number;
  },
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO analytics_events
      (id, tenant_id, path, referrer, vid, day, kind, sid, channel, device, hour, duration_ms, scroll_pct, goal, action, label, src)
     VALUES (?, ?, ?, '', ?, ?, 'convert', ?, NULL, ?, ?, NULL, NULL, ?, NULL, NULL, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      opts.tenantId,
      normalizePath(opts.path || "/"),
      opts.vid || null,
      day,
      opts.sid || null,
      opts.device || null,
      opts.hour ?? null,
      opts.goal,
      opts.src || "live",
    )
    .run();

  env.AE?.writeDataPoint({
    blobs: [opts.slug, opts.path || "/", opts.goal],
    doubles: [1],
    indexes: [opts.tenantId],
  });
}

export async function handleApi(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/leads') return handleFormSubmission(env, request);
  if (path.startsWith('/api/forms/')) return handleFormsAdmin(env, request);
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  if (path === "/api/t" && request.method === "POST") {
    const body = await readBody(request);
    let tenant = await tenantFromRequest(env, request);
    if (!tenant && body.slug) tenant = await tenantBySlug(env, body.slug);
    if (!tenant) return new Response(null, { status: 204, headers: cors });

    const ua = request.headers.get("user-agent") || "";
    if (isBotUa(ua)) return new Response(null, { status: 204, headers: cors });

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0";
    const hourKey = new Date().toISOString().slice(0, 13);
    if (!(await rateLimit(env, `rl:t:${tenant.id}:${ip}:${hourKey}`, 1200))) {
      return new Response(null, { status: 204, headers: cors });
    }

    const kindRaw = (body.kind || "pageview").toLowerCase();
    const kind = (KINDS.has(kindRaw as EventKind) ? kindRaw : "pageview") as EventKind;
    const day = new Date().toISOString().slice(0, 10);
    const vid = await resolveVid(env, request, body, day);
    const pagePath = normalizePath(body.path || "/");
    const src = body.src === "preview" || body.slug ? "preview" : "live";
    const sid = isUuid(body.sid || "") ? body.sid! : null;

    if (kind === "ping") {
      await env.DB.prepare(
        `INSERT INTO analytics_presence (tenant_id, vid, path, seen_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(tenant_id, vid) DO UPDATE SET
           path = excluded.path,
           seen_at = excluded.seen_at`,
      )
        .bind(tenant.id, vid, pagePath)
        .run();
      return new Response(null, { status: 204, headers: cors });
    }

    const device = classifyDevice(ua);
    const hour = clampInt(body.hour, 0, 23, new Date().getHours());
    const channel =
      kind === "pageview"
        ? classifyChannel({
            utmMedium: body.utm_medium,
            utmSource: body.utm_source,
            referrer: body.referrer,
          })
        : null;
    const ref = kind === "pageview" ? referrerHost(body.referrer || "") : null;
    const duration = kind === "leave" ? clampInt(body.duration_ms, 0, 30 * 60 * 1000, 0) : null;
    const scroll = kind === "leave" ? clampInt(body.scroll_pct, 0, 100, 0) : null;
    let goal: string | null = null;
    let action: string | null = null;
    const label = (body.label || "").slice(0, 40) || null;

    if (kind === "convert") {
      const g = (body.goal || "").toLowerCase();
      if (!GOALS.has(g as ConvertGoal) || g === "form") {
        return new Response(null, { status: 204, headers: cors });
      }
      goal = g;
    }
    if (kind === "engage") {
      const a = (body.action || "").toLowerCase();
      if (!ACTIONS.has(a as EngageAction)) {
        return new Response(null, { status: 204, headers: cors });
      }
      action = a;
    }

    env.AE?.writeDataPoint({
      blobs: [tenant.slug, pagePath, kind, goal || action || ""],
      doubles: [1],
      indexes: [tenant.id],
    });

    await env.DB.prepare(
      `INSERT INTO analytics_events
        (id, tenant_id, path, referrer, vid, day, kind, sid, channel, device, hour, duration_ms, scroll_pct, goal, action, label, src)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        tenant.id,
        pagePath,
        ref,
        vid,
        day,
        kind,
        sid,
        channel,
        device,
        hour,
        duration,
        scroll,
        goal,
        action,
        label,
        src,
      )
      .run();

    return new Response(null, { status: 204, headers: cors });
  }

  if (path.startsWith("/api/deploy/") && request.method === "GET") {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!env.DEPLOY_TOKEN || token !== env.DEPLOY_TOKEN) return json({ error: "unauthorized" }, 401);
    const slug = path.slice("/api/deploy/".length);
    const tenant = await tenantBySlug(env, slug);
    if (!tenant) return json({ error: "missing" }, 404);
    const snap = await loadSiteSnapshot(env, tenant.id);
    if (!snap) return json({ error: "missing" }, 404);
    return json(snap);
  }

  return json({ error: "not found" }, 404);
}
