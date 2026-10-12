# Connect elements through shared alignment

ID: cmp-shared-alignment. Pilot lesson. Sources: [S05](https://www.ibm.com/design/language/2x-grid/), [S13](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Subgrid).

Teach a site-owned alignment system across local component boundaries: a label rail, nested tracks, aligned baselines, or shared image edge. Use for metadata, editorial sequences, and comparison. Avoid elaborate grids for simple content.

Application A: titles, captions, and service labels share a rail while image spans vary. Application B: a centered introduction opens into aligned comparison columns. Symmetry remains valid when useful.

Counterexample: label widths and image edges change between sections without a content reason.

Mobile: collapse unused tracks into meaningful groups. Subgrid is optional; independent Grid/Flexbox arrangements remain valid.

Storyboard: describe the shared alignment relationship. Review: inspect edges, baselines, narrow layouts, missing values, and long text. The grid is an implementation aid, not a requirement to fill every cell.

## Authority and use

This is an original design-teaching hypothesis. It is advisory and does not change factual, accessibility, or functional requirements. Adapt it to verified business evidence and inspect the current render before accepting an outcome. The applications above are contrasting examples, not copyable site presets.
