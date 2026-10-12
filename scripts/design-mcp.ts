#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDesignMcp } from "../src/agent/design-mcp.ts";

const kernel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--site");
const site = i < 0 ? process.env.VITRIS_SITE : process.argv[i + 1];
await serveDesignMcp({ kernel, site });
