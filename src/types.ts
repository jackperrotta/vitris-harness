export type MotionStrength = "off" | "whisper" | "editorial" | "noticeable";

export type RevealFrom = "up" | "down" | "left" | "right";

export type MotionConfig = {
  strength?: MotionStrength;
  /** Cascade children marked [data-reveal-child] */
  stagger?: boolean;
  /** Enter direction. Default `up` (fade-up). */
  from?: RevealFrom;
};

/** Thin site-wide facts. Page composition lives in pages/*.html. */
export type SiteConfig = {
  name: string;
  slug?: string;
  siteId?: string;
  sourceFormatVersion?: number;
  capabilities?: string[];
  /** Site-wide default for scroll reveal; page instances may override */
  motion?: MotionConfig;
  /** Versioned opt-in. Explicit off overrides legacy and new instance behavior. */
  scrollMotion?: { version: 1; policy: "enabled" | "off" };
  /** New authoring contract; historical sites omit it, managed upgrade never adds it. */
  motionComposition?: { version: 2; routes: "all-authored" | string[] };
  /** Design-run instrumentation; omitted from ordinary single-site authoring. */
  designRun?: { runId?: string; candidateId?: string };
  /** Optional LocalBusiness JSON-LD hints. Address, not email alone, selects LocalBusiness. */
  telephone?: string;
  email?: string;
  address?: string;
  /** Explicit schema type. Defaults to LocalBusiness only when address is present. */
  businessType?: string;
  environment?: "preview" | "production";
  indexing?: "index" | "noindex";
  /** Pinned knowledge release for sites created with this kernel. */
  knowledgeRelease?: string;
};

export type ThemeTokens = {
  colorBg: string;
  colorText: string;
  colorMuted: string;
  colorAccent: string;
  colorAccentText: string;
  colorSurface: string;
  /** Secondary surface (subtle cards, muted bands). */
  colorSurface2: string;
  colorBorder: string;
  colorFocus: string;
  fontBody: string;
  fontDisplay: string;
  radius: string;
  /** Larger radius for media / elevated cards. */
  radiusLg: string;
  /** Pill radius for `.btn` / `.btn-outline`. Cards keep `radius`. */
  radiusPill: string;
  maxWidth: string;
  /** Opt-in type scale and rhythm. Omitted values retain legacy compiler defaults. */
  typeStep0?: string;
  typeStep1?: string;
  typeStep2?: string;
  typeStep3?: string;
  typeStep4?: string;
  typeStep5?: string;
  sectionY?: string;
};

/** @deprecated Editor-era content tree — dormant patch/workflow only. */
export type ContentTree = Record<string, unknown>;

export type CatalogEntry = {
  html: string;
  css: string;
  island: string | null;
};

export type Catalog = Record<string, CatalogEntry>;

/** A discovered page after frontmatter parse. */
export type PageSource = {
  /** URL path: `/`, `/about`, `/blog/post` */
  path: string;
  /** Relative path under pages/, e.g. `index.html`, `blog/post.html` */
  file: string;
  title: string;
  description?: string;
  indexing?: "index" | "noindex";
  lang?: string;
  /** Raw HTML body (authoring tags + content) */
  body: string;
};

export type CompiledPage = {
  path: string;
  title: string;
  description?: string;
  indexing?: "index" | "noindex";
  lang?: string;
  /** Flattened HTML body fragments (no document shell) */
  bodyHtml: string;
  /** Component names used on this page */
  used: string[];
  /** Whether any section has motion enabled */
  usesMotion: boolean;
  motionTargets?: import("./compile/scroll-motion.ts").MotionTarget[];
  /** Whether a lead form is present */
  usesLeadForm: boolean;
};

export const defaultTheme: ThemeTokens = {
  colorBg: "#F7F4EF",
  colorText: "#1A1714",
  colorMuted: "#5C574F",
  colorAccent: "#B44A2C",
  colorAccentText: "#FFFFFF",
  colorSurface: "#FFFFFF",
  colorSurface2: "#EFEAE3",
  colorBorder: "#E4DDD2",
  colorFocus: "#B44A2C",
  fontBody: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  fontDisplay: "ui-serif, Georgia, 'Times New Roman', serif",
  radius: "8px",
  radiusLg: "16px",
  radiusPill: "999px",
  maxWidth: "1120px",
};

export const themeFields: { key: keyof ThemeTokens; label: string; kind: "color" | "text" }[] = [
  { key: "colorBg", label: "Background", kind: "color" },
  { key: "colorSurface", label: "Surface", kind: "color" },
  { key: "colorSurface2", label: "Surface 2", kind: "color" },
  { key: "colorText", label: "Text", kind: "color" },
  { key: "colorMuted", label: "Muted text", kind: "color" },
  { key: "colorAccent", label: "Accent", kind: "color" },
  { key: "colorAccentText", label: "Accent text", kind: "color" },
  { key: "colorBorder", label: "Border", kind: "color" },
  { key: "colorFocus", label: "Focus ring", kind: "color" },
];
