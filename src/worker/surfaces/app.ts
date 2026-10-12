import { escapeHtml } from "../../html.ts";
import { consumeMagic, createSession, logoutCookie, magicToken, readSession, sessionCookie, type Session } from "../auth.ts";
import { isDevLogin, kernelOrigin, type Env } from "../env.ts";
import { html, json, query, readBody, redirect } from "../http.ts";
import { addPagesDomain } from "../publish.ts";
import { liveVisitors, rollupDay } from "../cron.ts";
import { loadSiteSnapshot, tenantById } from "../tenant.ts";
import { renderAnalyticsPage, type DailyRow } from "../ui/analytics.ts";
import { page } from "../ui/layout.ts";
import { handleRequestsDecide, renderRequestsPage } from "./updates.ts";
import { sendMail } from "../gmail.ts";
import { formAdminAuthorized, formReadiness, retryNotification } from '../forms.ts';
import { validateFormConfig } from '../../forms/config.ts';

async function membership(env: Env, email: string) {
  return env.DB.prepare(
    `SELECT users.id AS userId, users.email, memberships.tenant_id AS tenantId, memberships.role AS role
     FROM users JOIN memberships ON memberships.user_id = users.id
     WHERE users.email = ? LIMIT 1`,
  )
    .bind(email.toLowerCase())
    .first<{ userId: string; email: string; tenantId: string; role: Session["role"] }>();
}

async function requireUser(env: Env, request: Request): Promise<Session | Response> {
  const session = await readSession(env, request);
  if (session) return session;
  return redirect("/app/login");
}

function noticeFrom(request: Request): { notice?: string; error?: string } {
  const q = query(request);
  if (q.get("saved")) return { notice: "Saved." };
  if (q.get("sent")) return { notice: "Request queued. We’ll handle it in the site repo and share a preview." };
  if (q.get("published")) return { notice: q.get("msg") || "Published." };
  if (q.get("error")) return { error: q.get("error") || "Something went wrong." };
  return {};
}

