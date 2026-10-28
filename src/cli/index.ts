import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { EventStream, determineOutputMode } from "./events.ts";
import { EXIT_CODES, type CommandResult, type ExitCode } from "./types.ts";
import { runDoctor } from "./doctor.ts";
import { createSite } from "./site-create.ts";
import { runSite } from "./run.ts";
import { workflowArgvFromFlags } from "./workflow-argv.ts";
import { refineSite, refinePrepare, refineVerify, refineAmend } from "./refine.ts";
import { upgradeSite } from "./upgrade.ts";
import { statusSite } from "./status.ts";
import { resumeSite, cancelSite } from "./lifecycle.ts";
import { importFeedback, synthesizeSite } from "./feedback.ts";
import { verifySite } from "./verify.ts";
import { previewSite } from "./preview.ts";
import { deploySite } from "./deploy.ts";
import { shareSite } from "./share.ts";
import { explainStage } from "../knowledge/explain.ts";
import { formsCommand } from "./forms.ts";
import { adminCommand } from './admin.ts';
import { findHarnessRoot } from "./root.ts";
import { siteInputsFromFlags } from '../agent/site-inputs.ts';

function parseArgs(args: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [k, ...v] = key.split("=");
        flags[k!] = v.join("=");
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      command.push(arg);
    }
    i++;
  }

  return { command, flags };
}

function resolvePrecedence(flags: Record<string, string | boolean>, siteRoot?: string): Record<string, string | boolean> {
  const merged: Record<string, string | boolean> = {};

  // 1. launch.json defaults if present
  if (siteRoot && existsSync(resolve(siteRoot, "launch.json"))) {
    try {
      const launch = JSON.parse(readFileSync(resolve(siteRoot, "launch.json"), "utf8")) as Record<string, unknown>;
      if (typeof launch.ownerEmail === "string") merged.owner = launch.ownerEmail;
      if (typeof launch.slug === "string") merged.slug = launch.slug;
      if (typeof launch.name === "string") merged.name = launch.name;
    } catch {}
  }

  // 2. Config file if passed via --config
  if (flags.config && typeof flags.config === "string") {
    try {
      const configPath = resolve(flags.config);
      if (existsSync(configPath)) {
        const cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
        for (const [k, v] of Object.entries(cfg)) {
          if (typeof v === "string" || typeof v === "boolean") merged[k] = v;
        }
      }
    } catch {}
  }

  // 3. Environment variables
  if (process.env.VITRIS_SITE) merged.site = process.env.VITRIS_SITE;
  if (process.env.VITRIS_ADAPTER) merged.adapter = process.env.VITRIS_ADAPTER;
  if (process.env.VITRIS_MODEL) merged.model = process.env.VITRIS_MODEL;
  if (process.env.CLOUDFLARE_API_TOKEN) merged.cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (process.env.CLOUDFLARE_ACCOUNT_ID) merged.cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  // 4. CLI Flags (highest precedence)
  for (const [k, v] of Object.entries(flags)) {
    merged[k] = v;
  }

  return merged;
}

