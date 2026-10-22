/**
 * Vitris Icons v5. Original geometric drawings authored for this repository,
 * 2026-10-22. No imported icon paths, traced libraries, or brand marks.
 * Editable 24-unit masters; light/regular share linework, solid has its own master.
 * Distributed under this repository's license. See agent/refs/icons.md.
 */
import { p, c, r, line, hole, ring } from './drawing.ts';
import { originalDuotone } from './duotone.ts';
import { industryIcons } from './industry.ts';
import { studioIcons, STUDIO_VARIANTS, coreStudioIconNames } from './studio.ts';
import type { StudioVariant } from './studio.ts';
import { refinedIndustryMasters } from './refinements.ts';
import { industryRefinementsV4 } from './industry-refinements-v4.ts';
import { industryIconReviews } from './industry-review.ts';

export const ICON_VERSION = 5;
export const BASE_ICON_VARIANTS = ['light', 'regular', 'solid', 'duotone'] as const;
export const ICON_VARIANTS = [...BASE_ICON_VARIANTS, ...STUDIO_VARIANTS] as const;
export type IconVariant = typeof ICON_VARIANTS[number];
export type IconDefinition = {
  name: string;
  category: string;
  keywords: readonly string[];
  outline: string;
  solid: string;
  duotone: { primary: string; secondary: string };
  families?: Readonly<Partial<Record<StudioVariant, string>>>;
  /** Revision in which geometry was redrawn, not a human approval or taste label. */
  refinedVersion?: number;
  /** Latest rendered industry review; retained drawings are not marked redrawn. */
  reviewedVersion?: number;
};

const entries: IconDefinition[] = [];
function add(category: string, name: string, keywords: string, outline: string, solid: string) {
  entries.push({ name, category, keywords: keywords.split(' '), outline, solid, duotone: originalDuotone(name, solid) });
}

// Navigation and interface
add('Interface','circle','dot pagination status marker',c(12,12,9),c(12,12,10));
add('Interface','arrow-right','next forward continue',p('M3.5 12h16M13.5 5l7 7-7 7'),p('M3 11h14l-4.5-4.5L14 5l7 7-7 7-1.5-1.5L17 13H3z'));
add('Interface','arrow-left','back previous return',p('M20.5 12h-16M10.5 5l-7 7 7 7'),p('M21 11H7l4.5-4.5L10 5l-7 7 7 7 1.5-1.5L7 13h14z'));
add('Interface','arrow-up','top upload north',p('M12 20.5v-16M5 10.5l7-7 7 7'),p('M11 21V7l-4.5 4.5L5 10l7-7 7 7-1.5 1.5L13 7v14z'));
add('Interface','arrow-down','bottom south expand',p('M12 3.5v16M5 13.5l7 7 7-7'),p('M11 3v14l-4.5-4.5L5 14l7 7 7-7-1.5-1.5L13 17V3z'));
add('Interface','chevron-right','next disclosure forward',p('M8.5 4.5L16 12l-7.5 7.5'),p('M7 5.5L9 3.5l8.5 8.5L9 20.5l-2-2 6.5-6.5z'));
add('Interface','chevron-left','previous disclosure back',p('M15.5 4.5L8 12l7.5 7.5'),p('M17 5.5l-2-2L6.5 12l8.5 8.5 2-2-6.5-6.5z'));
add('Interface','chevron-down','dropdown expand disclosure',p('M4.5 8.5L12 16l7.5-7.5'),p('M5.5 7l-2 2 8.5 8.5L20.5 9l-2-2-6.5 6.5z'));
add('Interface','chevron-up','collapse disclosure',p('M4.5 15.5L12 8l7.5 7.5'),p('M5.5 17l-2-2L12 6.5l8.5 8.5-2 2-6.5-6.5z'));
add('Interface','menu','navigation hamburger bars',p('M3.5 5.5h17M3.5 12h17M3.5 18.5h17'),r(3,4,18,3,1)+r(3,10.5,18,3,1)+r(3,17,18,3,1));
add('Interface','close','dismiss cancel x',p('M5 5l14 14M19 5L5 19'),p('M4 6l2-2 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6z'));
add('Interface','plus','add create positive',p('M12 3.5v17M3.5 12h17'),p('M10.5 3h3v7.5H21v3h-7.5V21h-3v-7.5H3v-3h7.5z'));
add('Interface','minus','remove subtract negative',p('M3.5 12h17'),r(3,10.5,18,3,1));
add('Interface','check','done success tick',p('M3.5 12.5l5.5 6L20.5 5.5'),p('M2.5 12.5L4.5 11 9 16l10.5-12 2 1.5L9 20z'));
add('Interface','search','find magnify lookup',c(10.5,10.5,7)+p('M15.5 15.5l5 5'),ring(10,10,7.5,5)+p('M14.5 16l1.5-1.5 6 6-1.5 1.5z'));
add('Interface','filter','funnel refine results',p('M3 4.5h18l-7 8v6l-4 2v-8z'),p('M2 4h20l-8 9v6l-4 2v-8z'));
add('Interface','grid','apps tiles layout',r(3.5,3.5,6.5,6.5,1)+r(14,3.5,6.5,6.5,1)+r(3.5,14,6.5,6.5,1)+r(14,14,6.5,6.5,1),r(3,3,8,8,1.5)+r(13,3,8,8,1.5)+r(3,13,8,8,1.5)+r(13,13,8,8,1.5));
add('Interface','list','rows bullet details',p('M8 5h13M8 12h13M8 19h13')+c(3.5,5,.5)+c(3.5,12,.5)+c(3.5,19,.5),r(7,4,14,2,1)+r(7,11,14,2,1)+r(7,18,14,2,1)+c(3,5,1.5)+c(3,12,1.5)+c(3,19,1.5));
add('Interface','external-link','new window outbound',p('M13 3.5h7.5V11M20 4L10 14M10 4H4v16h16v-6'),line('M13 3.5h7.5V11M20 4L10 14')+hole('M3 3h7v2H5v14h14v-5h2v7H3z'));
add('Interface','download','save receive file',p('M12 3v12M6.5 10l5.5 5.5 5.5-5.5M3.5 16v4.5h17V16'),p('M11 2h2v10l4-4 1.5 1.5L12 16 5.5 9.5 7 8l4 4zM3 16h2v3h14v-3h2v5H3z'));
add('Interface','upload','send file import',p('M12 16V3M6.5 8.5L12 3l5.5 5.5M3.5 16v4.5h17V16'),p('M11 16h2V6l4 4 1.5-1.5L12 2 5.5 8.5 7 10l4-4zM3 16h2v3h14v-3h2v5H3z'));
add('Interface','refresh','reload sync repeat',p('M20 9a8.5 8.5 0 0 0-14.5-3L3 9M3 3v6h6M4 15a8.5 8.5 0 0 0 14.5 3l2.5-3M21 21v-6h-6'),line('M20 8a8.5 8.5 0 0 0-14-2M4 16a8.5 8.5 0 0 0 14 2')+p('M2 2v8h8zM22 22v-8h-8z'));
add('Interface','info','information help detail',c(12,12,9)+p('M12 11v6M12 7v.2'),ring(12,12,10,8)+r(11,10,2,7,1)+c(12,7,1.3));
add('Interface','warning','alert caution attention',p('M12 3l10 18H2zM12 9v5M12 17v.2'),hole('M12 2L23 22H1zM11 8h2v7h-2zM11 17h2v2h-2z'));
add('Interface','help','question support faq',c(12,12,9)+p('M9 8.5c0-4 7-4 6.5.5-.3 2-3.5 2-3.5 5M12 17v.2'),ring(12,12,10,8)+line('M9 8.5c0-4 7-4 6.5.5-.3 2-3.5 2-3.5 5')+c(12,17,1));

