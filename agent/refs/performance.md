# Performance

Ship static HTML, the CSS of components that are used, and islands only when a page needs them. The Vitris starting budgets are project policy: 100 KiB gzip of first-party JavaScript, 100 KiB gzip of CSS, 200 KiB of fonts, and 1.5 MiB initial transfer. They are not Core Web Vitals.

[Core Web Vitals](https://web.dev/articles/vitals) field targets are LCP 2.5s, INP 200ms, and CLS 0.1 at the 75th percentile. A lab run is not field INP. Missing field data is unknown, not a pass. A broken or empty shipped file still blocks.


For scroll motion, use the stage-scoped `motion.md` contract. Choose business-specific scenes and quiet intervals; preserve operator policies. Carry motionPlan v2 for every new/reauthored route (historical v1 remains compatible) from direction/storyboard to unique native/component target IDs, then inspect before/during/after normal and reduced scrolling. Temporal claims require live observations or recordings; agent review is not human preference.