export async function runCli(argv: string[]): Promise<number> {
  const { command, flags } = parseArgs(argv);

  // Validate --json and --events mutual exclusivity
  let outputMode: "text" | "json" | "events";
  try {
    outputMode = determineOutputMode({
      json: !!flags.json,
      events: !!flags.events,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return EXIT_CODES.CONFIG_OR_CLI_ERROR;
  }

  const stream = new EventStream(outputMode);

  if (flags.version || flags.v) {
    stream.log(`@tryvitris/website-harness v${JSON.parse(readFileSync(resolve(findHarnessRoot(), "package.json"), "utf8")).version}`);
    return EXIT_CODES.SUCCESS;
  }

  if (flags.help || flags.h || command.length === 0) {
    const help = `Vitris � agent harness for building and verifying websites

Usage: vitris <command> [options]

Commands:
  admin setup|status|verify             Separate business admin; explicit cloud rollout
  forms inspect|setup|status            Inventory, provision, and check contact forms
  doctor                                Check environment, dependencies, and site health
  site create --dir DIR --slug SLUG    Scaffold a new customer site repo (--from URL or --blank)
  run                                   Execute single-variant, --creative, or 5-variant run
  refine --request "..."                Refine an existing site with classified scope
  refine prepare --request "..."        Analyze impact, capture baseline, and stage a refinement
  refine amend --request-id ID --scope direction,business --reason "..."   Expand classification, retaining baseline
  refine verify [--request-id ID]       Verify refinement impact across facts, links, slots, and layout
  status [--run ID]                     Check current execution and lock status
  resume [--run ID]                     Resume an interrupted workflow or design run
  cancel [--run ID]                     Gracefully cancel an active run PID and release locks
  feedback import --file FILE           Import structured comparison feedback for a design run
  synthesize [--feedback FILE]          Synthesize candidate directions into final representative
  verify                                Verify compilation and evaluate all quality gates
  preview [--port PORT]                 Serve local verified dist preview
  deploy [--provider cloudflare]        Deploy site to Cloudflare Pages with smoke verification
    --quick                            Build and deploy, skipping review and quality gates
  cloudflare [doctor|whoami|login]      Cloudflare credentials and permissions diagnostics
  share [--run ID]                      Start local preview or design comparison review share
  knowledge explain --stage STAGE       Show the knowledge that stage would load. No model call.

Options:
  --mode redesign|preserve               New site workflow (default: redesign)
  --harness SPEC                        Starter dependency version, tarball, or file: path
  --template ID                         Catalog template ID, name, or hosted URL; continue automatically
  --template-release RELEASE            Optional template revision
  --content TEXT                        Additional business content or instructions
  --content-file FILE                   UTF-8 content file (instead of --content)
  --admin                               New-site opt-in: prepare sibling admin next steps
  --backend-origin URL                  Backend origin for a new site
  --site DIR                            Site directory path (default: current directory)
  --json                                Output single structured JSON result at completion
  --events                              Stream newline-delimited JSON (NDJSON) events
  --dry-run                             Validate inputs and environment without making changes
`;
    stream.log(help);
    return EXIT_CODES.SUCCESS;
  }

  const siteRoot = typeof flags.site === "string" ? flags.site : undefined;
  const opts = resolvePrecedence(flags, siteRoot);
  const dryRun = !!flags["dry-run"] || !!flags.dryRun;

  const abortController = new AbortController();
  const onSig = () => {
    abortController.abort();
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const primary = command[0];
  const secondary = command[1];

  let result: CommandResult;

  try {
    if (primary === 'admin') {
      const value = (key: string) => typeof opts[key] === 'string' ? opts[key] as string : undefined;
      result = await adminCommand(secondary || 'status', { site: siteRoot, dir: value('dir'), domain: value('domain'), website: value('website'), tenant: value('tenant'), backendOrigin: value('backend-origin'), plan: !!opts.plan, apply: !!opts.apply, leadWrite: !!opts['lead-write'], grants: value('grants'), out: value('out'), dryRun });
    } else if (primary === 'forms') {
      const list=(name:string)=>typeof opts[name]==='string'?(opts[name] as string).split(',').map(s=>s.trim()).filter(Boolean):undefined;
      result=await formsCommand(secondary || 'status',{site:siteRoot,tenant:typeof opts.tenant==='string'?opts.tenant:undefined,backendOrigin:typeof opts['backend-origin']==='string'?opts['backend-origin']:undefined,origins:list('origins'),recipients:list('recipients'),mode:typeof opts.mode==='string'?opts.mode:undefined,apply:!!opts.apply,testKeys:!!opts['test-keys'],cloudflare:!!opts.cloudflare,worker:typeof opts.worker==='string'?opts.worker:undefined,config:typeof opts['forms-config']==='string'?opts['forms-config']:undefined,dryRun});
    } else if (primary === "doctor") {
      result = await runDoctor({
        site: typeof opts.site === "string" ? opts.site : undefined,
        provider: typeof opts.provider === "string" ? opts.provider : undefined,
        dryRun,
      });
    } else if (primary === "site" && secondary === "create") {
      result = await createSite({
        ...siteInputsFromFlags(opts),
        admin: !!opts.admin,
        dir: typeof opts.dir === "string" ? opts.dir : "",
        slug: typeof opts.slug === "string" ? opts.slug : "",
        name: typeof opts.name === "string" ? opts.name : undefined,
        from: typeof opts.from === "string" ? opts.from : undefined,
        mode: opts.mode as "redesign" | "preserve" | undefined,
        blank: !!opts.blank,
        owner: typeof opts.owner === "string" ? opts.owner : undefined,
        backendOrigin: typeof opts["backend-origin"] === "string" ? opts["backend-origin"] : typeof opts["kernel-origin"] === "string" ? opts["kernel-origin"] : undefined,
        harnessSpec: typeof opts.harness === "string" ? opts.harness : typeof opts.kernel === "string" ? opts.kernel : undefined,
        force: !!opts.force,
        dryRun,
      });
    } else if (primary === "run") {
      result = await runSite({
        ...siteInputsFromFlags(opts),
        site: typeof opts.site === "string" ? opts.site : undefined,
        variants: opts.variants !== undefined ? String(opts.variants) : undefined,
        creativeProfile: !!opts.creative,
        adapter: typeof opts.adapter === "string" ? opts.adapter : undefined,
        model: typeof opts.model === "string" ? opts.model : undefined,
        theme: typeof opts.theme === "string" ? opts.theme : undefined,
        themeScope: opts["theme-scope"] === "all" ? "all" : opts["theme-scope"] === "one" ? "one" : undefined,
        restartFrom: typeof opts["restart-from"] === "string" ? opts["restart-from"] : undefined,
        reason: typeof opts.reason === "string" ? opts.reason : undefined,
        dryRun,
        signal: abortController.signal,
        onLog: (line) => stream.log(line),
        workflowArgv: workflowArgvFromFlags(opts),
      });
    } else if (primary === "refine") {
      if (secondary === "prepare") {
        result = await refinePrepare({
          site: typeof opts.site === "string" ? opts.site : undefined,
          request: typeof opts.request === "string" ? opts.request : "",
          scope: typeof opts.scope === "string" ? opts.scope : undefined,
          requestId: typeof opts["request-id"] === "string" ? opts["request-id"] : typeof opts.requestId === "string" ? opts.requestId : undefined,
          planFile: typeof opts.plan === 'string' ? opts.plan : undefined,
          dryRun,
        });
      } else if (secondary === "amend") {
        result=await refineAmend({site:typeof opts.site==='string'?opts.site:undefined,requestId:typeof opts['request-id']==='string'?opts['request-id']:'',scope:typeof opts.scope==='string'?opts.scope:'',reason:typeof opts.reason==='string'?opts.reason:'',dryRun});
      } else if (secondary === "verify") {
        result = await refineVerify({
          site: typeof opts.site === "string" ? opts.site : undefined,
          requestId: typeof opts["request-id"] === "string" ? opts["request-id"] : typeof opts.requestId === "string" ? opts.requestId : undefined,
          dryRun,
        });
      } else {
        result = await refineSite({
          site: typeof opts.site === "string" ? opts.site : undefined,
          request: typeof opts.request === "string" ? opts.request : "",
          scope: typeof opts.scope === "string" ? opts.scope : undefined,
          evidence: typeof opts.evidence === "string" ? opts.evidence : undefined,
          dryRun,
          signal: abortController.signal,
          onLog: (line) => stream.log(line),
          workflowArgv: workflowArgvFromFlags(opts),
        });
      }
    } else if (primary === "upgrade") {
      result = upgradeSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        target: typeof opts.target === "string" ? opts.target : undefined,
        to: typeof opts.to === "string" ? opts.to : undefined,
        apply: !!opts.apply, rollback: !!opts.rollback, recover: !!opts.recover,
      });
    } else if (primary === "status") {
      result = await statusSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        runId: typeof opts.run === "string" ? opts.run : undefined,
      });
    } else if (primary === "resume") {
      result = await resumeSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        runId: typeof opts.run === "string" ? opts.run : undefined,
        dryRun,
        signal: abortController.signal,
        onLog: (line) => stream.log(line),
        workflowArgv: workflowArgvFromFlags(opts),
      });
    } else if (primary === "cancel") {
      result = await cancelSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        runId: typeof opts.run === "string" ? opts.run : undefined,
        dryRun,
      });
    } else if (primary === "feedback" && secondary === "import") {
      result = await importFeedback({
        site: typeof opts.site === "string" ? opts.site : undefined,
        runId: typeof opts.run === "string" ? opts.run : undefined,
        file: typeof opts.file === "string" ? opts.file : "",
        dryRun,
      });
    } else if (primary === "synthesize") {
      result = await synthesizeSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        runId: typeof opts.run === "string" ? opts.run : undefined,
        feedback: typeof opts.feedback === "string" ? opts.feedback : undefined,
        dryRun,
        onLog: (line) => stream.log(line),
      });
    } else if (primary === "verify") {
      result = await verifySite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        remoteUrl: typeof opts.remote === "string" ? opts.remote : undefined,
        dryRun,
      });
    } else if (primary === "preview") {
      result = await previewSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        port: opts.port ? Number(opts.port) : undefined,
        dryRun,
        wait: !dryRun && !flags["no-wait"],
        signal: abortController.signal,
        onLog: (line) => stream.log(line),
      });
    } else if (primary === "deploy") {
      result = await deploySite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        provider: "cloudflare",
        environment: opts.environment === "production" ? "production" : "preview",
        branch: typeof opts.branch === "string" ? opts.branch : undefined,
        quick: flags.quick === true,
        dryRun,
        signal: abortController.signal,
        onLog: (line) => stream.log(line),
      });
    } else if (primary === "cloudflare") {
      const sub = secondary || "doctor";
      if (sub === "doctor") {
        result = await runDoctor({ provider: "cloudflare", operation: "pages" });
      } else if (sub === "whoami") {
        const probe = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "whoami"], { encoding: "utf8" });
        result = {
          ok: probe.status === 0,
          exitCode: probe.status === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.CONFIG_OR_CLI_ERROR,
          summary: probe.stdout || probe.stderr,
        };
      } else if (sub === "login") {
        const probe = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "login"], { stdio: "inherit" });
        result = {
          ok: probe.status === 0,
          exitCode: probe.status === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.GENERIC_ERROR,
          summary: probe.status === 0 ? "Wrangler login completed" : "Wrangler login failed",
        };
      } else {
        result = {
          ok: false,
          exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
          error: `Unknown cloudflare subcommand: ${sub}. Supported: doctor, whoami, login`,
        };
      }
    } else if (primary === "knowledge" && secondary === "explain") {
      const explained = explainStage(resolve(typeof opts.site === "string" ? opts.site : "."), typeof opts.stage === "string" ? opts.stage : "direction");
      result = { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: explained.text, data: explained };
    } else if (primary === "share") {
      result = await shareSite({
        site: typeof opts.site === "string" ? opts.site : undefined,
        runId: typeof opts.run === "string" ? opts.run : undefined,
        port: opts.port ? Number(opts.port) : undefined,
        dryRun,
        tunnel: !!flags.tunnel || !!flags["quick-tunnel"],
        wait: !dryRun && !flags["no-wait"],
        signal: abortController.signal,
        onLog: (line) => stream.log(line),
      });
    } else {
      result = {
        ok: false,
        exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
        error: `Unknown command: ${command.join(" ")}. Run 'vitris --help' for usage.`,
      };
    }
  } catch (err) {
    result = {
      ok: false,
      exitCode: (err as { exitCode?: ExitCode }).exitCode || EXIT_CODES.GENERIC_ERROR,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }

  stream.finish(result);
  return result.exitCode;
}