// Communication
add('Communication','phone','call telephone contact',p('M5 3.5h4l2 5-3 2c1.5 3 2.5 4 5.5 5.5l2-3 5 2v4c0 1-1 2-2 2-8 0-15-7-15-15 0-1 1-2 1.5-2z'),p('M4 2h6l2.5 6.5-3 2c1.3 2.2 2.8 3.7 5 5l2-3L23 15v5c0 2-2 3-4 3C9 23 1 15 1 5c0-2 1-3 3-3z'));
add('Communication','mail','email envelope contact',r(3,5,18,14,2)+p('M3.5 6l8.5 7 8.5-7'),hole('M4 4h16q2 0 2 2v12q0 2-2 2H4q-2 0-2-2V6q0-2 2-2M4 6l8 7 8-7-1-1-7 6-7-6z'));
add('Communication','chat','message conversation bubble',p('M4 4h16v12H9l-5 4zM8 8h8M8 12h5'),hole('M2 3h20v15H10l-8 5zM6 7h12v2H6zM6 12h8v2H6z'));
add('Communication','send','message paper plane submit',p('M2.5 10L21 3l-7 18-3.5-7.5zM10.5 13.5L21 3'),hole('M1 10L23 1l-9 22-4-9zM11 13l3 6 6-15z'));
add('Communication','bell','notifications reminder alert',p('M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20h4M12 2v2'),p('M11 1h2v2c4 1 5 3 5 7v4l3 4H3l3-4v-4c0-4 1-6 5-7zM9 20h6c0 4-6 4-6 0'));
add('Communication','megaphone','announcement marketing broadcast',p('M3 9h5l12-5v16L8 15H3zM6 15l2 6h4l-2-5M8 9v6'),p('M2 8h6l13-6v20l-13-6H2zM5 18h5l1 4H7z'));
add('Communication','headset','support service headphones',p('M4 14v-3a8 8 0 0 1 16 0v7c0 3-4 3-7 3M4 11h3v7H3v-6zM20 11h-3v7h4v-6z'),line('M4 12v-1a8 8 0 0 1 16 0v8q0 3-7 3')+r(2,10,6,9,2)+r(16,10,6,9,2));
add('Communication','video-call','meeting conference webcam',r(3,5,12,14,2)+p('M15 9l6-4v14l-6-4z'),r(2,4,13,16,2)+p('M17 8l6-4v16l-6-4z'));
add('Communication','microphone','voice recording audio',r(9,3,6,12,3)+p('M6 11v2a6 6 0 0 0 12 0v-2M12 19v3M8 22h8'),r(8,2,8,14,4)+line('M5 12v1a7 7 0 0 0 14 0v-1M12 20v2M8 22h8'));
add('Communication','at-sign','email address mention',c(12,12,4)+p('M16 8v7c0 3 5 2 5-3a9 9 0 1 0-4 7.5'),ring(12,12,4.5,2.5)+line('M16.5 7.5v7c0 3 5 2 5-3a9.5 9.5 0 1 0-4 8'));
add('Communication','globe','website world language international',c(12,12,9)+p('M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18'),ring(12,12,10,8)+line('M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18'));
add('Communication','share','social distribute connect',c(18,4.5,2.5)+c(5,12,2.5)+c(18,19.5,2.5)+p('M7 11l9-5M7 13l9 5'),c(18,4.5,3.5)+c(5,12,3.5)+c(18,19.5,3.5)+line('M7 11l9-5M7 13l9 5'));

