# Preserve a selected template's choreography

When movement defines the chosen direction, inspect the pinned reference in motion before adapting it. Compare pace, easing, travel, overlap, pauses and incoming/outgoing continuity. A working effect or a static screenshot cannot establish expressive equivalence.

At representative/pages, write `agent/decisions/template-motion.json`: version 1, current selectionHash, pinned HTTPS referenceUrl, and moments with id, kind, intent, width, reference/implementation `{path,target,observe}`, and an explained departure where necessary. Supported kinds are load, marquee, pointer-follow, magnetic, scroll, route, drawer and sequence. Locate defining interactions rather than counting effects. Missing reference targets are failures; correct the plan or explain the actual constraint.

Inspect a genuinely fresh browser session from navigation start, then inspect a repeat visit. First-visit greetings, cover lifts and entrance sequences can finish before network/font settlement: use a `load` moment for them, whose recording starts at navigation rather than after readiness. Follow route cover, label/hold, document handoff, incoming lift and destination settlement as one sequence; matching only the outgoing cover misses a major part of the experience. Also inspect an interior portrait and the biography's individual line offsets. Human feedback that the site still feels weaker reopens refinement even when technical checks pass; record the exact rejected moments and never reuse an earlier positive reaction as acceptance.

Every motion comparison plan requires a fresh-session `load` moment. This requires observing the opening, not adding an entrance effect: when the reference is intentionally still, locate its available opening and explain that preserved stillness as a departure rather than inventing a greeting.

When a reference exposes transition states, each side can specify `requiredPhases` (for example `covering`, `revealing`, `idle`). The browser records actual phase changes across document navigation and rejects missing phases. Select the relevant phases from observed behavior; do not invent reference state labels. Scroll setup places a below-fold target just outside the viewport, so preparation does not consume its entrance before recording.

Exercise a keyboard link activation during the first-visit reveal, not only clicks after settlement. Arrival and outgoing covers must serialize; the shared runtime queues that request until arrival settles. A live reduced-motion or pause change cancels decorative travel. Settled focus/layout checks wait for the real arrival to finish, while navigation-start recordings retain its opening evidence.

Browser verification records paired WebM clips, before/during/after frames and sampled browser states at the same viewport/input. Current plan, selection, build and capture bytes are bound into the report. Preserve failed attempts. Critic reviews add `templateMotion:{planHash,distHash,moments:[{id,verdict,timing,easing,continuity,inputAlternatives}]}`. Open the actual captures before writing observations. Diagnose slow or abrupt pacing, jumpy followers, generic entrances, reveal cuts and motion that competes with reading. A pass without located temporal evidence fails. Explain deliberate departures; never manufacture human preferences.

Show the paired comparison and usable preview to the owner, and carry their actual response into refinement. Engineering checks, agent assessment and human acceptance remain separate.

Use the opt-in `data-island="experience"` runtime only for choreography selected by the direction. Markers support bounded pointer/keyboard chapter previews, restrained magnetic actions, portrait drift, pixel-speed marquee settlement and reversal, supporting intro lines, and guarded route-cover navigation. An optional arrival marker also enables a shared first-visit greeting and complete incoming lift across native document navigation. Customer HTML/CSS still owns the composition, responsive inline imagery, menu and sequence. The kernel supplies no customer claims, images or design approval. Its motion policy, media-query and disposal handling must accompany customer pause, reduced-motion and immediate static content. Retain ordinary navigation when storage/runtime support fails; assess that departure explicitly.

Motion plans are downstream authoring outputs. They must not reopen reference analysis, direction or copy planning. Use supported prepare/complete and repair routing; never rewrite workflow state or evidence to bypass a gate.

To show a current comparison, run "vitris-motion-view --site SITE --out ARTIFACT_DIRECTORY --report browser --port PORT". The viewer verifies capture bytes before copying QA media; use a new output directory for each run. It contains no reusable template demo assets.

Whole-route recordings now sample actual opening render states before waiting for font settlement. This preserves evidence for fast opening accents without accepting inert targets; geometry and forward traversal still wait for settled fonts.

Shared marker examples (the authored CSS supplies layout and final/static states):

| Relationship | Markup |
| --- | --- |
| Chapter cover | Link with `data-experience-image="/media/cover.webp"` and `data-experience-name="Chapter"`; fixed preview container with `data-experience-preview`, a decorative `img`, and `data-visible="false"` |
| Faster action disk | Separate `data-experience-cursor` container with `data-experience-label` text |
| Magnetic action | `data-experience-magnetic` on the actual usable link/button |
| Portrait depth | `data-experience-drift=".13"`, a crop-safe `data-experience-drift-max`, and the parent section ID in `data-experience-trigger` |
| Interior portrait | `data-experience-drift-mode="center"` with `.07` drift and forty-pixel travel; clip an overscanned image inside its frame |
| Marquee pace | `data-experience-marquee-speed` on a CSS-animated track with two equal copies; choose the measured reference speed |
| Closing seam | `data-experience-seam` on a section; CSS transitions its decorative edge when `.experience-seen` is added |
| Supporting introduction | `data-experience-intro` around the selected `data-experience-line` children |
| Route cover | `data-experience-transition` on a decorative fixed cover; an optional link `data-experience-title` supplies its destination label |
| First visit and full route arrival | Add `data-experience-arrival="Hello."` to that cover. The compiler arms a before-paint bootstrap; CSS must show the resting cover under `html[data-experience-arrival]`. Runtime holds a first-visit greeting for 420ms and lifts the curve for 800ms; later route handoffs lift immediately. The bootstrap fails open after 3.5s if runtime loading fails. |
| Saved global pause | The arrival cover's optional `data-experience-pause-key` names the customer's localStorage pause key (default `vitris-experience-paused`); its value `true` skips the cover before first paint. |
| Opening movement | Selected `data-experience-opening` children move thirty-two pixels over one second as the cover lifts; final text remains available and this must not become a whole-page reveal. |

Floating previews are limited to fine hover inputs wider than 1024px by default. Supply responsive inline covers and keep ordinary semantic links. Mark decorative duplicated identity text and preview imagery as hidden from assistive technology. Set `document.documentElement.dataset.motionPolicy="off"` when the user's global pause is active; customer CSS must also settle hover, seam, marquee and native document transitions. Reduced motion alone is not the complete input policy.
