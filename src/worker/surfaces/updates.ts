import { escapeHtml } from "../../html.ts";
import { readSession, type Session } from "../auth.ts";
import { kernelOrigin, type Env } from "../env.ts";
import { html, json, readBody, redirect, sameOriginMutation } from "../http.ts";
import {
  findAuthorizedSender,
  getUpdateJob,
  insertUpdateJob,
  listAllUpdateJobs,
  listUpdateJobs,
  patchUpdateJob,
  type UpdateJob,
  type UpdateJobStatus,
} from "../jobs.ts";
import { tenantById } from "../tenant.ts";
import { page } from "../ui/layout.ts";

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "In Cursor",
  preview: "Preview",
  approved: "Approved",
  merged: "Live",
  rejected: "Rejected",
  failed: "Failed",
};

function ticketCopyPrompt(job: UpdateJob, slug: string, github?: { owner: string | null; repo: string | null }): string {
  const repo =
    github?.owner && github?.repo ? `${github.owner}/${github.repo}` : "(site repo)";
  return [
    `Fulfill this Vitris client request in the ${slug} site repo (${repo}).`,
    `Follow AGENTS.md and agent/PROMPT.md (preview eval after edits; push update/<short-id>).`,
    `Job ${job.id} from ${job.sender_email}.`,
    "",
    job.prompt,
    "",
    "Work on a preview branch (update/<short-id>), push, then paste the Pages preview URL back on this ticket.",
  ].join("\n");
}

function operatorActions(job: UpdateJob, actionPath: string): string {
  if (job.status === "merged" || job.status === "rejected") return "—";
  const id = escapeHtml(job.id);
  const start =
    job.status === "queued"
      ? `<button class="btn" name="action" value="start" type="submit">Start in Cursor</button>`
      : "";
  const previewFields =
    job.status === "queued" || job.status === "running" || job.status === "preview"
      ? `<label class="muted" for="preview-${id}">Preview URL</label>
         <input id="preview-${id}" name="preview_url" type="url" placeholder="https://update-….pages.dev" value="${escapeHtml(job.preview_url || "")}">
         <button class="btn" name="action" value="preview" type="submit">Save preview</button>`
      : "";
  const done =
    job.status === "preview" || job.status === "running"
      ? `<button class="btn" name="action" value="done" type="submit">Mark live</button>`
      : "";
  const reject = `<button class="btn" name="action" value="reject" type="submit" style="background:#fff;color:inherit;border:1px solid var(--line,#d5dee3)">Reject</button>`;
  return `<form method="post" action="${escapeHtml(actionPath)}" style="display:grid;gap:.4rem;min-width:14rem">
    <input type="hidden" name="job" value="${id}">
    ${start}
    ${previewFields}
    ${done}
    ${reject}
  </form>`;
}

export async function handleApproveReject(_env: Env, request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/approve" && path !== "/reject") return null;
  return html(
    page({
      title: "Manual publish · Vitris",
      error: "Automatic approve links are disabled.",
      body: `<div class="login"><div class="card">
        <p>Site updates are fulfilled in Cursor and published from GitHub. Sign in to <a href="/app/requests">requests</a> to see ticket status.</p>
      </div></div>`,
    }),
    410,
  );
}

export async function handleUpdatesApi(env: Env, request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/updates") return null;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const session = await readSession(env, request);
  if (session && !sameOriginMutation(request)) return json({error:'Invalid request origin'},403);

  if (!session) {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      prompt?: string;
      slug?: string;
      token?: string;
    } | null;
    if (!body?.prompt) return json({ error: "prompt required" }, 400);
    if (!env.DEPLOY_TOKEN || body.token !== env.DEPLOY_TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }
    const auth = await findAuthorizedSender(env, body.email || "", body.slug);
    if (!auth) return json({ error: "Unknown sender" }, 403);
    const jobId = crypto.randomUUID();
    await insertUpdateJob(env, {
      id: jobId,
      tenantId: auth.tenant.id,
      senderEmail: auth.email,
      prompt: body.prompt,
    });
    return json({ ok: true, jobId, status: "queued" });
  }

  const form = await readBody(request);
  const prompt = (form.prompt || "").trim();
  if (!prompt) {
    return redirect("/app/requests?error=" + encodeURIComponent("Prompt required."));
  }

  const jobId = crypto.randomUUID();
  await insertUpdateJob(env, {
    id: jobId,
    tenantId: session.tenantId,
    senderEmail: session.email,
    prompt,
  });
  return redirect("/app/requests?sent=1");
}

