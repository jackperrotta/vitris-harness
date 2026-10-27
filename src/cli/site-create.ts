import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { save } from "../agent/artifacts.ts";
import { initialState, parseGraphYaml } from "../agent/graph.ts";
import { gatherBlankOnboard, persistOnboard } from "../../scripts/onboard/run.ts";
import { findHarnessRoot } from "./root.ts";
import { stripAgentRuntimeHistory } from "../agent/kit-runtime.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";
import { recordManagedKit } from "../upgrade/kit.ts";
import { persistSiteInputs, resolveSiteInputsLive, type SiteInputOptions } from '../agent/site-inputs.ts';

const harnessRoot = findHarnessRoot();

export type CreateSiteOptions = SiteInputOptions & {
  dir: string;
  slug: string;
  name?: string;
  from?: string;
  mode?: "redesign" | "preserve";
  blank?: boolean;
  owner?: string;
  backendOrigin?: string;
  harnessSpec?: string;
  /** @deprecated Use backendOrigin. */
  kernelOrigin?: string;
  /** @deprecated Use harnessSpec. */
  kernelSpec?: string;
  force?: boolean;
  dryRun?: boolean;
};

export async function createSite(opts: CreateSiteOptions): Promise<CommandResult<{ dest: string; slug: string; name: string }>> {
  const dir = opts.dir;
  const slug = (opts.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const name = opts.name || slug;
  const fromArg = opts.from;
  const blank = !!opts.blank;
  const mode = opts.mode || "redesign";
  const ownerEmail = opts.owner || "";
  const backendOrigin = (opts.backendOrigin || opts.kernelOrigin || "").replace(/\/$/, "");
  const harnessSpec = opts.harnessSpec || opts.kernelSpec || JSON.parse(readFileSync(join(harnessRoot, "package.json"), "utf8")).version;

  if (!dir || !slug) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "createSite requires --dir and --slug",
    };
  }

  if (!["redesign", "preserve"].includes(mode) || (mode === "preserve" && (!fromArg || blank))) {
    return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "Use --mode redesign|preserve. Preserve mode requires --from URL and cannot use --blank." };
  }
  if (mode === "preserve") {
    try { const url = new URL(fromArg!); if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error(); }
    catch { return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "Preserve --from must be an HTTP(S) URL without credentials" }; }
  }
  if (blank && fromArg) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "Use either --from or --blank, not both",
    };
  }

  let inputs;
  try {
    inputs = await resolveSiteInputsLive(opts);
    if (mode === 'preserve' && (inputs.template || inputs.content !== undefined)) throw Error('Template and additional content inputs require redesign mode');
  } catch (error) {
    return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: error instanceof Error ? error.message : String(error) };
  }

  const dest = resolve(dir);
  if (existsSync(dest) && existsSync(join(dest, "package.json")) && !opts.force) {
    return {
      ok: false,
      exitCode: EXIT_CODES.PRECONDITION_FAILED,
      error: `Refusing to overwrite existing package.json in ${dest}. Pass --force to override.`,
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would scaffold site ${slug} (${name}) at ${dest}`,
      data: { dest, slug, name },
    };
  }

  mkdirSync(dest, { recursive: true });
  cpSync(join(harnessRoot, "templates", "site"), dest, { recursive: true });
  // npm omits .gitignore files from tarballs; ship the template under a plain filename.
  renameSync(join(dest, "gitignore"), join(dest, ".gitignore"));
  cpSync(join(harnessRoot, "agent"), join(dest, "agent"), { recursive: true });
  stripAgentRuntimeHistory(join(dest, "agent"));
  recordManagedKit(dest, harnessRoot);
  mkdirSync(join(dest, "design-system"), { recursive: true });
  cpSync(join(harnessRoot, "design-system", "MASTER.md"), join(dest, "design-system", "MASTER.md"));

  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.name = slug;
  pkg.dependencies["@tryvitris/website-harness"] = harnessSpec;
  if (mode === "preserve") {
    pkg.scripts.go = "node ./node_modules/@tryvitris/website-harness/bin/vitris.js run --site .";
    pkg.scripts.eval = "node ./node_modules/@tryvitris/website-harness/bin/vitris.js verify --site .";
    pkg.scripts.deploy = "node ./node_modules/@tryvitris/website-harness/bin/vitris.js deploy --site . --environment preview";
    pkg.scripts["deploy:quick"] = "node ./node_modules/@tryvitris/website-harness/bin/vitris.js deploy --site . --environment preview --quick";
    pkg.scripts["verify:browser"] = pkg.scripts.eval;
  }
  for (const [key, value] of Object.entries(pkg.scripts as Record<string, string>)) pkg.scripts[key] = value.replaceAll("__SLUG__", slug);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  for (const file of ["site.json", "README.md", "AGENTS.md"]) {
    const p = join(dest, file);
    if (file === "site.json" && existsSync(p)) {
      const site = JSON.parse(readFileSync(p, "utf8")); site.slug = slug; site.name = name;
      site.siteId = site.siteId || randomUUID(); site.sourceFormatVersion = 1; site.capabilities = backendOrigin ? ["analytics"] : [];
      writeFileSync(p, `${JSON.stringify(site, null, 2)}\n`);
    } else if (existsSync(p)) {
      writeFileSync(p, readFileSync(p, "utf8").replaceAll("__SLUG__", slug).replaceAll("__NAME__", name));
    }
  }

  const launchPath = join(dest, "launch.json");
  const launch = existsSync(launchPath)
    ? (JSON.parse(readFileSync(launchPath, "utf8")) as Record<string, unknown>)
    : {};
  launch.slug = slug;
  launch.name = name;
  launch.sourceUrl = fromArg || "";
  launch.mode = mode;
  if(mode==='redesign'){launch.themeSelection={version:1,enabled:true};launch.templateAdaptation={version:2};}
  launch.backendOrigin = backendOrigin;
  launch.forms = launch.forms || [];
  launch.ownerEmail = ownerEmail;
  launch.pagesProject = slug;
  launch.github = { owner: "", repo: "" };
  launch.publicOrigin = "";
  writeFileSync(launchPath, `${JSON.stringify(launch, null, 2)}\n`);
  if (mode === "preserve") {
    writeFileSync(join(dest, "README.md"), `# ${name}\n\nPreserved custom website from ${fromArg}.\n\n1. npm install\n2. npx playwright install chromium\n3. npm run go\n4. npm run preview\n5. npm run deploy (temporary Cloudflare preview)\n\nCustom source: preserved/. Verification: agent/reviews/preserve.json. See AGENTS.md and the installed harness docs/PRESERVE.md. Run vitris forms inspect and vitris forms setup to register and connect contact forms; backendOrigin alone does not enable submission or notifications. See docs/CONTACT-FORMS.md.\n`);
    writeFileSync(join(dest, "AGENTS.md"), `# ${name} preservation\n\nRun npm run go to capture and verify the existing client-facing site. Keep its appearance, copy, routes, and interactions. Custom HTML, CSS, assets, and runtime live in preserved/. No redesign, design-system injection, or creative graph is used while launch.json mode is preserve.\n\nRepair source in preserved/ when agent/reviews/preserve.json reports a failure; run npm run go again. Never change reference screenshots or hashes to make a check pass. Do not overwrite source by recapturing. onboarding/preserve.json records the source and captured routes. Contact forms require explicit registration and public launch.json forms bindings. backendOrigin alone does not enable delivery. Default previews show a notice without submitting. See docs/CONTACT-FORMS.md.\n\nUse npm run deploy for a temporary Cloudflare preview after verification. Production and customer domains are outside this mode. Scaffold a later redesign separately from the same source URL.\n`);
  }

  const workflow = join(dest, ".github", "workflows", "deploy.yml");
  if (existsSync(workflow)) {
    if (mode === "preserve") {
      writeFileSync(workflow, `name: Preserve preview\non: workflow_dispatch\njobs:\n  preview:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n      - run: npm ci\n      - run: npx playwright install --with-deps chromium\n      - run: npm run deploy\n        env:\n          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n`);
    } else writeFileSync(workflow, readFileSync(workflow, "utf8").replaceAll("__SLUG__", slug));
  }

  const gathered = await gatherBlankOnboard({ slug, name, noPrompt: true });
  gathered.brief.sourceUrl = fromArg || "";
  if (fromArg) {
    gathered.brief.warnings = [
      "Harvest pending — from this site repo: npm install && npx playwright install chromium && npm run go (or npm run harvest).",
    ];
  }
  persistOnboard(dest, gathered.brief, {
    pages: gathered.pages,
    copyMarkdown: gathered.copyMarkdown,
  });
  persistSiteInputs(dest, inputs);

  const graphPath = join(dest, "agent", "graph.yaml");
  if (existsSync(graphPath)) {
    const graph = parseGraphYaml(readFileSync(graphPath, "utf8"));
    const state = initialState(graph);
    if (!fromArg && state.nodes.harvest) {
      state.nodes.harvest = { status: "done", attempts: 0 };
    }
    save(join(dest, "agent", "STATE.json"), state);
  }

  return {
    ok: true,
    exitCode: EXIT_CODES.SUCCESS,
    summary: `Created site ${slug} at ${dest}`,
    data: { dest, slug, name },
  };
}