export async function handleApp(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let path = url.pathname;
  if (path === "/app") path = "/app/";
  const method = request.method;

  if (path === "/app/login" && method === "GET") {
    return html(
      page({
        title: "Sign in · Vitris",
        body: `<div class="login"><div class="card">
          <h1>Owner sign in</h1>
          <p class="muted">Use the email on your Vitris account.${isDevLogin(env, request) ? " Local demo: owner@demo.test" : ""}</p>
          <form method="post" action="/app/login">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email" required>
            </div>
            <button class="btn" type="submit">Continue</button>
          </form>
        </div></div>`,
        ...noticeFrom(request),
      }),
    );
  }

  if (path === "/app/login" && method === "POST") {
    const body = await readBody(request);
    const email = (body.email || "").trim().toLowerCase();
    const member = await membership(env, email);
    if (!member) return redirect("/app/login?error=" + encodeURIComponent("No account for that email."));
    if (isDevLogin(env, request)) {
      const sid = await createSession(env, member);
      const res = redirect("/app");
      res.headers.append("set-cookie", sessionCookie(sid));
      return res;
    }
    const token = await magicToken(env, email);
    const link = `${kernelOrigin(env, request)}/app/auth?token=${token}`;
    try {
      await sendMail(env, {
        to: [email],
        subject: "Sign in to Vitris",
        text: `Open this link to sign in:\n${link}\n`,
      });
      if (env.GMAIL_SA_CLIENT_EMAIL || env.MAIL_API_KEY) {
        return redirect("/app/login?sent=1");
      }
    } catch {
      /* fall through to inline link */
    }
    if (env.MAIL_API_KEY && env.MAIL_FROM) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: [email],
          subject: "Sign in to Vitris",
          text: `Open this link to sign in:\n${link}\n`,
        }),
      });
      return redirect("/app/login?sent=1");
    }
    return html(
      page({
        title: "Sign in · Vitris",
        notice: "Email is not configured. Use this one-time link (dev).",
        body: `<div class="login"><div class="card"><p><a href="${escapeHtml(link)}">Sign in as ${escapeHtml(email)}</a></p></div></div>`,
      }),
    );
  }

  if (path === "/app/auth" && method === "GET") {
    const token = query(request).get("token") || "";
    const email = await consumeMagic(env, token);
    if (!email) return redirect("/app/login?error=" + encodeURIComponent("That link expired."));
    const member = await membership(env, email);
    if (!member) return redirect("/app/login?error=" + encodeURIComponent("No account for that email."));
    const sid = await createSession(env, member);
    const res = redirect("/app");
    res.headers.append("set-cookie", sessionCookie(sid));
    return res;
  }

  if (path === "/app/logout") {
    const res = redirect("/app/login");
    res.headers.append("set-cookie", logoutCookie());
    return res;
  }

  const session = await requireUser(env, request);
  if (session instanceof Response) return session;

  const tenant = await tenantById(env, session.tenantId);
  const savedSnapshot = await loadSiteSnapshot(env, session.tenantId);
  // Preserved/custom sites do not need structured content to view their leads.
  if (!tenant || (!savedSnapshot && !path.startsWith('/app/leads'))) return html(page({ title: "Missing site", session, path, error: "Site data missing.", body: "<p>No site snapshot.</p>" }), 500);
  const snap = savedSnapshot!;

  if (path === "/app/" && method === "GET") {
    const leads =
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND status = 'new'")
        .bind(tenant.id)
        .first<{ n: number }>())?.n ?? 0;
    const today = new Date().toISOString().slice(0, 10);
    await rollupDay(env, tenant.id, today);
    const day =
      (await env.DB.prepare(
        `SELECT pageviews, uniques, sessions, converts_form, converts_tel, converts_mailto, converts_maps
         FROM analytics_daily WHERE tenant_id = ? AND day = ?`,
      )
        .bind(tenant.id, today)
        .first<{
          pageviews: number;
          uniques: number;
          sessions: number;
          converts_form: number;
          converts_tel: number;
          converts_mailto: number;
          converts_maps: number;
        }>()) ?? {
        pageviews: 0,
        uniques: 0,
        sessions: 0,
        converts_form: 0,
        converts_tel: 0,
        converts_mailto: 0,
        converts_maps: 0,
      };
    const live = await liveVisitors(env, tenant.id);
    const converts =
      day.converts_form + day.converts_tel + day.converts_mailto + day.converts_maps;
    let pending = 0;
    try {
      pending =
        (await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM update_jobs WHERE tenant_id = ? AND status IN ('queued','running','preview')`,
        )
          .bind(tenant.id)
          .first<{ n: number }>())?.n ?? 0;
    } catch {
      pending = 0;
    }
    return html(
      page({
        title: "Overview · Vitris",
        session,
        path: "/app",
        ...noticeFrom(request),
        body: `<div class="top"><div>
            <h1>${escapeHtml(tenant.name)}</h1>
            <p class="muted">Public preview · <a href="/preview/${escapeHtml(tenant.slug)}/">Open site</a>
              · <a href="/app/analytics">Analytics</a></p>
          </div></div>
          <div class="live card">
            <div class="live__head">
              <span class="live__dot" aria-hidden="true"></span>
              <strong>${live.total}</strong>
              <span class="muted">on the site now</span>
            </div>
          </div>
          <div class="kpis kpis--dense">
            <div class="card"><span class="muted">New leads</span><strong>${leads}</strong></div>
            <div class="card"><span class="muted">Views today</span><strong>${day.pageviews}</strong></div>
            <div class="card"><span class="muted">Visitors today</span><strong>${day.uniques}</strong></div>
            <div class="card"><span class="muted">Conversions today</span><strong>${converts}</strong></div>
            <div class="card"><span class="muted">Open update jobs</span><strong>${pending}</strong></div>
          </div>
          <p><a class="btn" href="/app/requests">Request a website update</a></p>`,
      }),
    );
  }

  if (path === "/app/requests" && method === "GET") {
    return renderRequestsPage(env, session, "/app/requests", noticeFrom(request));
  }

  if (path === "/app/requests/decide" && method === "POST") {
    return handleRequestsDecide(env, request, session);
  }

  // Legacy editor routes → requests inbox
  if (path === "/app/site" || path.startsWith("/app/site/")) {
    return redirect("/app/requests");
  }

  if (path === "/app/leads" && method === "GET") {
    const testMode = query(request).get('mode') === 'test';
    const configs = await env.DB.prepare('SELECT config_json FROM contact_forms WHERE tenant_id=?').bind(tenant.id).all<{config_json:string}>();
    const readiness = configs.results.map(row=>{ const c=validateFormConfig(JSON.parse(row.config_json)); const missing=formReadiness(env,c),liveMissing=formReadiness(env,{...c,mode:'live'}); return `<p>${escapeHtml(c.id)}: ${c.mode}${missing.length ? ' — Missing: ' + escapeHtml(missing.join(', ')) : ' — configured'}${liveMissing.length ? '. Live requirements: '+escapeHtml(liveMissing.join(', ')) : ''}</p>`; }).join('');
    const rows = await env.DB.prepare(
      testMode ? "SELECT s.id,s.name,s.email,s.phone,s.message,s.page_path,'test' AS status,s.created_at,s.fields_json,o.status AS notification_status,o.attempts,o.last_error FROM form_submissions s LEFT JOIN form_outbox o ON o.id=s.id AND o.tenant_id=s.tenant_id WHERE s.tenant_id=? AND s.mode='test' ORDER BY s.created_at DESC LIMIT 100" : "SELECT l.id,l.name,l.email,l.phone,l.message,l.page_path,l.status,l.created_at,s.fields_json,o.status AS notification_status,o.attempts,o.last_error FROM leads l LEFT JOIN form_submissions s ON s.id=l.id AND s.tenant_id=l.tenant_id LEFT JOIN form_outbox o ON o.id=l.id AND o.tenant_id=l.tenant_id WHERE l.tenant_id=? ORDER BY l.created_at DESC LIMIT 100",
    )
      .bind(tenant.id)
      .all<{
        id: string;
        name: string;
        email: string;
        phone: string;
        message: string;
        page_path: string | null;
        status: string;
        created_at: string;
        fields_json: string | null;
        notification_status: string | null;
        attempts: number | null;
        last_error: string | null;
      }>();
    const list = (rows.results ?? [])
      .map(
        (row) => `<tr>
        <td>${escapeHtml(row.created_at.slice(0, 16))}</td>
        <td>${escapeHtml(row.name)}<br><span class="muted">${escapeHtml(row.email)} ${escapeHtml(row.phone)}</span></td>
        <td>${escapeHtml(row.message)}${row.fields_json ? `<details><summary>All form fields</summary><pre>${escapeHtml(JSON.stringify(JSON.parse(row.fields_json),null,2))}</pre></details>` : ''}</td>
        <td>
          ${testMode ? 'Test submission' : `<form method="post" action="/app/leads/status">
            <input type="hidden" name="id" value="${escapeHtml(row.id)}">
            <select name="status" onchange="this.form.submit()">
              ${["new", "read", "archived"].map((s) => `<option ${s === row.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </form>`}
        </td>
        <td>${escapeHtml(row.notification_status || 'Legacy — no notification record')}${row.last_error ? `<p>${escapeHtml(row.last_error)}. Check sender, recipient restrictions and provider availability.</p>` : ''}${row.notification_status === 'accepted' ? '<p>Provider accepted; inbox delivery unconfirmed.</p>' : ''}${row.notification_status === 'failed' && session.role === 'owner' ? `<form method="post" action="/app/leads/retry"><input type="hidden" name="id" value="${escapeHtml(row.id)}"><button>Retry notification</button></form>` : ''}</td>
      </tr>`,
      )
      .join("");
    return html(
      page({
        title: "Leads · Vitris",
        session,
        path: "/app/leads",
        ...noticeFrom(request),
        body: `<div class="top"><h1>${testMode ? 'Test submissions' : 'Leads'}</h1><a href="/app/leads">Production</a> · <a href="/app/leads?mode=test">Isolated tests</a></div>${readiness || '<p>No registered contact forms. Existing lead history is preserved.</p>'}
          <div class="card"><table>
            <thead><tr><th>When</th><th>From</th><th>Message</th><th>Status</th><th>Notification</th></tr></thead>
            <tbody>${list || `<tr><td colspan="5" class="muted">No leads yet.</td></tr>`}</tbody>
          </table></div>`,
      }),
    );
  }

  if (path === '/app/leads/retry' && method === 'POST') {
    if (!await formAdminAuthorized(env,request,tenant.id)) return json({error:'unauthorized'},403);
    const body=await readBody(request);
    await retryNotification(env,tenant.id,body.id || '');
    return redirect('/app/leads');
  }

  if (path === "/app/leads/status" && method === "POST") {
    const body = await readBody(request);
    const status = body.status === "read" || body.status === "archived" ? body.status : "new";
    await env.DB.prepare("UPDATE leads SET status = ? WHERE id = ? AND tenant_id = ?")
      .bind(status, body.id, tenant.id)
      .run();
    return redirect("/app/leads?saved=1");
  }

  if (path === "/app/analytics/live" && method === "GET") {
    const live = await liveVisitors(env, tenant.id);
    return json(live);
  }

  if (path === "/app/analytics" && method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    await rollupDay(env, tenant.id, today);
    const range = query(request).get("range") === "7" ? 7 : 30;
    const days = await env.DB.prepare(
      `SELECT day, pageviews, uniques, leads,
              COALESCE(sessions, 0) AS sessions,
              COALESCE(bounces, 0) AS bounces,
              COALESCE(engaged, 0) AS engaged,
              COALESCE(duration_ms, 0) AS duration_ms,
              COALESCE(leave_count, 0) AS leave_count,
              COALESCE(scroll_25, 0) AS scroll_25,
              COALESCE(scroll_50, 0) AS scroll_50,
              COALESCE(scroll_75, 0) AS scroll_75,
              COALESCE(scroll_100, 0) AS scroll_100,
              COALESCE(converts_form, 0) AS converts_form,
              COALESCE(converts_tel, 0) AS converts_tel,
              COALESCE(converts_mailto, 0) AS converts_mailto,
              COALESCE(converts_maps, 0) AS converts_maps,
              COALESCE(engage_nav, 0) AS engage_nav,
              COALESCE(engage_btn, 0) AS engage_btn,
              COALESCE(engage_img, 0) AS engage_img,
              COALESCE(engage_carousel, 0) AS engage_carousel,
              COALESCE(top_paths_json, '[]') AS top_paths_json,
              COALESCE(top_refs_json, '[]') AS top_refs_json,
              COALESCE(channels_json, '[]') AS channels_json,
              COALESCE(devices_json, '[]') AS devices_json,
              COALESCE(hours_json, '[]') AS hours_json,
              COALESCE(top_engage_json, '[]') AS top_engage_json
       FROM analytics_daily
       WHERE tenant_id = ?
       ORDER BY day DESC
       LIMIT ?`,
    )
      .bind(tenant.id, range)
      .all<DailyRow>();
    const live = await liveVisitors(env, tenant.id);
    return html(
      page({
        title: "Analytics · Vitris",
        session,
        path: "/app/analytics",
        body: renderAnalyticsPage({
          range,
          rows: days.results ?? [],
          liveTotal: live.total,
          livePaths: live.paths,
        }),
      }),
    );
  }

  if (path === "/app/domain" && method === "GET") {
    const hosts = await env.DB.prepare("SELECT hostname, kind, pages_domain_status FROM hostnames WHERE tenant_id = ?")
      .bind(tenant.id)
      .all<{ hostname: string; kind: string; pages_domain_status: string | null }>();
    const rows = (hosts.results ?? [])
      .map(
        (h) =>
          `<tr><td>${escapeHtml(h.hostname)}</td><td>${escapeHtml(h.kind)}</td><td>${escapeHtml(h.pages_domain_status || "—")}</td></tr>`,
      )
      .join("");
    const project = tenant.pages_project || `${tenant.slug}`;
    return html(
      page({
        title: "Domain · Vitris",
        session,
        path: "/app/domain",
        ...noticeFrom(request),
        body: `<div class="top"><h1>Custom domain</h1></div>
          <div class="card">
            <p>Point <code>www</code> at your Pages project:</p>
            <p><code>www.example.com CNAME ${escapeHtml(project)}.pages.dev</code></p>
            <p class="muted">Keep apex on a redirect to www. After DNS is set, add the hostname below.</p>
            <form method="post" action="/app/domain">
              <div class="field">
                <label for="hostname">Hostname</label>
                <input id="hostname" name="hostname" type="text" placeholder="www.example.com" required>
              </div>
              <button class="btn" type="submit">Attach domain</button>
            </form>
          </div>
          <div class="card" style="margin-top:1rem">
            <table>
              <thead><tr><th>Hostname</th><th>Kind</th><th>Status</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="3" class="muted">No hostnames yet.</td></tr>`}</tbody>
            </table>
          </div>`,
      }),
    );
  }

  if (path === "/app/domain" && method === "POST") {
    const body = await readBody(request);
    const hostname = (body.hostname || "").trim().toLowerCase();
    if (!hostname) return redirect("/app/domain?error=missing");
    const project = tenant.pages_project || tenant.slug;
    const result = await addPagesDomain(env, project, hostname);
    await env.DB.prepare(
      `INSERT INTO hostnames (hostname, tenant_id, kind, pages_domain_status)
       VALUES (?, ?, 'custom', ?)
       ON CONFLICT(hostname) DO UPDATE SET pages_domain_status = excluded.pages_domain_status`,
    )
      .bind(hostname, tenant.id, result.ok ? "pending" : result.message)
      .run();
    await env.KV.delete(`host:${hostname}`);
    const q = result.ok ? `published=1&msg=${encodeURIComponent(result.message)}` : `error=${encodeURIComponent(result.message)}`;
    return redirect(`/app/domain?${q}`);
  }

  return html(page({ title: "Not found", session, path, body: "<p>Not found.</p>" }), 404);
}
