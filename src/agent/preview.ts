import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { json } from "./artifacts.ts";
import { preferBundledToolArgs } from "./kernel-commands.ts";
import { previewIdentity } from "../build/serve.ts";
export async function ensurePreview(root: string, kernel: string): Promise<string> {
  const receipt = join(root, "agent/preview-server.json"), expected = previewIdentity(join(root, "dist"));
  const current = async () => {
    try {
      const saved = json<{ url: string; identity: string }>(receipt);
      const url = new URL(saved.url);
      if (url.hostname !== "127.0.0.1" || url.protocol !== "http:" || saved.identity !== expected) return null;
      const response = await fetch(`${saved.url}/__vitris_preview`, { signal: AbortSignal.timeout(500) });
      return (await response.json() as { identity: string }).identity === expected ? saved.url : null;
    } catch { return null; }
  };
  const previous = existsSync(receipt) ? await current() : null;
  if (previous) return previous;
  const child = spawn(process.execPath, preferBundledToolArgs(kernel, ["--experimental-strip-types", join(kernel, "scripts/preview.ts"), "--site", root]), { cwd: root, windowsHide: true, detached: true, stdio: "ignore" });
  let failure: Error | undefined;
  child.once("error", error => { failure = error; }); child.unref();
  for (let i = 0; i < 50; i++) {
    if (failure) throw failure;
    await new Promise(r => setTimeout(r, 100));
    const url = await current(); if (url) return url;
  }
  throw new Error("Verified dist exists, but the local preview server did not start");
}
