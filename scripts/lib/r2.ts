import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export const R2_BUCKET = "vitris-assets";

export function loadDevVars(root: string): void {
  let text = "";
  try {
    text = readFileSync(join(root, ".dev.vars"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
  if (process.env.CF_API_TOKEN && !process.env.CLOUDFLARE_API_TOKEN) {
    process.env.CLOUDFLARE_API_TOKEN = process.env.CF_API_TOKEN;
  }
  if (process.env.CF_ACCOUNT_ID && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  }
}

export function assetsOrigin(): string {
  return (process.env.ASSETS_ORIGIN || process.env.VITRIS_BACKEND_ORIGIN || process.env.KERNEL_ORIGIN || "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
  );
}

export function publicAssetUrl(r2Key: string): string {
  return `${assetsOrigin()}/assets/${r2Key}`;
}

export function putLocalR2(root: string, key: string, file: string, contentType: string): void {
  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${R2_BUCKET}/${key}`,
    `--file=${file}`,
    `--content-type=${contentType}`,
    "--force",
    "--local",
    "--persist-to",
    ".wrangler/state",
  ];
  const result = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  if (result.status !== 0) throw new Error(`Failed to put ${key} (local R2)`);
}

export async function putRemoteR2(key: string, file: string, contentType: string): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
  if (!account || !token) throw new Error("Missing Cloudflare account credentials for remote R2");
  const body = readFileSync(file);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${R2_BUCKET}/objects/${key}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": contentType,
      },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Remote R2 put ${key} failed (${res.status}): ${text.slice(0, 180)}`);
  }
}

export function writeScratchFile(path: string, data: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}