// Commerce
add('Commerce','cart','shopping basket checkout',p('M2 3h3l3 13h11l3-9H6M9 20h.2M18 20h.2'),p('M1 2h5l1 4h16l-4 11H8L5 5H1z')+c(9.5,20.5,2)+c(18.5,20.5,2));
add('Commerce','bag','shopping retail purchase',p('M4 8h16l1 13H3zM8 8V6a4 4 0 0 1 8 0v2'),p('M3 8h18l1 14H2z')+line('M8 7V6a4 4 0 0 1 8 0v1'));
add('Commerce','credit-card','payment billing card',r(2.5,5,19,14,2)+p('M3 9h18M6 15h5'),hole('M4 4h16q3 0 3 3v10q0 3-3 3H4q-3 0-3-3V7q0-3 3-3M2 8v3h20V8zM5 15v2h6v-2z'));
add('Commerce','wallet','payment money cash',p('M4 5l13-3v4M3 6h18v15H3zM21 11h-7v5h7'),hole('M2 5l16-4v4h4v17H2zM5 5h11V3zM14 11v6h8v-6z')+c(17,14,1));
add('Commerce','tag','price label discount',p('M3 3h9l10 10-9 9L3 12z')+c(7.5,7.5,1.5),hole('M2 2h10l11 11-10 10L2 12zM6 7a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'));
add('Commerce','gift','present offer reward',r(3,8,18,4,1)+p('M5 12v9h14v-9M12 8v13M12 8C1 8 6-3 12 8c6-11 11 0 0 0'),p('M2 8h20v5H2zM4 15h7v7H4zM13 15h7v7h-7z')+line('M12 7C1 7 6-3 12 7c6-10 11 0 0 0'));
add('Commerce','receipt','invoice bill purchase',p('M5 2l3 2 4-2 4 2 3-2v20l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h4'),hole('M4 1l4 2 4-2 4 2 4-2v22l-4-2-4 2-4-2-4 2zM8 7h8v2H8zM8 11h8v2H8zM8 15h4v2H8z'));
add('Commerce','package','box shipping delivery',p('M3 7l9-5 9 5v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10M7.5 4.5l9 5'),p('M2 8l9 5v10l-9-5zM13 13l9-5v10l-9 5zM3 6l9-5 9 5-9 5z'));
add('Commerce','store','shop retail local business',p('M4 3h16l2 6H2zM3 9v12h18V9M7 21v-7h5v7M16 14h2'),p('M4 2h16l3 8H1z')+hole('M2 12h20v10H2zM6 15h6v7H6zM16 15h3v3h-3z'));
add('Commerce','coins','money savings currency',p('M15 6c0 2-12 2-12 0s12-2 12 0zM3 6v5c0 2 12 2 12 0V6M3 11v5c0 2 12 2 12 0v-5M18 9c5 0 5 4 0 4M18 13c5 0 5 4 0 4M18 17c5 0 5 4 0 4'),p('M2 5c0-4 14-4 14 0s-14 4-14 0M2 9c4 2 10 2 14 0v4c-4 2-10 2-14 0zM2 16c4 2 10 2 14 0v4c-4 2-10 2-14 0zM18 8c6 0 6 6 0 6zM18 16c6 0 6 6 0 6z'));
add('Commerce','percent','discount sale rate',p('M5 20L19 4')+c(6.5,6.5,3)+c(17.5,17.5,3),p('M3 20L19 2l2 2L5 22z')+ring(6,6,4,2)+ring(18,18,4,2));
add('Commerce','barcode','scan product inventory',p('M3 4v16M6 4v16M10 4v16M13 4v16M17 4v16M21 4v16'),r(2,3,2,18)+r(6,3,1,18)+r(9,3,3,18)+r(14,3,1,18)+r(17,3,2,18)+r(21,3,1,18));

// Business and people
add('Business','user','person account profile',c(12,7,4)+p('M4 22v-3c0-7 16-7 16 0v3'),c(12,6.5,4.5)+p('M3 22v-3c0-9 18-9 18 0v3z'));
add('Business','users','team people group',c(9,7,3.5)+p('M2 21v-3c0-6 14-6 14 0v3M16 4c6-1 7 7 1 7M18 14c4 0 4 4 4 7'),c(8,7,4)+p('M1 22v-4c0-7 14-7 14 0v4zM16 4c7-2 8 8 1 8zM17 14c6-1 6 4 6 8h-6z'));
add('Business','briefcase','work professional business',r(3,7,18,14,2)+p('M8 7V3h8v4M3 12l9 3 9-3M12 12v4'),hole('M7 2h10v4h5v16H2V6h5zM9 4v2h6V4zM3 11v2l9 3 9-3v-2l-9 3z'));
add('Business','calendar','appointment date schedule',r(3,5,18,16,2)+p('M7 2v6M17 2v6M3 10h18M7 14h3M14 14h3M7 18h3'),hole('M2 4h4V1h2v3h8V1h2v3h4v18H2zM3 9v2h18V9zM6 14v2h4v-2zM14 14v2h4v-2zM6 18v2h4v-2z'));
add('Business','clock','time hours duration',c(12,12,9)+p('M12 6v6l4 3'),hole('M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M11 5h2v6.5l4 3-1.2 1.6-4.8-3.6z'));
add('Business','document','file page paper',p('M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8'),hole('M4 1h10l6 6v16H4zM14 3v5h5zM8 11v2h8v-2zM8 16v2h8v-2z'));
add('Business','clipboard','checklist tasks record',r(5,5,14,17,1)+r(8,2,8,5,1)+p('M8 12h8M8 17h8'),hole('M7 1h10v4h3v18H4V5h3zM9 3v3h6V3zM8 11v2h8v-2zM8 16v2h8v-2z'));
add('Business','chart-bar','analytics statistics results',p('M3 2v20h19M7 17v-6h3v6M13 17V7h3v10M19 17V3h3v14'),r(2,2,2,20)+r(4,20,18,2)+r(6,11,4,7)+r(12,7,4,11)+r(18,2,4,16));
add('Business','chart-line','growth analytics trend',p('M3 2v20h19M6 16l5-6 4 3 6-8'),p('M2 2h2v18h18v2H2zM5 16l6-8 4 3 5-8 2 1-7 10-4-3-4 7z'));
add('Business','award','quality badge achievement',c(12,8,6)+p('M8 13l-2 9 6-3 6 3-2-9'),c(12,8,7)+p('M7 15l-2 8 7-3 7 3-2-8-5 2z'));
add('Business','target','goal focus objective',c(12,12,9)+c(12,12,5)+c(12,12,1),ring(12,12,10,8)+ring(12,12,6,4)+c(12,12,2));
add('Business','handshake','agreement partnership trust',p('M2 8l4-4 5 2 3-2 8 5-5 10-5 2-10-9zM11 6l-4 5 3 2 4-4 6 5M7 15l5 6M11 13l6 6'),p('M1 8l5-5 4 2-5 6 5 4 4-4 7 5-5 6-4 1-11-10zM9 11l5-7 9 5-2 5-7-6-4 5z'));

