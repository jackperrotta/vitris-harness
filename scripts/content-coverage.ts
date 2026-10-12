#!/usr/bin/env node
import { resolve, join } from "node:path";
import { save } from "../src/agent/artifacts.ts";
import { coverageAudit } from "../src/agent/production-quality.ts";
if(process.argv.includes("--help")){console.log("vitris-content-coverage --site SITE; compute current source-to-rendered coverage evidence during content-review");process.exit(0);}
const at=process.argv.indexOf("--site");
if(at<0||!process.argv[at+1]) throw new Error("Pass --site SITE");
const root=resolve(process.argv[at+1]!);
const audit=coverageAudit(root);
save(join(root,"agent/reviews/content-coverage.json"),audit);
console.log(JSON.stringify(audit,null,2));
if(!audit.passed) process.exitCode=1;