function jobRowHtml(
  job: UpdateJob,
  opts: {
    operator: boolean;
    slug: string;
    github?: { owner: string | null; repo: string | null };
    actionPath: string;
    siteLabel?: string;
  },
): string {
  const preview = job.preview_url
    ? `<a href="${escapeHtml(job.preview_url)}" target="_blank" rel="noopener">Preview</a>`
    : "—";
  const actions = opts.operator ? operatorActions(job, opts.actionPath) : "—";
  const repo =
    opts.github?.owner && opts.github?.repo
      ? `<p class="muted" style="margin:.25rem 0 0">${escapeHtml(`${opts.github.owner}/${opts.github.repo}`)}</p>`
      : "";
  const siteCell = opts.siteLabel
    ? `<td>${escapeHtml(opts.siteLabel)}<br><span class="muted">${escapeHtml(opts.slug)}</span></td>`
    : "";
  return `<tr>
    ${siteCell}
    <td>${escapeHtml(job.created_at.slice(0, 16))}<br><span class="muted">${escapeHtml(job.sender_email)}</span></td>
    <td>${escapeHtml(STATUS_LABEL[job.status] || job.status)}</td>
    <td><pre style="white-space:pre-wrap;max-width:28rem;font:inherit;margin:0">${escapeHtml(job.prompt)}</pre>${repo}</td>
    <td>${preview}</td>
    <td>
      ${opts.operator ? `<button type="button" class="btn" style="margin-bottom:.4rem" data-copy="${encodeURIComponent(ticketCopyPrompt(job, opts.slug, opts.github))}">Copy for Cursor</button>` : ""}
      ${actions}
    </td>
  </tr>`;
}

const COPY_SCRIPT = `<script>
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(decodeURIComponent(btn.getAttribute("data-copy") || ""));
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = "Copy for Cursor"; }, 1500);
      } catch (e) {}
    });
  });
</script>`;

