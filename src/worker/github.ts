/** Gitless GitHub REST helpers — no git CLI, no filesystem. */

export const ALLOWED_WRITE_PATHS = new Set([
  "site.json",
  "theme/defaults.json",
]);

export type GithubFile = {
  path: string;
  sha: string;
  text: string;
};

export type GithubCommitFile = {
  path: string;
  content: string;
};

export type GithubClientOpts = {
  token: string;
  owner: string;
  repo: string;
};

function assertAllowedPath(path: string): void {
  const clean = path.replace(/^\.\//, "");
  if (!ALLOWED_WRITE_PATHS.has(clean)) {
    throw new Error(`Disallowed write path: ${path}`);
  }
}

async function githubFetch(
  opts: GithubClientOpts,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${opts.token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "vitris-backend");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`https://api.github.com${path}`, { ...init, headers });
  return res;
}

async function githubJson<T>(
  opts: GithubClientOpts,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await githubFetch(opts, path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub ${init.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function b64Decode(b64: string): string {
  const normalized = b64.replace(/\n/g, "");
  const bin = atob(normalized);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function getFile(
  opts: GithubClientOpts,
  path: string,
  ref = "main",
): Promise<GithubFile> {
  const data = await githubJson<{
    sha: string;
    content?: string;
    encoding?: string;
  }>(opts, `/repos/${opts.owner}/${opts.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`);
  if (!data.content || data.encoding !== "base64") {
    throw new Error(`Unexpected contents response for ${path}`);
  }
  return { path, sha: data.sha, text: b64Decode(data.content) };
}

export async function getMainSha(opts: GithubClientOpts, branch = "main"): Promise<string> {
  const data = await githubJson<{ object: { sha: string } }>(
    opts,
    `/repos/${opts.owner}/${opts.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  return data.object.sha;
}

/** Recursive list of blob paths at a commit SHA. */
export async function listTreeFiles(opts: GithubClientOpts, sha: string): Promise<string[]> {
  const data = await githubJson<{
    tree: { path?: string; type: string }[];
    truncated?: boolean;
  }>(opts, `/repos/${opts.owner}/${opts.repo}/git/trees/${encodeURIComponent(sha)}?recursive=1`);
  if (data.truncated) {
    throw new Error("GitHub tree listing was truncated; repo may be too large for preview fetch.");
  }
  return (data.tree || [])
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => item.path!);
}

export async function createBranch(
  opts: GithubClientOpts,
  branch: string,
  sha: string,
): Promise<void> {
  const res = await githubFetch(opts, `/repos/${opts.owner}/${opts.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (res.status === 422) {
    // Branch may already exist from a retry — verify it points at something.
    const existing = await githubFetch(
      opts,
      `/repos/${opts.owner}/${opts.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    if (existing.ok) return;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createBranch failed: ${res.status} ${text.slice(0, 400)}`);
  }
}

export async function commitFiles(
  opts: GithubClientOpts,
  branch: string,
  message: string,
  files: GithubCommitFile[],
): Promise<{ commitSha: string }> {
  for (const file of files) assertAllowedPath(file.path);

  const headSha = await getMainSha(opts, branch);
  const commit = await githubJson<{ tree: { sha: string } }>(
    opts,
    `/repos/${opts.owner}/${opts.repo}/git/commits/${headSha}`,
  );

  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await githubJson<{ sha: string }>(opts, `/repos/${opts.owner}/${opts.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: utf8ToBase64(file.content), encoding: "base64" }),
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  const tree = await githubJson<{ sha: string }>(opts, `/repos/${opts.owner}/${opts.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: blobs }),
  });

  const newCommit = await githubJson<{ sha: string }>(opts, `/repos/${opts.owner}/${opts.repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [headSha],
    }),
  });

  await githubJson(opts, `/repos/${opts.owner}/${opts.repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });

  return { commitSha: newCommit.sha };
}

export async function mergeToMain(
  opts: GithubClientOpts,
  headBranch: string,
  commitMessage?: string,
): Promise<{ sha: string }> {
  const data = await githubJson<{ sha: string }>(opts, `/repos/${opts.owner}/${opts.repo}/merges`, {
    method: "POST",
    body: JSON.stringify({
      base: "main",
      head: headBranch,
      commit_message: commitMessage || `Merge ${headBranch}`,
    }),
  });
  return { sha: data.sha };
}

export async function deleteBranch(opts: GithubClientOpts, branch: string): Promise<void> {
  const res = await githubFetch(
    opts,
    `/repos/${opts.owner}/${opts.repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`deleteBranch failed: ${res.status} ${text.slice(0, 400)}`);
  }
}

export function previewUrl(pagesProject: string, branch: string): string {
  // Cloudflare Pages lowercases and sanitizes branch subdomain segments.
  const safe = branch.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `https://${safe}.${pagesProject}.pages.dev`;
}
