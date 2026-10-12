export const COOKIE_COMPLIANCE_PATH = "/cookie-compliance";

export const COOKIE_COMPLIANCE_FOOTER_LINK = {
  label: "Cookie compliance",
  href: COOKIE_COMPLIANCE_PATH,
} as const;

const BODY = [
  "This website is powered by Vitris. Analytics run on the site’s own domain — there are no third-party ad or analytics tags.",
  "If you allow analytics cookies, we set a first-party cookie named vitris_vid (about 13 months). It is a random visitor id so return visits can be counted without knowing who you are. We also keep a short-lived session id in session storage while you browse.",
  "With that id we record page views, time on page, scroll depth, clicks on navigation and buttons, live presence while the tab is open, and core conversions such as form submits, phone, email, and map links. Form submissions may include the visitor id when present.",
  "We do not sell this data. Site owners see aggregated reports in their Vitris dashboard so they can improve the site.",
  "If your browser sends Global Privacy Control or Do Not Track, we do not set the analytics cookie and we do not send live presence pings. That hit may still be counted in a cookieless way for that day only.",
  "Essential site cookies (for example an owner login session on the Vitris app) are separate from this public-site analytics cookie and are not controlled by the banner on this page.",
];

/**
 * Kernel-owned cookie compliance body (no site components).
 * Sites should link here from their footer: /cookie-compliance
 */
export function cookieComplianceHtml(siteName: string): string {
  const paras = BODY.map((p) => `<p>${p}</p>`).join("\n");
  return `<main id="main" tabindex="-1" class="c-cookie-page">
  <div class="wrap">
    <h1>Cookie compliance</h1>
    <p>First-party analytics on ${escapeText(siteName)}, and how to control them.</p>
    <h2>What we store</h2>
    ${paras}
    <h2>Change your preference</h2>
    <p>Use Accept to allow the analytics cookie, or Reject to clear it and stop future analytics cookies and live pings in this browser. Your choice is saved in a first-party preference cookie named vitris_cc. You can return here anytime to change it.</p>
    <div class="c-cookie-page__actions">
      <button type="button" class="btn" data-vitris-cc="accept" data-cookie-accept>Accept analytics cookies</button>
      <button type="button" class="btn-ghost" data-vitris-cc="reject" data-cookie-reject>Reject analytics cookies</button>
    </div>
  </div>
</main>`;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @deprecated Editor-era merge — kept as no-op helpers for transitional imports. */
export function withCookieComplianceSite<T extends { pages?: unknown }>(site: T): T {
  return site;
}
