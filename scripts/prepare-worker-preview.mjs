import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for a Worker Preview`);
  return value;
}

const d1Id = required("CF_PREVIEW_D1_DATABASE_ID");
const kvId = required("CF_PREVIEW_KV_NAMESPACE_ID");
const r2Name = required("CF_PREVIEW_R2_BUCKET");
const aeDataset = required("CF_PREVIEW_AE_DATASET");
const sessionSecret = required("CF_PREVIEW_SESSION_SECRET");
const approveSecret = required("CF_PREVIEW_APPROVE_SECRET");
if (sessionSecret.length < 32 || approveSecret.length < 32) throw new Error("Preview secrets must be at least 32 characters");
const production = {
  d1: config.d1_databases[0].database_id,
  kv: config.kv_namespaces[0].id,
  r2: config.r2_buckets[0].bucket_name,
  ae: config.analytics_engine_datasets[0].dataset,
};
for (const [kind, value] of Object.entries({ d1: d1Id, kv: kvId, r2: r2Name, ae: aeDataset })) {
  if (value === production[kind]) throw new Error(`Preview ${kind} resource matches production`);
}

config.previews = {
  vars: { VITRIS_PREVIEW: "1" },
  observability: { enabled: true },
  d1_databases: [{ binding: "DB", database_name: required("CF_PREVIEW_D1_DATABASE_NAME"), database_id: d1Id, migrations_dir: "migrations" }],
  kv_namespaces: [{ binding: "KV", id: kvId }],
  r2_buckets: [{ binding: "R2", bucket_name: r2Name }],
  analytics_engine_datasets: [{ binding: "AE", dataset: aeDataset }],
};

const output = resolve(root, ".wrangler-preview.jsonc");
writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared ${output} with non-production Preview bindings`);

const secretOutput = resolve(root, ".wrangler-preview.secrets.json");
writeFileSync(secretOutput, `${JSON.stringify({ SESSION_SECRET: sessionSecret, APPROVE_SECRET: approveSecret })}\n`, { mode: 0o600 });
console.log(`Prepared ${secretOutput} for deployment`);