// Construction and trades
add('Trades','hammer','carpenter building repair',p('M3 6l5-4 7 4-4 5-3-3-4 3-3-3zM11 11l10 9-3 3-9-10'),p('M1 6l7-5 9 5-6 7-3-3-4 3zM12 12l11 8-4 4-9-10z'));
add('Trades','wrench','repair plumbing mechanic tool',p('M14 3a6 6 0 0 0-7 8L2 19l3 3 8-6a6 6 0 0 0 8-7l-5 4-4-4z'),p('M14 1a7 7 0 0 0-8 10L1 19l4 4 8-6A7 7 0 0 0 23 9l-6 4-4-3z'));
add('Trades','screwdriver','repair tool fastener',p('M16 2l6 6-5 5-3-1-9 10-3-3 10-9-1-3z'),p('M16 1l7 7-6 6-3-1-9 10-4-4 10-9-1-3z'));
add('Trades','paint-roller','painting decorating finish',r(3,2,15,6,1)+p('M18 5h3v7h-9v4M10 16h4v7h-4z'),r(2,1,17,8,2)+line('M19 5h3v8H12v3')+r(9,16,6,7,1));
add('Trades','hard-hat','safety construction builder',p('M3 17v-3a9 9 0 0 1 18 0v3M8 6v6M16 6v6M11 4V2h2v2M2 17h20v4H2z'),p('M3 16v-3c0-5 3-8 7-9V1h4v3c4 1 7 4 7 9v3zM1 18h22v4H1z'));
add('Trades','ruler','measure dimensions length',p('M2 16L16 2l6 6L8 22zM6 12l3 3M10 8l3 3M14 4l3 3'),hole('M1 16L16 1l7 7L8 23zM5 12l4 4 1-1-4-4zM9 8l4 4 1-1-4-4zM13 4l4 4 1-1-4-4z'));
add('Trades','drill','power tool install',p('M3 4h13v9H3zM16 7h6M6 13v9h5l2-9M2 8h7'),p('M2 3h15v11H2zM18 6h5v4h-5zM5 16h7l-2 7H5z'));
add('Trades','bolt','electric power energy',p('M14 2L3 14h8l-1 8 11-12h-8z'),p('M15 1L1 15h9l-1 8L23 9h-9z'));
add('Trades','pipe','plumber water connection',p('M2 5h12v9h8v6H8v-9H2zM2 3v10M22 12v10'),p('M1 3h3v2h11v9h5v-2h3v10h-3v-2H8v-9H4v2H1z'));
add('Trades','saw','wood cutting workshop',p('M2 5h6l3 5 11 10H9l-2-2-2 2-2-2-1 2zM5 8v6'),hole('M1 4h8l3 6 11 11H9l-2-2-2 2-2-2-2 2zM4 7v8h3V7z'));
add('Trades','trowel','masonry concrete plaster',p('M3 3l17 9-10 7zM15 17l5 5M18 19l3-3'),p('M2 2l20 10-12 9zM15 18l5 5 3-3-5-5z'));
add('Trades','toolbox','equipment tools maintenance',r(2,8,20,13,2)+p('M8 8V3h8v5M2 13h20M9 11v5M15 11v5'),hole('M7 2h10v5h6v15H1V7h6zM9 4v3h6V4zM2 12v2h6v3h2v-3h4v3h2v-3h6v-2H16v-2h-2v2h-4v-2H8v2z'));

// Home and property
add('Home','house','home property residential',p('M2 11l10-9 10 9M5 9v13h5v-7h4v7h5V9'),p('M1 11L12 1l11 10-2 2-1-1v11h-6v-8h-4v8H4V12l-1 1z'));
add('Home','building','office commercial property',p('M4 22V6l9-4v20M13 9h7v13M8 8v1M8 13v1M8 18v1M17 13v1M17 18v1M2 22h20'),hole('M3 5l11-4v7h7v15H3zM7 8v2h3V8zM7 13v2h3v-2zM7 18v2h3v-2zM17 12v3h2v-3zM17 18v3h2v-3z'));
add('Home','key','access property security',c(8,8,5)+p('M11.5 11.5L22 22M17 17l3-3M20 20l3-3'),ring(7.5,7.5,6,3)+p('M10 12l11 11 2-2-2-2 2-2-2-2-2 2-2-2 2-2-2-2-2 2-3-3z'));
add('Home','door','entrance entry interior',p('M5 22V3h14v19M3 22h18M5 3l10 3v16M11 12v3'),hole('M4 2h16v20h2v1H2v-1h2zM15 4v18h3V4zM10 12v3h2v-3z'));
add('Home','window','glazing panes glass',r(3,3,18,18,1)+p('M3 12h18M12 3v18'),hole('M2 2h20v20H2zM4 4v7h7V4zM13 4v7h7V4zM4 13v7h7v-7zM13 13v7h7v-7z'));
add('Home','roof','roofing shelter covering',p('M2 13L12 3l10 10M5 10v11h14V10M15 5V2h4v7'),p('M1 12L12 1l3 3V1h5v8l3 3-2 2-9-9-9 9zM5 13l7-6 7 6v9H5z'));
add('Home','sofa','living furniture couch',p('M5 11V5h14v6M2 11h5v5h10v-5h5v10H2zM5 21v2M19 21v2'),p('M4 4h16v6h-4v5H8v-5H4zM1 11h5v6h12v-6h5v11H1z'));
add('Home','bed','sleep bedroom lodging',p('M3 3v19M21 10v12M3 17h18M3 9h18v8M6 9V6h6v3'),p('M2 2h2v6h2V5h7v3h9v15h-3v-5H5v5H2z'));
add('Home','bath','bathroom tub plumbing',p('M2 12h20l-2 8H5zM5 12V5c0-4 5-4 5 0M7 5h5M7 20v3M18 20v3'),p('M1 11h22l-3 10H5zM6 21h3v2H6zM17 21h3v2h-3z')+line('M5 10V5c0-4 5-4 5 0M8 5h4'));
add('Home','lamp','light fixture lighting',p('M7 2h10l4 11H3zM12 13v8M7 22h10'),p('M6 1h12l5 13H1zM11 15h2v5h5v3H6v-3h5z'));
add('Home','fence','garden boundary outdoor',p('M3 22V5l3-3 3 3v17M15 22V5l3-3 3 3v17M9 8h6M9 17h6'),p('M2 23V5l4-4 4 4v2h4V5l4-4 4 4v18h-8v-5h-4v5zM10 10v5h4v-5z'));
add('Home','thermometer','temperature heating hvac',p('M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 9v9'),hole('M8 13V5a4 4 0 0 1 8 0v8a6 6 0 1 1-8 0M10 14l-1 1a4 4 0 1 0 6 0l-1-1V5a2 2 0 0 0-4 0z')+r(11,8,2,10,1)+c(12,18,2));

