/**
 * Dormant auto-agent. Intake no longer creates Workflow instances.
 * Kept deployed so we can re-enable later without a schema rewrite.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { ContentTree, SiteConfig, ThemeTokens } from "../../types.ts";
import { defaultTheme } from "../../types.ts";
import { kernelOrigin, type Env } from "../env.ts";
import {
  commitFiles,
  createBranch,
  getFile,
  getMainSha,
  mergeToMain,
  previewUrl,
} from "../github.ts";
import { sendMail } from "../gmail.ts";
import { completePatch } from "../llm.ts";
import { applySitePatch } from "../patch.ts";
import {
  getUpdateJob,
  patchUpdateJob,
  signApproveToken,
  type TenantGithub,
} from "../jobs.ts";

export type SiteUpdateParams = {
  jobId: string;
  tenantId: string;
  prompt: string;
  senderEmail: string;
  mediaKeys?: string[];
};

export type ApprovalEvent = {
  decision: "approve" | "reject";
  actor?: string;
};

type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  pages_project: string;
  github_owner: string;
  github_repo: string;
};

type PatchedFiles = {
  summary: string;
  changedPaths: string[];
  contentJson: string;
  siteJson: string;
  themeJson: string;
};

async function loadTenant(env: Env, tenantId: string): Promise<TenantGithub> {
  const row = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?").bind(tenantId).first<TenantGithub>();
  if (!row) throw new NonRetryableError(`Tenant not found: ${tenantId}`);
  return row;
}

function requireGithub(tenant: TenantGithub): { owner: string; repo: string } {
  if (!tenant.github_owner || !tenant.github_repo) {
    throw new NonRetryableError(`Tenant ${tenant.slug} has no github_owner/github_repo`);
  }
  return { owner: tenant.github_owner, repo: tenant.github_repo };
}

async function waitForPreview(url: string, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (res.ok) {
        const text = await res.text();
        if (text.includes("</html>") || text.includes("</HTML>")) return true;
      }
    } catch {
      /* keep polling */
    }
  }
  return false;
}

function asRecord<T extends Record<string, unknown>>(value: unknown): T {
  if (!value || typeof value !== "object") throw new Error("Expected object from workflow step");
  return value as T;
}

export class SiteUpdateWorkflow extends WorkflowEntrypoint<Env, SiteUpdateParams> {
  async run(event: WorkflowEvent<SiteUpdateParams>, step: WorkflowStep) {
    const { jobId, tenantId, prompt, senderEmail, mediaKeys = [] } = event.payload;
    const env = this.env;

    await step.do("mark-running", async () => {
      await patchUpdateJob(env, jobId, {
        status: "running",
        workflow_instance_id: event.instanceId,
      });
      return { ok: true as const };
    });

    const tenant = asRecord<TenantInfo>(
      await step.do("load-tenant", async () => {
        const row = await loadTenant(env, tenantId);
        const gh = requireGithub(row);
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          pages_project: row.pages_project || row.slug,
          github_owner: gh.owner,
          github_repo: gh.repo,
        };
      }),
    );

    if (!env.GITHUB_TOKEN) {
      throw new NonRetryableError("GITHUB_TOKEN is not configured");
    }
    const gh = { token: env.GITHUB_TOKEN, owner: tenant.github_owner, repo: tenant.github_repo };

    // Pass file texts (strings) through the step boundary — Workflow Serializable rejects deep ContentTree.
    const rawFiles = asRecord<{ contentText: string; siteText: string; themeText: string }>(
      await step.do(
        "fetch-state",
        { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "2 minutes" },
        async () => {
          const [siteFile, themeFile] = await Promise.all([
            getFile(gh, "site.json", "main"),
            getFile(gh, "theme/defaults.json", "main"),
          ]);
          let contentText = "{}";
          try {
            contentText = (await getFile(gh, "content/defaults.json", "main")).text;
          } catch {
            contentText = "{}";
          }
          return {
            contentText,
            siteText: siteFile.text,
            themeText: themeFile.text,
          };
        },
      ),
    );

    const mediaUrls = mediaKeys.map((key) => `${kernelOrigin(env)}/assets/${key}`);

