/** Map pages/ relative file path to a public URL path. */
export function fileToPath(relFile: string): string {
  const normalized = relFile.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === "index.html") return "/";
  if (normalized.endsWith("/index.html")) {
    return `/${normalized.slice(0, -"/index.html".length)}`;
  }
  if (normalized.endsWith(".html")) {
    return `/${normalized.slice(0, -".html".length)}`;
  }
  return `/${normalized}`;
}

/** Title-case a path segment for default page titles. */
export function defaultTitleFromPath(path: string): string {
  if (path === "/") return "Home";
  const last = path.replace(/\/$/, "").split("/").pop() || "Page";
  return last
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}
