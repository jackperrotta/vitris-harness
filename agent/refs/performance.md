# PerformanceFor built-in tracking, configuration and event coverage, read `analytics.md`. Use `motion.md` for the self-hosted motion runtime and `icons.md` for the full build-time icon catalog. Compile only the features a route uses: static builds select content-addressed route CSS/islands; icons become inline SVG; quiet routes need no motion script. The generated preference page uses base styles and the first-party beacon without site widgets. Verify actual requests rather than adding a second client library to reproduce an existing harness feature.

Ship static HTML, the CSS of components that are used, and islands only when a page needs them. The Vitris starting budgets are project policy: 100 KiB gzip of first-party JavaScript, 100 KiB gzip of CSS, 200 KiB of fonts, and 1.5 MiB initial transfer. They are not Core Web Vitals.

[Core Web Vitals](https://web.dev/articles/vitals) field targets are LCP 2.5s, INP 200ms, and CLS 0.1 at the 75th percentile. A lab run is not field INP. Missing field data is unknown, not a pass. A broken or empty shipped file still blocks.


For scroll motion, use the stage-scoped `motion.md` contract. Choose business-specific scenes and quiet intervals; preserve operator policies. Carry motionPlan v2 for every new/reauthored route (historical v1 remains compatible) from direction/storyboard to unique native/component target IDs, then inspect before/during/after normal and reduced scrolling. Temporal claims require live observations or recordings; agent review is not human preference.

## Responsive delivery and measured acceptance

The standard build generates content-addressed responsive WebP derivatives for local JPEG, PNG, WebP and AVIF img sources. Originals and inventory hashes stay unchanged. Animated files, vectors, authored picture/srcset markup and data-media-optimize="off" retain their delivery. Use data-media-format="avif" for an explicitly reviewed AVIF placement. Remote URLs are never downloaded by this step. Cache files under .vitris/cache/media are disposable and never part of source evidence.

Mark the route's actual above-fold image data-media-priority="critical"; the compiler emits loading="eager" and fetchpriority="high". Mark later images data-media-priority="deferred" for lazy/low priority. Native lazy loading can fetch nearby images, so all photographs still need small derivatives. Do not mark every slide critical or hide the heading until fonts/media finish. For inactive overlapping carousel slides, author source activation on selection; verify initial requests in a browser.

Author sizes for the real layout, for example sizes="(min-width: 1000px) 33vw, (min-width: 650px) 50vw, 100vw" for cards. The conservative fallback is 100vw. Derivatives retain the source aspect ratio and transparency; existing CSS object-fit/object-position and reviewed crops remain authoritative. Inspect crops and text contrast on phone and desktop.

New redesign sites enable launch.json performance.enabled with three runs. Final browser verification runs Lighthouse on home, the representative interior and the heaviest built interior; performance.routes adds coverage. Defaults: median mobile performance >=95, LCP <=2500ms, TBT <=200ms, CLS <=0.1 and transfer <=1.5 MiB. Reports bind source, output and launch/storyboard configuration plus hashes of raw Lighthouse JSON. Missing, failed or stale runs block completion. This is a lab gate, not field INP or a promise of a field CWV pass.

Run npm run verify:performance for a standalone local check. Run npm run verify:performance -- --origin https://DEPLOYMENT for a hosted check against the existing local dist. Hosted results have a separate report and never satisfy local-build evidence. vitris deploy performs the hosted check automatically when enabled. Direct wrangler deployments require the hosted command separately.

Existing sites retain their configuration: opt into performance.enabled after planning a managed kit upgrade, then fix measured failures rather than bypassing the gate. Preserve mode keeps its captured appearance and delivery; no image rewrite is silently applied there.

A cover-cropped image can need more source pixels than its CSS width. Author sizes for the effective crop (or a reviewed picture source/crop); final browser checks reject undersized cover images. Do not improve transfer by accepting blurred or changed crops.

Optional launch.json apiChecks entries are {"url":"/api/inquiries/config"} (or an explicit backend URL). Hosted verification performs GET-only JSON contracts and rejects HTTP-200 HTML fallbacks. This does not establish draft saving, submission or email delivery.

For real-user CWV, enable Cloudflare Web Analytics for the site and configure its public webAnalyticsToken in launch.json when manual injection is needed. It is omitted from preview builds. Avoid duplicate dashboard/manual beacon injection. Inspect route/device LCP, INP and CLS in Web Analytics; absent or insufficient visitor data stays unknown. This hook does not provision an account resource or invent field measurements.

The standard build also writes a genuine 404, a working fallback favicon when no icon is authored, absolute sitemap discovery when publicOrigin is configured, consistent trailing-slash links/canonicals, route CSS/islands, separated embedded WOFF fonts, and immutable content-addressed assets. TTF-to-WOFF2 conversion/subsetting and custom SVG simplification remain explicit media authoring tasks; preserve source licenses and map interactions. Configure a reviewed production origin before launch. Review deployments intentionally remain noindex.

For before/after comparisons, pin the same browser executable with CHROME_PATH, record the Lighthouse/browser versions from every raw report, and run serially after other browser work finishes. Preserve failures from other browser versions as diagnostics; never selectively replace valid low samples or relax budgets to finish.

Initialize noncritical footer clocks and expensive Intl formatters when they become visible, cache formatter instances, and stop timers while hidden. Verify real startup tasks and live measurements; fast image delivery does not compensate for blocking JavaScript. For a text LCP, inspect font discovery and preload the exact critical extracted font with matching type/crossorigin settings; preserve the component root and verify a single font request.

Lighthouse gates launch a fresh Chrome profile directly through chrome-launcher, using a single browser controller. Do not attach a Playwright controller to the same measured browser: target/debugger coordination can contaminate main-thread timings. Use Playwright separately for screenshots and interaction checks.