// Hospitality and food
add('Hospitality','utensils','food restaurant dining cutlery',p('M3 2v6c0 4 6 4 6 0V2M6 2v20M17 22V2c-5 3-5 11 0 11h3V2'),p('M2 1h2v6h1V1h2v6h1V1h2v7c0 2-1 4-3 4v11H5V12c-2 0-3-2-3-4zM20 1v22h-3V14h-4V8c0-5 3-7 7-7'));
add('Hospitality','coffee','cafe cup drink tea',p('M3 8h14v10c0 5-14 5-14 0zM17 9h2c5 0 5 7-2 7M6 2v2M11 2v2M2 23h17'),p('M2 7h15v11c0 7-15 7-15 0zM2 22h17v2H2z')+ring(18,12,5,3)+line('M6 1v3M11 1v3'));
add('Hospitality','wine','bar drinks glass beverage',p('M6 2h12l-1 9c-1 6-9 6-10 0zM12 15v7M7 22h10M7 8h10'),p('M5 1h14l-1 10c-.3 4-2.5 5-5 6v4h5v2H6v-2h5v-4c-2.5-1-4.7-2-5-6z'));
add('Hospitality','chef-hat','kitchen cook chef',p('M6 16a5 5 0 0 1-2-9 5 5 0 0 1 8-4 5 5 0 0 1 8 4 5 5 0 0 1-2 9v6H6zM6 18h12'),p('M6 16a5 5 0 0 1-2-9 5 5 0 0 1 8-4 5 5 0 0 1 8 4 5 5 0 0 1-2 9v6H6z'));
add('Hospitality','pizza','food slice italian takeaway',p('M3 3c8 0 14 6 18 13L3 22zM4 7c6 0 10 4 13 10')+c(7,12,1)+c(11,16,1),hole('M2 1c10 1 17 7 21 16L2 23zM5 6c6 1 10 4 13 9l2-1C17 8 11 4 5 4zM5 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M10 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0'));
add('Hospitality','cake','birthday bakery celebration',p('M3 13h18v9H3zM6 13V8h12v5M12 8V4M12 1v1M3 17l3 2 3-2 3 2 3-2 3 2 3-2'),p('M2 13h20v10H2zM5 7h14v4H5zM11 3h2v3h-2z')+c(12,1,1));
add('Hospitality','cloche','room-service serving restaurant',p('M3 18a9 9 0 0 1 18 0zM1 22h22M12 9V5M9 5h6'),p('M2 19a10 10 0 0 1 9-10V6H8V4h8v2h-3v3a10 10 0 0 1 9 10zM1 21h22v2H1z'));
add('Hospitality','bottle','drink water beverage',p('M9 2h6v5l3 4v11H6V11l3-4zM6 14h12M6 18h12'),hole('M8 1h8v6l3 4v12H5V11l3-4zM7 14v5h10v-5z'));
add('Hospitality','ice-cream','dessert frozen gelato',p('M5 10c-4-10 18-10 14 0M3 10h18v4H3zM6 14l6 9 6-9'),p('M4 8c0-9 16-9 16 0zM2 10h20v5H2zM7 17h10l-5 7z'));
add('Hospitality','ticket','admission event reservation',p('M2 5h20v5c-5 0-5 4 0 4v5H2v-5c5 0 5-4 0-4zM15 5v3M15 11v2M15 16v3'),hole('M1 4h22v7c-4 0-4 2 0 2v7H1v-7c4 0 4-2 0-2zM14 5v3h2V5zM14 10v4h2v-4zM14 16v3h2v-3z'));
add('Hospitality','sparkles','clean shine special magic',p('M13 2l3 7 6 3-6 3-3 7-3-7-6-3 6-3zM4 2v5M1.5 4.5h5'),p('M13 1l3.5 7.5L24 12l-7.5 3.5L13 23l-3.5-7.5L2 12l7.5-3.5zM4 1l1 2 2 1-2 1-1 2-1-2-2-1 2-1z'));
add('Hospitality','music','song entertainment note',p('M9 18V5l12-3v14M9 9l12-3')+c(5.5,18.5,3.5)+c(17.5,16.5,3.5),p('M8 4l14-3v16h-3V8l-8 2v9H8z')+c(6,19,4)+c(18,17,4));

// Health and wellness
add('Health','heart','care love favorite wellness',p('M12 21C-8 9 5-5 12 6c7-11 20 3 0 15z'),p('M12 23C-11 9 4-7 12 4c8-11 23 5 0 19z'));
add('Health','medical-cross','first-aid clinic healthcare',p('M8 2h8v6h6v8h-6v6H8v-6H2V8h6z'),p('M7 1h10v6h6v10h-6v6H7v-6H1V7h6z'));
add('Health','pulse','heartbeat fitness vital health',p('M1 13h5l3-9 5 17 3-8h6'),p('M1 12h4L9 1l5 17 2-6h7v2h-5l-4 9L9 7l-2 7H1z'));
add('Health','stethoscope','doctor clinic examination',p('M3 3v6a5 5 0 0 0 10 0V3M2 3h3M11 3h3M8 14v3c0 7 12 7 12-1v-2')+c(20,11,3),line('M3 3v6a5 5 0 0 0 10 0V3M8 14v3c0 7 12 7 12-1v-2')+r(1,1,5,4,1)+r(10,1,5,4,1)+ring(20,11,4,2));
add('Health','pill','medicine pharmacy capsule',p('M4 20c-7-6 10-23 16-16s-10 23-16 16zM7 7l10 10'),p('M3 12l9 9c-8 7-16-1-9-9M5 10l9 9 7-7C28 4 20-4 12 3z'));
add('Health','tooth','dentist dental smile',p('M3 7c0-7 5-6 9-4 4-2 9-3 9 4 0 6-3 15-5 15-2 0-1-9-4-9s-2 9-4 9C6 22 3 13 3 7z'),p('M2 7C2-1 8 0 12 2c4-2 10-3 10 5 0 7-3 16-6 16-3 0-1-9-4-9s-1 9-4 9C5 23 2 14 2 7'));
add('Health','eye','vision view visible',p('M1 12c5-11 17-11 22 0-5 11-17 11-22 0z')+c(12,12,4),hole('M0 12c6-13 18-13 24 0-6 13-18 13-24 0M7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0')+c(12,12,2.5));
add('Health','dumbbell','gym exercise training strength',p('M2 8h4v8H2zM6 5h4v14H6zM10 10h4v4h-4M14 5h4v14h-4zM18 8h4v8h-4z'),p('M1 7h4V4h5v5h4V4h5v3h4v10h-4v3h-5v-5h-4v5H5v-3H1z'));
add('Health','spa','wellness beauty relaxation lotus',p('M12 21C-1 21 0 10 0 10s8 0 12 11c4-11 12-11 12-11s1 11-12 11zM12 15C5 8 12 1 12 1s7 7 0 14z'),p('M12 23C0 23 0 14 0 9c6 0 9 4 12 10 3-6 6-10 12-10 0 5 0 14-12 14M12 16C4 8 12 0 12 0s8 8 0 16'));
add('Health','accessibility','inclusive access person',c(12,3.5,2)+p('M3 8h18M12 8v7M6 22l6-7 6 7'),c(12,3,3)+p('M2 7h20v3h-8v5l6 7-2 2-6-7-6 7-2-2 6-7v-5H2z'));
add('Health','shield-check','safety protection verified',p('M12 2l9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6zM7 12l3 3 7-7'),hole('M12 1l10 4v7c0 6-5 9-10 11C7 21 2 18 2 12V5zM6 12l4 5 8-9-1.5-1.5-6.5 7-2.5-3z'));
add('Health','bandage','injury wound first-aid',p('M3 9l6-6 12 12-6 6zM7 13l6-6M11 17l6-6M10 10l4 4'),hole('M1 9l8-8 14 14-8 8zM6 13l7-7 1 1-7 7zM10 17l7-7 1 1-7 7zM10 10l4 4 1-1-4-4z'));

