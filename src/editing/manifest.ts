import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseFragment } from "parse5";
import { files, save } from "../agent/artifacts.ts";
import { sourceRevision } from "../engine/revision.ts";
import { attribute } from "./identity.ts";

export interface EditField {
  id: string;
  route?: string;
  sectionId?: string;
  kind: "text" | "media";
  scope: "instance" | "shared";
  sourceFile: string;
  elementId: string;
}
export interface EditManifest {
  schemaVersion: 1;
  sourceRevision: string;
  fields: EditField[];
  movableSections: Array<{ route: string; id: string; sourceFile: string }>;
  themeTokens: string[];
}

type Node = { nodeName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
const attr = (node: Node, name: string) => attribute(node.attrs, name);

export function generateEditManifest(siteRoot: string): EditManifest {
  const root = resolve(siteRoot);
  const fields: EditField[] = [];
  const movableSections: EditManifest["movableSections"] = [];
  for (const folder of ["pages", "components"] as const) {
    const base = join(root, folder);
    for (const file of files(base).filter(path => path.endsWith(".html"))) {
      const sourceFile = relative(root, file).replaceAll("\\", "/");
      const route = folder === "pages" ? `/${relative(base, file).replaceAll("\\", "/").replace(/(?:\/)?index\.html$/, "").replace(/\.html$/, "")}`.replace(/\/$/, "") || "/" : undefined;
      const schemaPath = folder === "components" ? join(dirname(file), "edit.schema.json") : "";
      const declared = schemaPath && existsSync(schemaPath)
        ? new Set((JSON.parse(readFileSync(schemaPath, "utf8")) as { fields?: Array<{ id: string }> }).fields?.map(field => field.id) || [])
        : undefined;
      const tree = parseFragment(readFileSync(file, "utf8")) as Node;
      const walk = (node: Node, sectionId?: string) => {
        const id = attr(node, "id");
        const section = node.nodeName === "section" && id ? id : sectionId;
        if (route && node.nodeName === "section" && id && attr(node, "data-vitris-movable") !== undefined) movableSections.push({ route, id, sourceFile });
        const fieldId = attr(node, "data-vitris-field");
        const editable = folder === "pages" || Boolean(declared?.has(fieldId || ""));
        if (fieldId && editable) {
          const kind = node.nodeName === "img" ? "media" : node.childNodes?.length === 1 && node.childNodes[0]?.nodeName === "#text" ? "text" : undefined;
          if (kind) fields.push({ id: fieldId, ...(route ? { route } : {}), ...(section ? { sectionId: section } : {}),
            kind, scope: folder === "pages" ? "instance" : "shared", sourceFile, elementId: fieldId });
        }
        for (const child of node.childNodes || []) walk(child, section);
      };
      walk(tree);
    }
  }
  const tokenSchema = join(root, "theme/edit.schema.json");
  const themeTokens = existsSync(tokenSchema)
    ? (JSON.parse(readFileSync(tokenSchema, "utf8")) as { tokens?: string[] }).tokens || [] : [];
  const seen = new Set<string>();
  for (const field of fields) {
    const key = `${field.sourceFile}#${field.id}`;
    if (seen.has(key)) throw new Error(`Duplicate editable field ${key}`);
    seen.add(key);
  }
  const manifest: EditManifest = { schemaVersion: 1, sourceRevision: sourceRevision(root).digest,
    fields: fields.sort((a, b) => `${a.sourceFile}#${a.id}`.localeCompare(`${b.sourceFile}#${b.id}`)),
    movableSections, themeTokens };
  save(join(root, "agent/edit-manifest.json"), manifest);
  return manifest;
}

/** Public browser view omits source paths and internal evidence locations. */
export function publicEditManifest(manifest: EditManifest) {
  return { schemaVersion: 1 as const, sourceRevision: manifest.sourceRevision,
    fields: manifest.fields.map(({ id, route, sectionId, kind, scope }) => ({ id, route, sectionId, kind, scope })),
    movableSections: manifest.movableSections.map(({ route, id }) => ({ route, id })), themeTokens: manifest.themeTokens };
}
