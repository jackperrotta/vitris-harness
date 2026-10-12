# Find five industry website references

Deliver a current, evidence-backed shortlist of five different businesses with strong website design for the requested industry. The purpose is to help the operator choose references for the template library. Default to worldwide discovery, English-language sites preferred, and diversity in design approach. Honor user-supplied region, niche, or style filters. A website's design does not establish the quality of its business's services.

## Research and selection

- Search the live web using several complementary queries: industry and niche terms, geographic variants, and design/agency showcases. Broaden beyond the first search results. Consider roughly 10-15 plausible candidates when available, then select the strongest complementary five. This is an effort guide, not a quota that establishes quality.
- Use showcases and award directories to discover candidates, then visit the actual business sites. The final five link directly to working business websites, not search results, screenshots, directories, agency portfolios, or unbuilt template demos. Prefer industry specialists; explain why any mixed-industry business is relevant.
- Confirm that each selected URL resolves to the intended live business. Use the current canonical URL after redirects. Deduplicate by business and substantially identical design, including related franchise sites or domain aliases. Do not claim different colors on the same layout as five distinct approaches.
- Inspect the complete home page, at least one useful interior page, and the main conversion/navigation path for each selected site using an available browser capability. Check desktop and mobile, exercise menus and one defining interaction where present, and observe motion if it contributes to the selection. Follow applicable browser tool instructions. A static page or search snippet cannot verify an animation or mobile drawer.
- Judge visual hierarchy, typography, composition, photography/media, coherent identity, industry suitability, ease of navigation/conversion, responsive execution, and relevant interactions. Choose approaches that differ in composition and visitor journey, such as service-first utility, editorial craft, premium residential, project-led expertise, or friendly local identity. Use labels supported by the actual sites, not a fixed mandatory set.
- Record the inspected source URLs and observation dates. Separate observed features, inferences about implementation, and unverified behavior. Do not fabricate ratings, awards, traffic, performance measurements, or user preference labels.
- Replace inaccessible or clearly weak candidates where possible. If fewer than five can be verified after reasonable research, report the concrete limitation and remaining candidates rather than filling the artifact with invented or uninspected recommendations. The renderer intentionally requires five; a partial research report is a separate explicitly incomplete artifact.

Keep candidate URLs, selection/rejection notes, and selected-site observations in the run's `shortlist.json`. Do not clone these websites, collect their assets, alter the existing template gallery, or publish a catalog entry. This workflow creates local reference metadata and a research artifact, not a complete template demonstration. Browser screenshots are optional supporting evidence; do not generate fake previews or use screenshots as a substitute for opening the live site.

## Artifact data

Create a fresh `artifacts/research/industry-references/<industry>-<timestamp>/` directory. Write `shortlist.json` with this shape, supplying real research values rather than leaving the sample text:

```json
{
  "industry": "Plumbing",
  "region": "Worldwide; English-language sites preferred",
  "researchedAt": "ISO_TIMESTAMP",
  "criteria": "Visual quality, usability, interactions, and distinct design approaches.",
  "summary": "Describe the selection and the most useful differences among the five.",
  "candidatesReviewed": 12,
  "candidates": [{"name": "Business", "url": "https://business.example/", "decision": "selected or rejection reason"}],
  "sites": [
    {
      "name": "Verified business name",
      "url": "https://business.example/",
      "location": "Verified country or region, or unknown",
      "approach": "Observed design approach",
      "why": "Specific reason it is a strong reference and complements the other selections.",
      "layout": "Observed structure, composition, and imagery.",
      "typography": "Observed type hierarchy and identity; qualify unidentified font names.",
      "interactions": "Actually exercised navigation, hover, or animation, with unverified behavior stated.",
      "mobile": "Observed mobile layout and navigation at the checked viewport.",
      "checkedAt": "ISO_TIMESTAMP",
      "pages": [{"label": "Service page", "url": "https://business.example/service", "note": "What to inspect here."}],
      "evidence": [{"label": "Homepage inspected", "url": "https://business.example/"}],
      "limitations": "Relevant caveats or deliberate gaps; use None observed when appropriate."
    }
  ]
}
```

Include exactly five site records, each belonging to a different business. `candidatesReviewed` counts distinct candidates actually investigated, not search result counts. `candidates` is an optional audit trail; keep its count consistent with the claimed research. Lists of source links alone do not substantiate invented observations.

Generate the artifact from the repository root:

```text
node scripts/render-industry-shortlist.mjs --input ABSOLUTE_SHORTLIST_JSON --out ABSOLUTE_INDEX_HTML
```

The renderer produces a responsive, self-contained HTML file with no remote libraries, embedded websites, or popup scripts. Its ordinary `target="_blank"` links let the user open each reference independently. Each card includes a selectable template-skill command; it does not execute the skill or publish a template.

## Verify and deliver

Open the generated HTML in a browser and check five cards, readable desktop/mobile layout, complete observations, working canonical/interior links, and new-tab behavior. Confirm that source/evidence links support the actual claims. Resolve bad links or factual issues before delivery. Do not automatically open all five sites in user-visible tabs as a substitute for link verification.

Use `open_in_codex` with the artifact's absolute file path when available, then return a clickable file link and the invocation example. State research scope and any material inspection limitations. The artifact is the primary deliverable; do not make the user reconstruct it from chat messages. Leave template selection and subsequent building to the user.