// Nature and weather
add('Nature','leaf','eco sustainable garden plant',p('M3 21C-1 7 11 4 21 2c-2 11-5 23-18 19zM3 21L16 8'),p('M2 22C-4 7 11 3 23 1c-2 12-6 27-21 21')+hole('M2 22l15-15 1 1-15 15z'));
add('Nature','tree','landscape forest arborist',p('M12 2L4 11h4l-6 7h20l-6-7h4zM12 18v5'),p('M12 0L2 12h5l-7 8h10v4h4v-4h10l-7-8h5z'));
add('Nature','flower','florist garden bloom',p('M12 7C4-1 0 8 6 12c-6 4-2 13 6 5 8 8 12-1 6-5 6-4 2-13-6-5z')+c(12,12,2.5),hole('M12 7C4-1 0 8 6 12c-6 4-2 13 6 5 8 8 12-1 6-5 6-4 2-13-6-5zM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0'));
add('Nature','sun','day sunny brightness',c(12,12,5)+p('M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2'),c(12,12,6)+line('M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2'));
add('Nature','moon','night dark crescent',p('M20 16C8 21 3 9 9 3-5 8 3 30 20 16z'),p('M21 15C9 21 3 9 10 1-7 5 2 33 21 15'));
add('Nature','cloud','weather sky overcast',p('M6 19C-4 19 0 7 7 10 7-2 25 2 21 12c6 3 2 7-2 7z'),p('M5 21C-4 21-2 7 6 8 9-5 27 3 22 12c6 4 1 9-3 9z'));
add('Nature','rain','weather rainy water',p('M5 14C-3 14 1 3 8 6c2-10 16-4 12 3 6 2 3 5-1 5zM6 18l-2 4M13 18l-2 4M20 18l-2 4'),p('M4 15C-4 15-1 2 7 4 12-6 26 2 22 9c5 4 1 6-3 6z')+line('M6 18l-2 4M13 18l-2 4M20 18l-2 4'));
add('Nature','snowflake','winter cooling frost',p('M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M9 3l3 3 3-3M9 21l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1'),line('M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M9 3l3 3 3-3M9 21l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1'));
add('Nature','droplet','water plumbing liquid',p('M12 2c-2 5-9 9-9 14 0 9 18 9 18 0 0-5-7-9-9-14zM7 16c0 2 1 3 3 3'),hole('M12 0C9 7 2 10 2 16c0 10 20 10 20 0 0-6-7-9-10-16M6 15h2c0 3 1 4 3 4v2c-4 0-5-2-5-6'));
add('Nature','flame','fire heat fireplace',p('M11 2c0 8-9 9-8 15 2 10 20 6 18-3-1-3-3-5-4-6 0 4-2 5-3 5 2-5 0-8-3-11z'),p('M10 0c2 9-10 11-9 18 2 10 24 7 22-4-1-4-4-7-7-9 1 5-1 7-2 8 2-6 0-10-4-13'));
add('Nature','recycle','reuse sustainable environment',p('M8 6l4-5 5 8M17 4v5h-5M19 11l4 6-8 1M19 21l-4-3 3-4M11 20H3l4-8M2 15l5-3 3 5'),line('M8 6l4-5 5 8M19 11l4 6-8 1M11 20H3l4-8')+p('M18 3v7h-7zM20 22l-6-4 4-5zM1 15l7-4 3 7z'));
add('Nature','mountain','outdoor landscape peak',p('M1 22L9 5l5 9 3-5 6 13zM6 11l3 2 3-2'),hole('M0 23L9 3l5 9 3-5 7 16zM6 11l3 2 3-2-3-5z'));

