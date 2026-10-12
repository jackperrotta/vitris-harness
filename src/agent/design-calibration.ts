import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { json } from "./artifacts.ts";

export const CALIBRATION_PACK_VERSION = "v2";
export const PROBE_TOKEN = "2E6BFF";
export const PROBE_RGB = { r: 0x2e, g: 0x6b, b: 0xff };
export const ACCURACY_PROBE_PHRASE = "Trusted legal help";

export type CalibrationRecord = {
  name: string;
  role: "desktop-first-view" | "mobile-first-view" | "probe";
  sourceUrl?: string;
  capturedAt?: string;
  httpStatus?: number;
  sha256: string;
  file: string;
  notes?: string;
};

export type CalibrationManifest = {
  schemaVersion: 1;
  packVersion: string;
  purpose: string;
  labeledCalibration: false;
  probe: { file: string; expectedToken: string; instruction: string };
  accuracyProbe: { file: string; expectedPhrase: string; sourceUrl: string };
  records: CalibrationRecord[];
};

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function solidPng(r: number, g: number, b: number, size = 24): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function resolveKernelRoot(siteOrKernel: string): string | undefined {
  const env = (process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL)?.trim();
  if (env && existsSync(join(calibrationPackDir(env), "manifest.json"))) return resolve(env);
  let cursor = resolve(siteOrKernel);
  for (let i = 0; i < 8; i++) {
    for (const packageName of ["harness", "kernel"]) {
    const installed = join(cursor, "node_modules", "@vitris", packageName);
    if (existsSync(join(calibrationPackDir(installed), "manifest.json")) &&
        existsSync(join(installed, "package.json"))) return installed;
    }
    if (existsSync(join(calibrationPackDir(cursor), "manifest.json")) && existsSync(join(cursor, "agent/graph.yaml"))) {
      return cursor;
    }
    const pkgPath = join(cursor, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = json<{ name?: string; dependencies?: Record<string, string> }>(pkgPath);
        if (["@vitris/harness", "@vitris/kernel"].includes(pkg.name || "") && existsSync(join(calibrationPackDir(cursor), "manifest.json"))) return cursor;
        const dep = pkg.dependencies?.["@vitris/harness"] || pkg.dependencies?.["@vitris/kernel"];
        if (typeof dep === "string" && dep.startsWith("file:")) {
          const kernel = resolve(cursor, dep.slice("file:".length));
          if (existsSync(join(calibrationPackDir(kernel), "manifest.json"))) return kernel;
        }
      } catch { /* keep walking */ }
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

export function calibrationPackDir(kernel: string): string {
  const current = join(resolve(kernel), "design-system/calibration", CALIBRATION_PACK_VERSION);
  return existsSync(join(current, "manifest.json")) ? current : join(resolve(kernel), "design-system/calibration/v1");
}

export function loadCalibrationManifest(kernel: string): CalibrationManifest {
  return json<CalibrationManifest>(join(calibrationPackDir(kernel), "manifest.json"));
}

export function calibrationPackHash(kernel: string): string {
  const dir = calibrationPackDir(kernel);
  const manifest = loadCalibrationManifest(kernel);
  const hash = createHash("sha256");
  hash.update(readFileSync(join(dir, "manifest.json")));
  for (const record of manifest.records) {
    hash.update(record.file);
    hash.update(readFileSync(join(dir, record.file)));
  }
  return hash.digest("hex");
}

export function verifyCalibrationPack(kernel: string): string[] {
  const errors: string[] = [];
  const dir = calibrationPackDir(kernel);
  if (!existsSync(join(dir, "manifest.json"))) return ["Missing design-system/calibration pack"];
  const manifest = loadCalibrationManifest(kernel);
  if (manifest.schemaVersion !== 1 || !["v1", CALIBRATION_PACK_VERSION].includes(manifest.packVersion)) errors.push("Calibration pack version mismatch");
  if (manifest.labeledCalibration !== false) errors.push("Pack must not claim labeled calibration");
  for (const record of manifest.records) {
    const file = join(dir, record.file);
    if (!existsSync(file)) {
      errors.push(`Missing calibration file: ${record.file}`);
      continue;
    }
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (sha !== record.sha256) errors.push(`Calibration hash mismatch: ${record.file}`);
  }
  return errors;
}

export function calibrationEvidencePath(kernel: string, file: string): string {
  return join(calibrationPackDir(kernel), file).replaceAll("\\", "/");
}

export const resolveHarnessRoot = resolveKernelRoot;
