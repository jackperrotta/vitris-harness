import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { preferBundledToolArgs } from "./agent/kernel-commands.ts";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { bin: Record<string, string> };

test("advertised package bins are bundled JavaScript", () => {
  for (const [name, rel] of Object.entries(pkg.bin)) {
    assert.match(rel, /^bin\/.+\.js$/, `${name} points at ${rel}`);
    assert.equal(existsSync(join(root, rel)), true, `${rel} is missing; run npm run build:cli`);
    const source = readFileSync(join(root, rel), "utf8");
    assert.equal(source.includes("ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING"), false);
  }
});

test("Windows npm wrappers can invoke every advertised bin", () => {
  for (const name of Object.keys(pkg.bin)) {
    const source = readFileSync(join(root, pkg.bin[name]!), "utf8");
    assert.ok(source.startsWith("#!/usr/bin/env node"), `${name} needs a Node shebang for the npm .cmd wrapper`);
  }
});

test("bundled tool args survive mixed path separators", () => {
  const mixed = `${root.replaceAll("\\", "/")}/scripts/harvest.ts`;
  const args = preferBundledToolArgs(root, ["--experimental-strip-types", mixed, "--no-prompt"]);
  assert.equal(args.some(arg => arg.includes("vitris-harvest.js")), true);
  assert.equal(args.includes("--experimental-strip-types"), false);
});

test("installed-style invocation of vitris-build does not type-strip", () => {
  const result = spawnSync(process.execPath, [join(root, "bin/vitris-build.js"), "--site", join(root, "templates/site"), "--out", join(mkdtempSync(join(tmpdir(), "vitris-bin-")), "dist"), "--slug", "bin-smoke"], {
    encoding: "utf8",
    cwd: root,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(output.includes("ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING"), false, output);
  assert.equal(result.status, 0, output);
});