// Travel and locations
add('Travel','map-pin','location address place',p('M12 23S3 15 3 10a9 9 0 0 1 18 0c0 5-9 13-9 13z')+c(12,10,3),hole('M12 24S2 16 2 10a10 10 0 0 1 20 0c0 6-10 14-10 14M8 10a4 4 0 1 0 8 0 4 4 0 1 0-8 0'));
add('Travel','map','directions territory region',p('M2 5l7-3 6 3 7-3v17l-7 3-6-3-7 3zM9 2v17M15 5v17'),p('M1 4l7-3v18l-7 4zM10 1l4 3v19l-4-3zM16 5l7-4v19l-7 3z'));
add('Travel','compass','direction explore navigation',c(12,12,10)+p('M16 7l-3 6-6 3 3-6z'),ring(12,12,11,9)+p('M17 6l-4 8-7 3 4-7z'));
add('Travel','car','vehicle auto transport',p('M3 11l3-7h12l3 7v10h-4v-3H7v3H3zM3 11h18M6 15h2M16 15h2'),hole('M2 10l3-7h14l3 7v12h-6v-3H8v3H2zM6 5l-2 5h16l-2-5zM5 13v3h4v-3zM15 13v3h4v-3z'));
add('Travel','truck','delivery freight logistics',p('M2 4h12v14H2zM14 9h5l3 5v4h-8M14 14h8')+c(6,19,3)+c(18,19,3),p('M1 3h13v14H1zM16 8h4l3 6v3h-7z')+c(6,20,3)+c(18,20,3));
add('Travel','bicycle','cycling bike transport',c(5.5,17.5,4.5)+c(18.5,17.5,4.5)+p('M5.5 17.5L10 8l8.5 9.5L15 3h4M5.5 17.5h8L8 6H5'),ring(5.5,17.5,5,3.5)+ring(18.5,17.5,5,3.5)+line('M5.5 17.5L10 8l8.5 9.5L15 3h4M5.5 17.5h8L8 6H5'));
add('Travel','plane','flight airport travel',p('M12 1l2 8 9 5v3l-9-3v5l3 2v2l-5-1-5 1v-2l3-2v-5l-9 3v-3l9-5z'),p('M12 0l3 9 9 5v4l-9-3v4l3 2v3l-6-2-6 2v-3l3-2v-4-0l-9 3v-4l9-5z'));
add('Travel','train','rail transit station',r(5,2,14,17,3)+p('M5 10h14M12 2v8M7 15h1M16 15h1M8 19l-3 4M16 19l3 4'),hole('M8 1h8q4 0 4 4v12q0 3-4 3H8q-4 0-4-3V5q0-4 4-4M6 5v5h5V5zM13 5v5h5V5zM6 14v3h3v-3zM15 14v3h3v-3z')+p('M7 20h3l-2 3H4zM14 20h3l3 3h-4z'));
add('Travel','boat','marine sailing water',p('M2 15l10-3 10 3-4 6H6zM12 12V1l8 9H4l5-6M1 23h22'),p('M1 15l11-3 11 3-5 7H6zM13 0v11h9zM10 2L2 11h8zM0 23h24v1H0z'));
add('Travel','suitcase','luggage vacation travel',r(4,6,16,16,2)+p('M9 6V2h6v4M8 10v8M16 10v8'),hole('M8 1h8v4h5v18H3V5h5zM10 3v2h4V3zM7 9v10h2V9zM15 9v10h2V9z'));
add('Travel','parking','car park vehicle lot',r(2,2,20,20,3)+p('M9 18V6h4c6 0 6 7 0 7H9'),hole('M1 1h22v22H1zM8 5v14h3v-5h3c7 0 7-9 0-9z')+p('M11 8h3c3 0 3 3 0 3h-3z'));
add('Travel','route','journey directions itinerary',c(5,4,2.5)+c(19,20,2.5)+p('M5 6.5v4h12c6 0 6 5 0 5H7c-5 0-5 5 0 5h9.5'),c(5,4,3.5)+c(19,20,3.5)+line('M5 8v2h12c6 0 6 5 0 5H7c-5 0-5 5 0 5h8'));

// Technology and security
add('Technology','monitor','desktop computer screen',r(2,3,20,14,1)+p('M12 17v5M7 22h10'),hole('M1 2h22v16H1zM3 4v11h18V4z')+p('M10 19h4v2h5v2H5v-2h5z'));
add('Technology','laptop','computer notebook device',p('M4 3h16v14H4zM2 17h20l1 4H1z'),hole('M3 2h18v14H3zM5 4v10h14V4z')+p('M2 17h20l2 6H0z'));
add('Technology','mobile','phone smartphone device',r(6,1,12,22,2)+p('M10 4h4M11 20h2'),hole('M5 0h14v24H5zM7 4v14h10V4zM10 20v2h4v-2z'));
add('Technology','wifi','wireless internet network',p('M1 7c6-6 16-6 22 0M5 12c4-4 10-4 14 0M9 17c2-2 4-2 6 0M12 21v.1'),line('M1 7c6-6 16-6 22 0M5 12c4-4 10-4 14 0M9 17c2-2 4-2 6 0')+c(12,21,1.5));
add('Technology','lock','secure private password',r(4,10,16,13,2)+p('M8 10V6a4 4 0 0 1 8 0v4M12 15v4'),hole('M3 9h4V6a5 5 0 0 1 10 0v3h4v15H3zM9 6v3h6V6a3 3 0 0 0-6 0M11 14v5h2v-5z'));
add('Technology','unlock','open access security',r(4,10,16,13,2)+p('M8 10V6c0-6 8-6 8-1M12 15v4'),hole('M3 9h4V6c0-8 11-8 11 0h-2c0-5-7-5-7 0v3h12v15H3zM11 14v5h2v-5z'));
add('Technology','shield','protect security safety',p('M12 2l9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6z'),p('M12 1l10 4v7c0 6-5 9-10 11C7 21 2 18 2 12V5z'));
add('Technology','gear','settings configure preferences',p('M9 2h6l1 4 4 1 3 5-3 5-4 1-1 4H9l-1-4-4-1-3-5 3-5 4-1z')+c(12,12,4),hole('M9 1h6l1 4 5 2 3 5-3 5-5 2-1 4H9l-1-4-5-2-3-5 3-5 5-2zM7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0'));
add('Technology','code','developer html programming',p('M7 5l-6 7 6 7M17 5l6 7-6 7M14 2l-4 20'),p('M6 3l2 2-6 7 6 7-2 2-7-9zM18 3l-2 2 6 7-6 7 2 2 7-9zM13 1h2l-4 22H9z'));
add('Technology','database','storage data records',p('M3 5c0-4 18-4 18 0s-18 4-18 0zM3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0'),p('M2 4c0-5 20-5 20 0s-20 5-20 0M2 9c5 3 15 3 20 0v5c-5 3-15 3-20 0zM2 18c5 3 15 3 20 0v3c-5 4-15 4-20 0z'));
add('Technology','server','hosting infrastructure rack',r(2,2,20,8,1)+r(2,14,20,8,1)+p('M6 6h.1M6 18h.1M11 6h7M11 18h7'),hole('M1 1h22v10H1zM5 4v3h3V4zM12 5v2h7V5zM1 13h22v10H1zM5 17v3h3v-3zM12 17v2h7v-2z'));
add('Technology','link','url connection chain',p('M9 15l6-6M7 12L3 16c-5 6 3 10 6 6l4-4M11 6l4-4c6-5 10 3 6 6l-4 4'),line('M9 15l6-6M7 12L3 16c-5 6 3 10 6 6l4-4M11 6l4-4c6-5 10 3 6 6l-4 4'));