export async function renderRequestsPage(
  env: Env,
  session: Session,
  path: string,
  notices: { notice?: string; error?: string },
): Promise<Response> {
  const tenant = await tenantById(env, session.tenantId);
  if (!tenant) {
    return html(page({ title: "Missing", session, path, error: "Tenant missing.", body: "<p>No tenant.</p>" }), 500);
  }
  const jobs = await listUpdateJobs(env, session.tenantId);
  const operator = session.role === "operator";
  const github = { owner: tenant.github_owner ?? null, repo: tenant.github_repo ?? null };
  const rows = jobs
    .map((job) =>
      jobRowHtml(job, {
        operator,
        slug: tenant.slug,
        github,
        actionPath: "/app/requests/decide",
      }),
    )
    .join("");

  const hint = operator
    ? `<p class="muted">Open the client’s site repo in Cursor, paste the copied prompt, push a preview branch, then save the Pages URL here. Cross-tenant inbox: <a href="/ops/inbox">Operator inbox</a>.</p>`
    : `<p class="muted">We handle updates in the site repo and send you a preview before anything goes live. You can also email your Vitris updates address.</p>`;

  return html(
    page({
      title: "Requests · Vitris",
      session,
      path,
      ...notices,
      body: `<div class="top"><div>
          <h1>Website requests</h1>
          ${hint}
        </div></div>
        <form method="post" action="/api/updates" class="card">
          <div class="field">
            <label for="prompt">What should we update?</label>
            <textarea id="prompt" name="prompt" rows="5" required placeholder="e.g. Update Saturday hours to close at 4 PM and add a banner about our fall discount."></textarea>
          </div>
          <button class="btn" type="submit">Submit request</button>
        </form>
        <div class="card" style="margin-top:1rem">
          <h2>Tickets</h2>
          <table>
            <thead><tr><th>When</th><th>Status</th><th>Request</th><th>Preview</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5" class="muted">No requests yet.</td></tr>`}</tbody>
          </table>
        </div>
        ${operator ? COPY_SCRIPT : ""}
        <p class="muted" style="margin-top:1rem">Backend: ${escapeHtml(kernelOrigin(env))}</p>`,
    }),
  );
}

export async function renderOperatorInbox(env: Env, session: Session): Promise<Response> {
  const jobs = await listAllUpdateJobs(env);
  const table = jobs
    .map((job) =>
      jobRowHtml(job, {
        operator: true,
        slug: job.tenant_slug,
        github: { owner: job.github_owner, repo: job.github_repo },
        actionPath: "/ops/inbox",
        siteLabel: job.tenant_name,
      }),
    )
    .join("");

  return html(
    page({
      title: "Inbox · Vitris",
      session,
      path: "/ops/inbox",
      body: `<div class="top"><div>
          <h1>Update inbox</h1>
          <p class="muted">Tickets from <a href="/app/requests">/app/requests</a> and inbound email. Fulfill in the client Cursor repo, push a preview branch, paste the URL, then email the client yourself.</p>
        </div></div>
        <div class="card">
          <table>
            <thead><tr><th>Site</th><th>When</th><th>Status</th><th>Request</th><th>Preview</th><th></th></tr></thead>
            <tbody>${table || `<tr><td colspan="6" class="muted">No tickets.</td></tr>`}</tbody>
          </table>
        </div>
        ${COPY_SCRIPT}`,
    }),
  );
}

export async function handleRequestsDecide(env: Env, request: Request, session: Session): Promise<Response> {
  if (session.role !== "operator") {
    return redirect("/app/requests?error=" + encodeURIComponent("Only the operator can update tickets."));
  }
  const body = await readBody(request);
  const jobId = (body.job || "").trim();
  const job = await getUpdateJob(env, jobId);
  if (!job) {
    return redirect("/app/requests?error=" + encodeURIComponent("Job not found."));
  }
  // Operators may manage any tenant ticket from /app if they know the id; ops inbox is the usual path.
  const result = await applyTicketAction(env, job, body.action, body.preview_url);
  const back = request.headers.get("referer")?.includes("/ops/inbox") ? "/ops/inbox" : "/app/requests";
  return redirect(result.ok ? `${back}?saved=1` : `${back}?error=${encodeURIComponent(result.message)}`);
}

export async function applyTicketAction(
  env: Env,
  job: UpdateJob,
  action: string | undefined,
  previewUrlRaw?: string,
): Promise<{ ok: boolean; message: string }> {
  const preview_url = (previewUrlRaw || "").trim() || undefined;
  if (action === "start") {
    await patchUpdateJob(env, job.id, { status: "running" });
    return { ok: true, message: "Marked in progress." };
  }
  if (action === "preview") {
    if (!preview_url) return { ok: false, message: "Preview URL required." };
    await patchUpdateJob(env, job.id, { status: "preview", preview_url });
    return { ok: true, message: "Preview saved." };
  }
  if (action === "done") {
    const fields: { status: UpdateJobStatus; preview_url?: string } = { status: "merged" };
    if (preview_url) fields.preview_url = preview_url;
    await patchUpdateJob(env, job.id, fields);
    return { ok: true, message: "Marked live." };
  }
  if (action === "reject") {
    await patchUpdateJob(env, job.id, { status: "rejected" });
    return { ok: true, message: "Rejected." };
  }
  return { ok: false, message: "Unknown action." };
}
