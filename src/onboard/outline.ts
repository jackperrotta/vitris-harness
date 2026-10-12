/** Write human-readable onboarding outline + per-page copy markdown. */

import type { BriefImage, BusinessFacts, OnboardBrief } from "./brief.ts";
import type { ExtractedPage } from "./extract.ts";
import { pageCopySlug } from "./extract.ts";

export function renderPageCopy(page: ExtractedPage): string {
  const lines: string[] = [];
  lines.push(`# ${page.title || page.url}`);
  lines.push("");
  lines.push(`Source: ${page.url}`);
  if (page.description) {
    lines.push("");
    lines.push(`> ${page.description}`);
  }
  if (page.outline.length) {
    lines.push("");
    lines.push("## Outline");
    for (const h of page.outline) lines.push(`- ${h}`);
  }
  if (page.paragraphs.length) {
    lines.push("");
    lines.push("## Copy");
    for (const p of page.paragraphs) {
      lines.push("");
      lines.push(p);
    }
  }
  if (page.lists.length) {
    lines.push("");
    lines.push("## Lists");
    for (const list of page.lists) {
      lines.push("");
      lines.push(`- ${list}`);
    }
  }
  if (page.testimonials.length) {
    lines.push("");
    lines.push("## Testimonials");
    for (const t of page.testimonials) {
      lines.push("");
      lines.push(`> ${t.quote}`);
      if (t.attribution) lines.push(`> — ${t.attribution}`);
    }
  }
  if (page.faqs.length) {
    lines.push("");
    lines.push("## FAQ");
    for (const f of page.faqs) {
      lines.push("");
      lines.push(`**Q:** ${f.question}`);
      lines.push(`**A:** ${f.answer}`);
    }
  }
  if (page.ctas.length) {
    lines.push("");
    lines.push("## CTAs");
    for (const c of page.ctas) {
      lines.push(`- [${c.label}](${c.href || "#"}) (${c.kind})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function buildCopyFiles(pages: ExtractedPage[]): Map<string, { slug: string; markdown: string }> {
  const out = new Map<string, { slug: string; markdown: string }>();
  pages.forEach((page, i) => {
    const slug = pageCopySlug(page.url, i);
    out.set(page.url, { slug, markdown: renderPageCopy(page) });
  });
  return out;
}

function imageLine(img: BriefImage): string {
  const bits = [`**${img.role}**`, `kind=${img.kind}`];
  if (img.mediaType) bits.push(`type=${img.mediaType}`);
  if (img.alt) bits.push(`alt="${img.alt}"`);
  if (img.nearbyHeading) bits.push(`near="${img.nearbyHeading}"`);
  if (img.localPath) bits.push(`use=${img.localPath}`);
  if (img.error) bits.push(`error=${img.error}`);
  return `- ${bits.join(" · ")} — ${img.src || img.sourceUrl}`;
}

export function renderMediaGuide(brief: OnboardBrief): string {
  const ok = brief.images.filter((i) => i.role !== "failed" && i.localPath);
  const hintShortlist = brief.images.filter((i) => i.shortlist);
  const lines: string[] = [];
  lines.push(`# Media guide — ${brief.business.name || brief.slug}`);
  lines.push("");
  lines.push("All successful harvest images live under media/harvest/. The media node owns the complete asset inventory and dispositions. Do not hotlink the old origin.");
  lines.push("");
  if (brief.visual) {
    lines.push(`- **Register (hint):** ${brief.visual.register} — the business and direction nodes reassess`);
    if (brief.visual.signatureSections.length) {
      lines.push(`- **Signature home chapters (hint):** ${brief.visual.signatureSections.join("; ")}`);
    }
    if (brief.visual.stills.length) {
      lines.push(`- **Old-site stills:** ${brief.visual.stills.map((s) => `\`${s}\``).join(", ")}`);
    }
    lines.push("");
  }
  lines.push("## Candidate hints — inspect before selecting");
  lines.push("");
  if (!hintShortlist.length) {
    lines.push("- (pending inspection — account for the full harvest catalog)");
  } else {
    lines.push("_Heuristic hints from harvest (not authoritative):_");
    lines.push("");
    for (const img of hintShortlist) {
      const dims = img.width && img.height ? `${img.width}×${img.height}` : "";
      lines.push(`- \`${img.localPath || img.src}\` — **${img.mediaType || img.role}** ${dims} ${img.caption || img.alt || ""}`.trim());
      if (img.pageUrl) lines.push(`  - from ${img.pageUrl}`);
    }
  }
  lines.push("");
  lines.push("## Harvest catalog");
  lines.push("");
  if (!ok.length) {
    lines.push("- (no images stored — stock fallback later if needed)");
  } else {
    for (const img of ok) {
      lines.push(imageLine(img));
    }
  }
  lines.push("");
  lines.push("## Media treatment");
  lines.push("");
  lines.push("- One LCP still (`fetchpriority=\"high\"`).");
  lines.push("- Select media by narrative purpose and image quality; there is no count quota.");
  lines.push("- Use actual people and project collections where they answer visitor questions.");
  lines.push("- Record use, retain, duplicate, or exclude for every asset, and resolve missing source images.");
  lines.push("");
  return lines.join("\n");
}

export function renderOutline(opts: {
  brief: OnboardBrief;
  business?: BusinessFacts;
}): string {
  const brief = opts.brief;
  const biz = opts.business || brief.business;
  const lines: string[] = [];

  lines.push(`# Onboarding outline — ${biz.name || brief.slug}`);
  lines.push("");
  lines.push(`Source: ${brief.sourceUrl || "(blank)"}`);
  lines.push(`Crawled: ${brief.crawledAt}`);
  lines.push(`Slug: ${brief.slug}`);
  lines.push("");
  lines.push("## Business facts");
  lines.push("");
  lines.push(`- **Name:** ${biz.name || "(missing)"}`);
  lines.push(`- **Phone:** ${biz.phone || "(missing)"}`);
  lines.push(`- **Email:** ${biz.email || "(missing)"}`);
  lines.push(`- **Address:** ${biz.address || "(missing)"}`);
  lines.push(`- **City:** ${biz.city || "(missing)"}`);
  lines.push(`- **Hours:** ${biz.hours.length ? biz.hours.join("; ") : "(missing)"}`);
  lines.push(
    `- **Primary CTA:** ${biz.primaryCta.label || "(missing)"} → ${biz.primaryCta.href || "(missing)"}`,
  );
  if (biz.services.length) {
    lines.push("- **Services:**");
    for (const s of biz.services) {
      lines.push(`  - ${s.name}${s.blurb ? ` — ${s.blurb}` : ""}`);
    }
  } else {
    lines.push("- **Services:** (missing)");
  }
  if (biz.social.length) {
    lines.push("- **Social (from site):**");
    for (const s of biz.social) {
      lines.push(`  - ${s.platform}: ${s.url}`);
    }
  } else {
    lines.push("- **Social:** (none found on-site — complete in the research graph node)");
  }

  if (brief.visual) {
    lines.push("");
    lines.push("## Visual register");
    lines.push("");
    lines.push(`- **Register:** ${brief.visual.register} (trade = photo-led local shop; beauty = lifestyle stills; b2b = product/agency — illustrations, mockups, hover nav OK)`);
    if (brief.visual.signatureSections.length) {
      lines.push(`- **Signature chapters (keep on home, restyled):** ${brief.visual.signatureSections.join("; ")}`);
    }
    if (brief.visual.hints.fontDisplay) {
      lines.push(`- **Display font (self-host if distinctive):** ${brief.visual.hints.fontDisplay}`);
    }
    if (brief.visual.hints.radius) {
      lines.push(`- **Computed button radius:** ${brief.visual.hints.radius}`);
    }
  }

  if (brief.missing.length) {
    lines.push("");
    lines.push("## Gaps");
    lines.push("");
    for (const m of brief.missing) lines.push(`- ${m}`);
  }

  lines.push("");
  lines.push("## Sitemap");
  lines.push("");
  for (const page of brief.pages) {
    const copy = page.copyFile ? ` → copy/${page.copyFile}` : "";
    lines.push(`- [${page.title || page.url}](${page.url})${copy}`);
  }

  lines.push("");
  lines.push("## Image inventory");
  lines.push("");
  const shortlist = brief.images.filter((i) => i.shortlist);
  lines.push("### Must-use shortlist");
  if (shortlist.length) for (const i of shortlist) lines.push(imageLine(i));
  else lines.push("- (none — see full inventory below)");
  lines.push("");
  lines.push("Read **media.md** for captions and the homepage media budget. Prefer `/media/…` paths.");
  lines.push("");
  const logo = brief.images.filter((i) => i.role === "logo");
  const hero = brief.images.filter((i) => i.role === "hero");
  const business = brief.images.filter((i) => i.kind === "business" && i.role !== "logo" && i.role !== "hero");
  const stock = brief.images.filter((i) => i.kind === "stock");
  const generic = brief.images.filter((i) => i.kind === "generic" || i.kind === "unknown");
  const failed = brief.images.filter((i) => i.role === "failed");

  lines.push("### Logo");
  if (logo.length) for (const i of logo) lines.push(imageLine(i));
  else lines.push("- (none classified)");

  lines.push("");
  lines.push("### Hero candidates");
  if (hero.length) for (const i of hero) lines.push(imageLine(i));
  else lines.push("- (none classified)");

  lines.push("");
  lines.push("### Business-specific photos");
  if (business.length) for (const i of business) lines.push(imageLine(i));
  else lines.push("- (none)");

  lines.push("");
  lines.push("### Stock");
  if (stock.length) for (const i of stock) lines.push(imageLine(i));
  else lines.push("- (none)");

  lines.push("");
  lines.push("### Generic / unknown");
  if (generic.length) for (const i of generic) lines.push(imageLine(i));
  else lines.push("- (none)");

  if (failed.length) {
    lines.push("");
    lines.push("### Failed uploads");
    for (const i of failed) lines.push(imageLine(i));
  }

  const testimonials = brief.pages.flatMap((p) => p.testimonials || []);
  const faqs = brief.pages.flatMap((p) => p.faqs || []);
  if (testimonials.length) {
    lines.push("");
    lines.push("## Testimonials found");
    for (const t of testimonials) {
      lines.push(`- “${t.quote.slice(0, 160)}${t.quote.length > 160 ? "…" : ""}”${t.attribution ? ` — ${t.attribution}` : ""}`);
    }
  }
  if (faqs.length) {
    lines.push("");
    lines.push("## FAQs found");
    for (const f of faqs) {
      lines.push(`- **${f.question}** — ${f.answer.slice(0, 120)}${f.answer.length > 120 ? "…" : ""}`);
    }
  }

  if (brief.warnings.length) {
    lines.push("");
    lines.push("## Crawl warnings");
    for (const w of brief.warnings) lines.push(`- ${w}`);
  }

  lines.push("");
  lines.push("## Next (operator / agent)");
  lines.push("");
  lines.push("1. Build and independently review the evidence-backed business interpretation.");
  lines.push("2. Inspect and account for media, then develop and review coherent visual directions.");
  lines.push("3. Follow the graph through storyboard, edited copy, representative pages, browser checks and final critics.");
  lines.push("");

  return lines.join("\n");
}
