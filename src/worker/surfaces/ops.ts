import { escapeHtml } from "../../html.ts";
import { readSession } from "../auth.ts";
import { type Env } from "../env.ts";
import { html, readBody, redirect } from "../http.ts";
import { localServiceContent, localServiceSite, localServiceTheme } from "../seed.ts";
import { getUpdateJob } from "../jobs.ts";
import { applyTicketAction, renderOperatorInbox } from "./updates.ts";
import { page } from "../ui/layout.ts";

export async function handleOps(env: Env, request: Request): Promise<Response> {
  const session = await readSession(env, request);
  if (!session) return redirect("/app/login");
  if (session.role !== "operator") return html(page({ title: "Forbidden", session, error: "Operator only.", body: "<p>You do not have operator access.</p>" }), 403);

  const url = new URL(request.url);
  const path = url.pathname === "/ops" ? "/ops/" : url.pathname;

  if (path === "/ops/" && request.method === "GET") {
    const tenants = await env.DB.prepare(
      "SELECT slug, name, pages_project, github_owner, github_repo, status, created_at FROM tenants ORDER BY created_at DESC",
    ).all<{
      slug: string;
      name: string;
      pages_project: string | null;
      github_owner: string | null;
      github_repo: string | null;
      status: string;
      created_at: string;
    }>();
    const rows = (tenants.results ?? [])
      .map(
        (t) =>
          `<tr>
            <td>${escapeHtml(t.name)}</td>
            <td><a href="/preview/${escapeHtml(t.slug)}/">${escapeHtml(t.slug)}</a></td>
            <td>${escapeHtml(t.pages_project || "—")}</td>
            <td>${t.github_owner && t.github_repo ? escapeHtml(`${t.github_owner}/${t.github_repo}`) : "—"}</td>
            <td>${escapeHtml(t.status)}</td>
          </tr>`,
      )
      .join("");
    return html(
      page({
        title: "Operator · Vitris",
        session,
        path: "/ops",
        body: `<div class="top"><h1>Tenants</h1>
          <p class="muted"><a href="/ops/inbox">Open update inbox</a></p></div>
          <div class="card"><table>
            <thead><tr><th>Name</th><th>Slug</th><th>Pages project</th><th>GitHub</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <form method="post" action="/ops/tenants" class="card" style="margin-top:1rem">
            <h2>Create tenant</h2>
            <div class="field"><label for="name">Name</label><input id="name" name="name" required></div>
            <div class="field"><label for="slug">Slug</label><input id="slug" name="slug" required></div>
            <div class="field"><label for="email">Owner email</label><input id="email" name="email" type="email" required></div>
            <div class="field"><label for="pages_project">Pages project</label><input id="pages_project" name="pages_project"></div>
            <div class="field"><label for="github_owner">GitHub owner</label><input id="github_owner" name="github_owner" placeholder="org-or-user"></div>
            <div class="field"><label for="github_repo">GitHub repo</label><input id="github_repo" name="github_repo" placeholder="site-repo"></div>
            <button class="btn" type="submit">Create</button>
          </form>`,
      }),
    );
  }

  if (path === "/ops/tenants" && request.method === "POST") {
    const body = await readBody(request);
    const slug = (body.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const githubOwner = (body.github_owner || "").trim() || null;
    const githubRepo = (body.github_repo || "").trim() || null;
    if (!slug || !name || !email) return redirect("/ops?error=missing");
    const tenantId = crypto.randomUUID();
    let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
    const userId = user?.id || crypto.randomUUID();
    const stmts = [
      env.DB.prepare(
        `INSERT INTO tenants (id, slug, name, pages_project, github_owner, github_repo, kernel_version, status)
         VALUES (?, ?, ?, ?, ?, ?, '0.1.0', 'active')`,
      ).bind(tenantId, slug, name, body.pages_project || slug, githubOwner, githubRepo),
      env.DB.prepare(`INSERT INTO site_config (tenant_id, json) VALUES (?, ?)`).bind(tenantId, JSON.stringify({ ...localServiceSite, name, slug })),
      env.DB.prepare(`INSERT INTO content (tenant_id, json) VALUES (?, ?)`).bind(tenantId, JSON.stringify(localServiceContent)),
      env.DB.prepare(`INSERT INTO theme (tenant_id, json) VALUES (?, ?)`).bind(tenantId, JSON.stringify(localServiceTheme)),
    ];
    if (!user) stmts.push(env.DB.prepare(`INSERT INTO users (id, email) VALUES (?, ?)`).bind(userId, email));
    stmts.push(env.DB.prepare(`INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, 'owner')`).bind(userId, tenantId));
    await env.DB.batch(stmts);
    return redirect("/ops");
  }

  if (path === "/ops/inbox" && request.method === "GET") {
    return renderOperatorInbox(env, session);
  }

  if (path === "/ops/inbox" && request.method === "POST") {
    const body = await readBody(request);
    const job = await getUpdateJob(env, (body.job || "").trim());
    if (!job) return redirect("/ops/inbox?error=" + encodeURIComponent("Job not found."));
    const result = await applyTicketAction(env, job, body.action, body.preview_url);
    return redirect(
      result.ok ? "/ops/inbox?saved=1" : "/ops/inbox?error=" + encodeURIComponent(result.message),
    );
  }

  return html(page({ title: "Not found", session, path: "/ops", body: "<p>Not found.</p>" }), 404);
}