// Media and creative work
add('Media','image','photo picture gallery',r(2,3,20,18,1)+c(8,8,2)+p('M2 18l7-6 4 3 4-6 5 8'),hole('M1 2h22v20H1zM3 4v13l6-6 4 3 4-6 4 7V4zM5 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0'));
add('Media','camera','photo photography capture',p('M2 7h5l2-4h6l2 4h5v15H2z')+c(12,14,5),hole('M1 6h5l2-4h8l2 4h5v17H1zM6 14a6 6 0 1 0 12 0 6 6 0 1 0-12 0')+c(12,14,3.5));
add('Media','play','video start watch',p('M6 2l16 10L6 22z'),p('M4 0l20 12L4 24z'));
add('Media','pause','video stop wait',r(5,3,4,18)+r(15,3,4,18),r(4,2,6,20,1)+r(14,2,6,20,1));
add('Media','volume','audio speaker sound',p('M2 9h5l7-6v18l-7-6H2zM18 7c4 3 4 7 0 10M20 3c4 5 4 13 0 18'),p('M1 8h5l9-8v24l-9-8H1z')+line('M18 7c4 3 4 7 0 10M20 3c4 5 4 13 0 18'));
add('Media','star','rating favorite review',p('M12 2l3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z'),p('M12 0l3.5 7.5L24 9l-6 6 1 9-7-4.5L5 24l1-9-6-6 8.5-1.5z'));
add('Media','bookmark','save reading favorite',p('M5 2h14v21l-7-5-7 5z'),p('M4 1h16v23l-8-6-8 6z'));
add('Media','quote','testimonial quotation words',p('M2 4h8v9H6c0 4 1 5 4 6v3c-7-1-8-6-8-9zM14 4h8v9h-4c0 4 1 5 4 6v3c-7-1-8-6-8-9z'),p('M1 3h10v11H7c0 3 1 3 4 4v5C3 22 1 18 1 12zM13 3h10v11h-4c0 3 1 3 4 4v5c-8-1-10-5-10-11z'));
add('Media','edit','pencil write compose',p('M3 16L17 2l5 5L8 21l-6 1zM14 5l5 5'),p('M1 16L14 3l7 7L8 23H1zM16 1l2-1 6 6-1 2z'));
add('Media','palette','design colors art',p('M22 10c0-12-21-12-21 1 0 9 10 14 12 10 1-2-3-6 2-6h4c3 0 3-3 3-5z')+c(7,7,1)+c(14,5,1)+c(19,9,1)+c(5,13,1),hole('M23 10C23-4 0-3 0 11c0 11 13 16 14 10 1-3-4-5 1-5h4c4 0 4-3 4-6M5 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0M17 9a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 13a2 2 0 1 0 4 0 2 2 0 1 0-4 0'));
add('Media','scissors','cut salon craft',c(5,18,3.5)+c(19,18,3.5)+p('M7.5 15.5L21 2M16.5 15.5L3 2'),ring(5,18,4.5,2.5)+ring(19,18,4.5,2.5)+p('M6 15L20 0l2 2L8 17zM16 17L2 2l2-2 14 15z'));
add('Media','film','video movie cinema',r(2,2,20,20,1)+p('M7 2v20M17 2v20M2 7h5M2 12h5M2 17h5M17 7h5M17 12h5M17 17h5'),hole('M1 1h22v22H1zM8 3v18h8V3zM3 4v3h3V4zM3 10v4h3v-4zM3 17v3h3v-3zM18 4v3h3V4zM18 10v4h3v-4zM18 17v3h3v-3z'));

entries.push(...industryIcons);
export const icons: readonly IconDefinition[] = Object.freeze(entries.map(icon => {
  const refined = { ...icon, ...refinedIndustryMasters[icon.name], ...industryRefinementsV4[icon.name] };
  return Object.freeze({ ...refined, ...(studioIcons[icon.name] ? { families: studioIcons[icon.name] } : {}),
    ...(industryIconReviews[icon.name] ? { reviewedVersion: industryIconReviews[icon.name]!.version } : {}),
    ...(industryRefinementsV4[icon.name] ? {refinedVersion:4} : coreStudioIconNames.includes(icon.name) || refinedIndustryMasters[icon.name] ? { refinedVersion: 3 } : {}),
    keywords: Object.freeze([...icon.keywords]), duotone: Object.freeze({ ...refined.duotone }) });
}));
export const iconNames = Object.freeze(icons.map(icon => icon.name));
const byName = new Map(icons.map(icon => [icon.name, icon]));
export const iconAliases: Readonly<Record<string, string>> = Object.freeze({
  x: 'close', tick: 'check', email: 'mail', telephone: 'phone', home: 'house',
  location: 'map-pin', settings: 'gear', shopping: 'cart', hamburger: 'menu',
  magnify: 'search', person: 'user', photo: 'image', question: 'help',
  'shopping-cart': 'cart', 'creditcard': 'credit-card', 'map-marker': 'map-pin',
});
export function getIcon(name: string): IconDefinition | undefined {
  return byName.get(iconAliases[name] ?? name);
}
export function availableIconVariants(name: string): readonly IconVariant[] {
  const icon = getIcon(name);
  return icon ? [...BASE_ICON_VARIANTS, ...STUDIO_VARIANTS.filter(variant => icon.families?.[variant])] : [];
}
export const iconVariantCount = icons.reduce((count, icon) => count + BASE_ICON_VARIANTS.length + Object.keys(icon.families ?? {}).length, 0);
export function searchIcons(query = '', category?: string): readonly IconDefinition[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return icons.filter(icon => (!category || icon.category === category) && terms.every(term =>
    [icon.name, icon.category, ...icon.keywords, ...Object.keys(iconAliases).filter(alias => iconAliases[alias] === icon.name)].join(' ').toLowerCase().includes(term)));
}