    const patched = asRecord<PatchedFiles>(
      await step.do(
        "llm-patch",
        { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" },
        async () => {
          const content = JSON.parse(rawFiles.contentText) as ContentTree;
          const site = JSON.parse(rawFiles.siteText) as SiteConfig;
          const theme = { ...defaultTheme, ...(JSON.parse(rawFiles.themeText) as ThemeTokens) };
          const patch = await completePatch(env, {
            prompt,
            content,
            site,
            theme,
            mediaUrls,
          });
          const result = applySitePatch({ content, site, theme }, patch);
          return {
            summary: result.summary,
            changedPaths: result.changedPaths,
            contentJson: `${JSON.stringify(result.content, null, 2)}\n`,
            siteJson: `${JSON.stringify(result.site, null, 2)}\n`,
            themeJson: `${JSON.stringify(result.theme, null, 2)}\n`,
          };
        },
      ),
    );

    const branch = `update-${jobId}`;

    await step.do(
      "branch-and-commit",
      { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "3 minutes" },
      async () => {
        const mainSha = await getMainSha(gh, "main");
        await createBranch(gh, branch, mainSha);
        const files: Array<{ path: string; content: string }> = [];
        if (patched.changedPaths.includes("content/defaults.json")) {
          files.push({ path: "content/defaults.json", content: patched.contentJson });
        }
        if (patched.changedPaths.includes("site.json")) {
          files.push({ path: "site.json", content: patched.siteJson });
        }
        if (patched.changedPaths.includes("theme/defaults.json")) {
          files.push({ path: "theme/defaults.json", content: patched.themeJson });
        }
        if (files.length === 0) {
          throw new NonRetryableError("LLM produced no file changes");
        }
        await commitFiles(gh, branch, `vitris: ${patched.summary.slice(0, 72)}`, files);
        await patchUpdateJob(env, jobId, { branch, summary: patched.summary });
        return { branch, files: files.map((f) => f.path) };
      },
    );

    const preview = previewUrl(tenant.pages_project, branch);

    await step.sleep("wait-pages-build", "45 seconds");

    const ready = asRecord<{ ok: boolean; url: string }>(
      await step.do(
        "poll-preview",
        { retries: { limit: 1, delay: "10 seconds" }, timeout: "10 minutes" },
        async () => {
          const ok = await waitForPreview(preview, 8);
          return { ok, url: preview };
        },
      ),
    );

    if (!ready.ok) {
      await step.sleep("wait-pages-build-2", "60 seconds");
      await step.do("poll-preview-2", async () => {
        const ok = await waitForPreview(preview, 10);
        return { ok, url: preview };
      });
    }

    await step.do("notify-preview", async () => {
      await patchUpdateJob(env, jobId, {
        status: "preview",
        preview_url: preview,
        summary: patched.summary,
      });
      const approve = await signApproveToken(env, jobId, "approve");
      const reject = await signApproveToken(env, jobId, "reject");
      const origin = kernelOrigin(env);
      const approveUrl = `${origin}/approve?job=${encodeURIComponent(jobId)}&exp=${approve.exp}&sig=${approve.sig}`;
      const rejectUrl = `${origin}/reject?job=${encodeURIComponent(jobId)}&exp=${reject.exp}&sig=${reject.sig}`;
      const recipients = [senderEmail];
      if (env.OPERATOR_NOTIFY_EMAIL && env.OPERATOR_NOTIFY_EMAIL.toLowerCase() !== senderEmail.toLowerCase()) {
        recipients.push(env.OPERATOR_NOTIFY_EMAIL);
      }
      const text = [
        `Hi — Vitris prepared a preview for ${tenant.name}.`,
        "",
        `Summary: ${patched.summary}`,
        "",
        `Preview: ${preview}`,
        "",
        `Approve (publish to live): ${approveUrl}`,
        `Reject: ${rejectUrl}`,
        "",
        "This approve link is signed and expires in 7 days. Do not forward it casually.",
        "",
        `Job: ${jobId}`,
        `Branch: ${branch}`,
      ].join("\n");
      await sendMail(env, {
        to: recipients,
        subject: `[Vitris] Preview ready: ${tenant.name}`,
        text,
      });
      return { sent: recipients };
    });

    let decision: ApprovalEvent;
    try {
      const evt = await step.waitForEvent<ApprovalEvent>("approval", {
        type: "approval",
        timeout: "7 days",
      });
      const payload = (evt as { payload?: ApprovalEvent }).payload;
      decision = payload ?? (evt as unknown as ApprovalEvent);
      if (!decision?.decision) throw new Error("Missing approval decision");
    } catch (err) {
      if (err instanceof Error && err.message === "Missing approval decision") {
        await step.do("mark-bad-event", async () => {
          await patchUpdateJob(env, jobId, { status: "failed", error: err.message });
          return { ok: true as const };
        });
        return { status: "failed", jobId };
      }
      await step.do("mark-expired", async () => {
        await patchUpdateJob(env, jobId, { status: "failed", error: "Approval timed out" });
        return { ok: true as const };
      });
      return { status: "expired", jobId };
    }

    if (decision.decision !== "approve") {
      await step.do("mark-rejected", async () => {
        await patchUpdateJob(env, jobId, { status: "rejected" });
        await sendMail(env, {
          to: [senderEmail],
          subject: `[Vitris] Update rejected: ${tenant.name}`,
          text: `The preview for job ${jobId} was rejected. Branch ${branch} was left in GitHub for review.`,
        });
        return { ok: true as const };
      });
      return { status: "rejected", jobId };
    }

    await step.do(
      "merge-main",
      { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "3 minutes" },
      async () => {
        await patchUpdateJob(env, jobId, { status: "approved" });
        await mergeToMain(gh, branch, `vitris: publish ${jobId} — ${patched.summary.slice(0, 60)}`);
        await patchUpdateJob(env, jobId, { status: "merged" });
        const to = [senderEmail, ...(env.OPERATOR_NOTIFY_EMAIL ? [env.OPERATOR_NOTIFY_EMAIL] : [])].filter(
          (v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i,
        );
        await sendMail(env, {
          to,
          subject: `[Vitris] Live: ${tenant.name}`,
          text: [
            `Your update is merging to main and deploying to production.`,
            "",
            `Summary: ${patched.summary}`,
            `Job: ${jobId}`,
          ].join("\n"),
        });
        return { ok: true as const };
      },
    );

    await step.do("finalize", async () => {
      const job = await getUpdateJob(env, jobId);
      return { status: job?.status ?? "merged" };
    });

    return { status: "merged", jobId, preview };
  }
}
