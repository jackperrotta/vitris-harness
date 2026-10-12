import type { ChangeScope } from "../../src/agent/refine.ts";

export interface RoutingTestCase {
  id: string;
  instruction: string;
  groundTruthScope: ChangeScope;
  split: "dev" | "heldout";
  overrideScope?: ChangeScope;
  isMixed?: boolean;
  isAmbiguous?: boolean;
  category: string;
}

export const ROUTING_DATASET: RoutingTestCase[] = [
  // ---------------------------------------------------------------------------
  // DEV SPLIT (55 cases)
  // ---------------------------------------------------------------------------
  // Business (14 cases)
  { id: "dev-bus-01", instruction: "Add our new 24/7 emergency roof tarping service", groundTruthScope: "business", split: "dev", category: "service_addition" },
  { id: "dev-bus-02", instruction: "We now expand coverage to Bellevue, Kirkland, and Redmond", groundTruthScope: "business", split: "dev", category: "location_expansion" },
  { id: "dev-bus-03", instruction: "Change our hourly diagnostic fee to $149 flat rate", groundTruthScope: "business", split: "dev", category: "pricing_change" },
  { id: "dev-bus-04", instruction: "Update our target audience to commercial property managers", groundTruthScope: "business", split: "dev", category: "audience_change" },
  { id: "dev-bus-05", instruction: "We now offer a lifetime workmanship warranty on all installations", groundTruthScope: "business", split: "dev", category: "warranty_change" },
  { id: "dev-bus-06", instruction: "Add solar panel attic fan installation to our service list", groundTruthScope: "business", split: "dev", category: "service_addition" },
  { id: "dev-bus-07", instruction: "We have discontinued our chimney masonry repair service", groundTruthScope: "business", split: "dev", category: "service_removal" },
  { id: "dev-bus-08", instruction: "Include free drone roof inspection with every complete replacement", groundTruthScope: "business", split: "dev", category: "offer_inclusion" },
  { id: "dev-bus-09", instruction: "Update our financing options to include 0% APR for 18 months", groundTruthScope: "business", split: "dev", category: "financing_offer" },
  { id: "dev-bus-10", instruction: "Our business hours are now Monday to Saturday 7am to 7pm", groundTruthScope: "business", split: "dev", category: "operating_hours" },
  { id: "dev-bus-11", instruction: "We are now GAF Master Elite certified contractors", groundTruthScope: "business", split: "dev", category: "certification" },
  { id: "dev-bus-12", instruction: "Add commercial TPO single-ply membrane roofing to offerings", groundTruthScope: "business", split: "dev", category: "service_addition" },
  { id: "dev-bus-13", instruction: "Offer a 10% senior and military discount on all repairs", groundTruthScope: "business", split: "dev", category: "discount_policy" },
  { id: "dev-bus-14", instruction: "Change primary customer trigger from storm damage to aging roof replacement", groundTruthScope: "business", split: "dev", category: "trigger_positioning" },

  // Direction (13 cases)
  { id: "dev-dir-01", instruction: "Make the site feel more luxurious, architectural, and editorial", groundTruthScope: "direction", split: "dev", category: "aesthetic_mood" },
  { id: "dev-dir-02", instruction: "Switch to a high-contrast dark theme with vibrant neon accents", groundTruthScope: "direction", split: "dev", category: "color_direction" },
  { id: "dev-dir-03", instruction: "Adopt an earthy Pacific Northwest palette with forest green and slate", groundTruthScope: "direction", split: "dev", category: "palette_shift" },
  { id: "dev-dir-04", instruction: "Shift typography from industrial sans to an elegant serif headline hierarchy", groundTruthScope: "direction", split: "dev", category: "typography" },
  { id: "dev-dir-05", instruction: "Make the design feel energetic, modern, and tech-forward", groundTruthScope: "direction", split: "dev", category: "aesthetic_mood" },
  { id: "dev-dir-06", instruction: "Tone down the visual intensity; aim for calm Scandinavian minimalism", groundTruthScope: "direction", split: "dev", category: "minimalism" },
  { id: "dev-dir-07", instruction: "Use a warmer, more approachable color mood with terracotta and cream", groundTruthScope: "direction", split: "dev", category: "palette_shift" },
  { id: "dev-dir-08", instruction: "Give the entire site a rugged, heritage craftsman workshop vibe", groundTruthScope: "direction", split: "dev", category: "aesthetic_mood" },
  { id: "dev-dir-09", instruction: "Increase typography scale contrast for bold Swiss-style graphic impact", groundTruthScope: "direction", split: "dev", category: "typography" },
  { id: "dev-dir-10", instruction: "Transition visual direction to high-end medical clinic professionalism", groundTruthScope: "direction", split: "dev", category: "aesthetic_mood" },
  { id: "dev-dir-11", instruction: "Replace sharp geometric corners with softer rounded organic design tokens", groundTruthScope: "direction", split: "dev", category: "token_shape" },
  { id: "dev-dir-12", instruction: "Change primary accent from construction orange to trustworthy deep cobalt navy", groundTruthScope: "direction", split: "dev", category: "color_direction" },
  { id: "dev-dir-13", instruction: "Elevate brand perception to feel like bespoke luxury estate contracting", groundTruthScope: "direction", split: "dev", category: "aesthetic_mood" },

  // Copy (14 cases)
  { id: "dev-cpy-01", instruction: "Rewrite the homepage hero headline to be punchier and under 8 words", groundTruthScope: "copy", split: "dev", category: "headline_rewrite" },
  { id: "dev-cpy-02", instruction: "Change hero subheadline to highlight 15-minute response time", groundTruthScope: "copy", split: "dev", category: "subheadline" },
  { id: "dev-cpy-03", instruction: "Update the primary call to action button label to 'Schedule Free Roof Check'", groundTruthScope: "copy", split: "dev", category: "cta_copy" },
  { id: "dev-cpy-04", instruction: "Refine the team bio section to sound more personable and trustworthy", groundTruthScope: "copy", split: "dev", category: "bio_copy" },
  { id: "dev-cpy-05", instruction: "Rewrite the warranty explanation in plain conversational language", groundTruthScope: "copy", split: "dev", category: "explainer_copy" },
  { id: "dev-cpy-06", instruction: "Shorten service descriptions on the homepage to two bullet points each", groundTruthScope: "copy", split: "dev", category: "service_copy" },
  { id: "dev-cpy-07", instruction: "Add customer quote from Sarah Jenkins to the testimonials section", groundTruthScope: "copy", split: "dev", category: "testimonial_copy" },
  { id: "dev-cpy-08", instruction: "Make the contact page intro copy more welcoming and direct", groundTruthScope: "copy", split: "dev", category: "contact_copy" },
  { id: "dev-cpy-09", instruction: "Change footer copyright text and add trademark disclaimer", groundTruthScope: "copy", split: "dev", category: "legal_copy" },
  { id: "dev-cpy-10", instruction: "Rewrite the 'Why Choose Us' section with focus on local community roots", groundTruthScope: "copy", split: "dev", category: "value_prop" },
  { id: "dev-cpy-11", instruction: "Update the FAQ answers regarding insurance claims processing", groundTruthScope: "copy", split: "dev", category: "faq_copy" },
  { id: "dev-cpy-12", instruction: "Revise emergency banner text to warn about impending storm season", groundTruthScope: "copy", split: "dev", category: "banner_copy" },
  { id: "dev-cpy-13", instruction: "Sharpen the value proposition on the residential roofing landing page", groundTruthScope: "copy", split: "dev", category: "value_prop" },
  { id: "dev-cpy-14", instruction: "Polish grammar and remove passive voice across all page summaries", groundTruthScope: "copy", split: "dev", category: "copy_editing" },

  // Pages (10 cases)
  { id: "dev-pag-01", instruction: "Increase vertical padding between the hero and services section", groundTruthScope: "pages", split: "dev", category: "spacing" },
  { id: "dev-pag-02", instruction: "Swap the order of the testimonials block and the FAQ block on home", groundTruthScope: "pages", split: "dev", category: "layout_reorder" },
  { id: "dev-pag-03", instruction: "Make the desktop navigation header fixed sticky on scroll", groundTruthScope: "pages", split: "dev", category: "nav_behavior" },
  { id: "dev-pag-04", instruction: "Add a compact request form to the bottom of the services page", groundTruthScope: "pages", split: "dev", category: "component_placement" },
  { id: "dev-pag-05", instruction: "Convert the single-column contact info into a two-column grid on mobile", groundTruthScope: "pages", split: "dev", category: "responsive_layout" },
  { id: "dev-pag-06", instruction: "Increase button hit target sizes on mobile navigation", groundTruthScope: "pages", split: "dev", category: "mobile_touch" },
  { id: "dev-pag-07", instruction: "Align the logo to the left and navigation links to the far right", groundTruthScope: "pages", split: "dev", category: "header_layout" },
  { id: "dev-pag-08", instruction: "Show 4 testimonial cards in a row instead of 3 on wide screens", groundTruthScope: "pages", split: "dev", category: "grid_columns" },
  { id: "dev-pag-09", instruction: "Add an icon next to each phone number link in the footer", groundTruthScope: "pages", split: "dev", category: "element_styling" },
  { id: "dev-pag-10", instruction: "Collapse footer links into an accordion on mobile viewports", groundTruthScope: "pages", split: "dev", category: "responsive_behavior" },

  // Overrides & Edge Cases (4 cases)
  { id: "dev-ovr-01", instruction: "Rewrite headline", groundTruthScope: "copy", overrideScope: "pages", split: "dev", category: "explicit_override" },
  { id: "dev-ovr-02", instruction: "Add heat pump service", groundTruthScope: "business", overrideScope: "direction", split: "dev", category: "explicit_override" },
  { id: "dev-amb-01", instruction: "Fix the website", groundTruthScope: "pages", split: "dev", isAmbiguous: true, category: "ambiguous" },
  { id: "dev-mix-01", instruction: "Add chimney inspection service and redesign hero layout", groundTruthScope: "business", split: "dev", isMixed: true, category: "mixed" },

  // ---------------------------------------------------------------------------
  // HELDOUT SPLIT (55 cases)
  // ---------------------------------------------------------------------------
  // Business (14 cases)
  { id: "hld-bus-01", instruction: "We now handle commercial snow removal contracts for retail centers", groundTruthScope: "business", split: "heldout", category: "service_addition" },
  { id: "hld-bus-02", instruction: "Expand service area to include all of Pierce County and South Sound", groundTruthScope: "business", split: "heldout", category: "location_expansion" },
  { id: "hld-bus-03", instruction: "Institute a $75 cancellation fee for appointments canceled under 24 hours", groundTruthScope: "business", split: "heldout", category: "policy_change" },
  { id: "hld-bus-04", instruction: "Partner with GreenSky for low-interest consumer home improvement loans", groundTruthScope: "business", split: "heldout", category: "financing_offer" },
  { id: "hld-bus-05", instruction: "We now specialize in historical slate roof restoration for landmark buildings", groundTruthScope: "business", split: "heldout", category: "specialty_addition" },
  { id: "hld-bus-06", instruction: "Our emergency callout dispatch is now available on Sunday mornings", groundTruthScope: "business", split: "heldout", category: "operating_hours" },
  { id: "hld-bus-07", instruction: "Remove skylight leak repairs from our standalone repair offerings", groundTruthScope: "business", split: "heldout", category: "service_removal" },
  { id: "hld-bus-08", instruction: "Add seamless copper gutter fabrication to our exterior services", groundTruthScope: "business", split: "heldout", category: "service_addition" },
  { id: "hld-bus-09", instruction: "Target industrial warehouse managers needing flat roof preventative care", groundTruthScope: "business", split: "heldout", category: "audience_change" },
  { id: "hld-bus-10", instruction: "We have achieved CertainTeed SELECT ShingleMaster certification", groundTruthScope: "business", split: "heldout", category: "certification" },
  { id: "hld-bus-11", instruction: "Offer a 50-year non-prorated manufacturer warranty on all Owens Corning roofs", groundTruthScope: "business", split: "heldout", category: "warranty_change" },
  { id: "hld-bus-12", instruction: "Change customer engagement flow from phone call to instant online scheduler", groundTruthScope: "business", split: "heldout", category: "engagement_flow" },
  { id: "hld-bus-13", instruction: "Add an annual roof maintenance membership plan at $199/year", groundTruthScope: "business", split: "heldout", category: "subscription_offer" },
  { id: "hld-bus-14", instruction: "Reposition business from low-cost volume repair to precision architectural preservation", groundTruthScope: "business", split: "heldout", category: "trigger_positioning" },

  // Direction (13 cases)
  { id: "hld-dir-01", instruction: "Rebrand the site with a crisp Japanese architectural aesthetic", groundTruthScope: "direction", split: "heldout", category: "aesthetic_mood" },
  { id: "hld-dir-02", instruction: "Switch to a monospaced technical engineering look with blueprint grids", groundTruthScope: "direction", split: "heldout", category: "aesthetic_mood" },
  { id: "hld-dir-03", instruction: "Replace dark backgrounds with an ultra-clean warm paper editorial canvas", groundTruthScope: "direction", split: "heldout", category: "palette_shift" },
  { id: "hld-dir-04", instruction: "Adopt an opulent European heritage feel with deep emerald and muted gold", groundTruthScope: "direction", split: "heldout", category: "color_direction" },
  { id: "hld-dir-05", instruction: "Implement Swiss modernist typography with rigid column grid tokens", groundTruthScope: "direction", split: "heldout", category: "typography" },
  { id: "hld-dir-06", instruction: "Make the site feel warm, cheerful, and approachable for young families", groundTruthScope: "direction", split: "heldout", category: "aesthetic_mood" },
  { id: "hld-dir-07", instruction: "Shift primary tone to high-tech industrial cyber-ruggedness", groundTruthScope: "direction", split: "heldout", category: "aesthetic_mood" },
  { id: "hld-dir-08", instruction: "Use muted earth tones: sage, dune sand, and charcoal", groundTruthScope: "direction", split: "heldout", category: "palette_shift" },
  { id: "hld-dir-09", instruction: "Increase visual whitespace and generous padding across all section containers", groundTruthScope: "direction", split: "heldout", category: "spacing_tokens" },
  { id: "hld-dir-10", instruction: "Apply sharp brutalist borders with heavy black lines and stark mono type", groundTruthScope: "direction", split: "heldout", category: "aesthetic_mood" },
  { id: "hld-dir-11", instruction: "Change mood to coastal nautical: crisp white, storm gray, and sea blue", groundTruthScope: "direction", split: "heldout", category: "palette_shift" },
  { id: "hld-dir-12", instruction: "Set up ultra-refined typography using high-contrast humanist display headers", groundTruthScope: "direction", split: "heldout", category: "typography" },
  { id: "hld-dir-13", instruction: "Dampen vivid accents to calm neutral architectural monochrome", groundTruthScope: "direction", split: "heldout", category: "color_direction" },

  // Copy (14 cases)
  { id: "hld-cpy-01", instruction: "Rewrite the hero title to emphasize 30 years of family ownership", groundTruthScope: "copy", split: "heldout", category: "headline_rewrite" },
  { id: "hld-cpy-02", instruction: "Refine the call to action from 'Submit' to 'Get Your Guaranteed Quote'", groundTruthScope: "copy", split: "heldout", category: "cta_copy" },
  { id: "hld-cpy-03", instruction: "Rewrite the storm damage emergency copy to sound reassuring and calm", groundTruthScope: "copy", split: "heldout", category: "tone_adjustment" },
  { id: "hld-cpy-04", instruction: "Condense the about page narrative to 150 words total", groundTruthScope: "copy", split: "heldout", category: "copy_condensation" },
  { id: "hld-cpy-05", instruction: "Update the customer testimonial by Mark Thompson with his complete quote", groundTruthScope: "copy", split: "heldout", category: "testimonial_copy" },
  { id: "hld-cpy-06", instruction: "Add step-by-step description for the 4-stage roof replacement process", groundTruthScope: "copy", split: "heldout", category: "process_copy" },
  { id: "hld-cpy-07", instruction: "Change form label from 'Address' to 'Property Location for Inspection'", groundTruthScope: "copy", split: "heldout", category: "microcopy" },
  { id: "hld-cpy-08", instruction: "Craft a persuasive paragraph explaining why cheap patch jobs fail", groundTruthScope: "copy", split: "heldout", category: "educational_copy" },
  { id: "hld-cpy-09", instruction: "Revise founder bio to highlight structural engineering degree from UW", groundTruthScope: "copy", split: "heldout", category: "bio_copy" },
  { id: "hld-cpy-10", instruction: "Update phone call script hint on the contact page", groundTruthScope: "copy", split: "heldout", category: "contact_copy" },
  { id: "hld-cpy-11", instruction: "Write headline and bullet list for ice dam prevention tips", groundTruthScope: "copy", split: "heldout", category: "content_addition" },
  { id: "hld-cpy-12", instruction: "Replace generic marketing phrases with direct factual claims", groundTruthScope: "copy", split: "heldout", category: "copy_editing" },
  { id: "hld-cpy-13", instruction: "Add disclaimer explaining that free estimates require homeowner presence", groundTruthScope: "copy", split: "heldout", category: "disclaimer_copy" },
  { id: "hld-cpy-14", instruction: "Rewrite the seasonal maintenance page hero for autumn leaf season", groundTruthScope: "copy", split: "heldout", category: "seasonal_copy" },

  // Pages (10 cases)
  { id: "hld-pag-01", instruction: "Decrease the gap between section headings and description paragraphs", groundTruthScope: "pages", split: "heldout", category: "spacing" },
  { id: "hld-pag-02", instruction: "Move the trust badge row above the hero fold", groundTruthScope: "pages", split: "heldout", category: "layout_reorder" },
  { id: "hld-pag-03", instruction: "Center-align all section titles and subtitles across the site", groundTruthScope: "pages", split: "heldout", category: "alignment" },
  { id: "hld-pag-04", instruction: "Place the estimate form in a sticky sidebar on desktop screens", groundTruthScope: "pages", split: "heldout", category: "sidebar_layout" },
  { id: "hld-pag-05", instruction: "Add an extra column for the 4th service card on tablet viewports", groundTruthScope: "pages", split: "heldout", category: "responsive_layout" },
  { id: "hld-pag-06", instruction: "Fix the footer layout so columns do not overlap at 1024px width", groundTruthScope: "pages", split: "heldout", category: "responsive_fix" },
  { id: "hld-pag-07", instruction: "Increase button padding and font size for the hero CTA button", groundTruthScope: "pages", split: "heldout", category: "button_styling" },
  { id: "hld-pag-08", instruction: "Display project photos in a 3x3 square masonry grid", groundTruthScope: "pages", split: "heldout", category: "gallery_layout" },
  { id: "hld-pag-09", instruction: "Embed the Google review badge widget in the top announcement bar", groundTruthScope: "pages", split: "heldout", category: "component_placement" },
  { id: "hld-pag-10", instruction: "Make the phone number in the mobile navbar tap-to-call with a prominent button", groundTruthScope: "pages", split: "heldout", category: "nav_behavior" },

  // Overrides & Edge Cases (4 cases)
  { id: "hld-ovr-01", instruction: "Rewrite all service descriptions", groundTruthScope: "copy", overrideScope: "business", split: "heldout", category: "explicit_override" },
  { id: "hld-ovr-02", instruction: "Center the logo in header", groundTruthScope: "pages", overrideScope: "direction", split: "heldout", category: "explicit_override" },
  { id: "hld-amb-01", instruction: "Make changes to the landing page", groundTruthScope: "pages", split: "heldout", isAmbiguous: true, category: "ambiguous" },
  { id: "hld-mix-01", instruction: "Add commercial siding service and rewrite home headline", groundTruthScope: "business", split: "heldout", isMixed: true, category: "mixed" },
];
