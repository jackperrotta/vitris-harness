#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { save } from "../src/agent/artifacts.ts";
import { previewServer, previewIdentity } from "../src/build/serve.ts";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("vitris-preview --site SITE [--port PORT]\nServe SITE/dist locally. Without --site, SITE is the current directory. --help/-h prints this usage without starting a server or writing preview metadata.");
  process.exit(0);
}
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(arg("--site") || "."), dist = join(root, "dist"), port = Number(arg("--port") || 0);
if (!existsSync(join(dist, "index.html"))) throw new Error("Build a homepage before starting preview");
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
const server = previewServer(dist);
await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", done); });
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
save(join(root, "agent/preview-server.json"), { pid: process.pid, url, identity: previewIdentity(dist) });
console.log(`Local preview: ${url}`);
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop); process.on("SIGTERM", stop);
