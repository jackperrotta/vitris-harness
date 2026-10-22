/**
 * Original Vitris studio families, authored 2026-10-22.
 * Each master is drawn for its family. No imported paths, automatic
 * silhouette conversion, random distortion, fonts, masks, filters or raster data.
 */
import { p, c, r, hole } from './drawing.ts';
import { industryStudioIcons } from './studio-industry.ts';
export { industryStudioIconNames } from './studio-industry.ts';

export const STUDIO_VARIANTS = ['soft', 'block', 'cutout', 'imprint', 'sketch'] as const;
export type StudioVariant = typeof STUDIO_VARIANTS[number];
export const studioFamilyInfo = {
  soft: { label: 'Soft', description: 'Open squircle curves, generous counters, rounded terminals. Friendly interfaces and approachable services.', layered: false },
  block: { label: 'Block', description: 'Heavy transparent frames, broad feet and a deliberate lower-right extrusion. Bold editorial accents.', layered: false },
  cutout: { label: 'Cutout', description: 'Separated solid pieces, curved cut-ins and clear geometric gaps. Graphic feature illustrations.', layered: false },
  imprint: { label: 'Imprint', description: 'Organic color shapes with a few carefully placed ink lines. Warm, informal storytelling.', layered: true },
  sketch: { label: 'Sketch', description: 'Individually drawn pencil-like curves, restrained asymmetry and intentional pen lifts. Editorial and personal sites.', layered: false },
} as const;

const ink = (d: string, width = 1.35) => `<path fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
const secondary = (geometry: string) => `<g class="vitris-icon__secondary" style="color:var(--icon-secondary-color,currentColor);opacity:var(--icon-secondary-opacity,.35)">${geometry}</g>`;
const primary = (geometry: string) => `<g class="vitris-icon__primary" style="color:var(--icon-primary-color,currentColor);opacity:var(--icon-primary-opacity,1)">${geometry}</g>`;
const imprint = (body: string, detail: string) => secondary(body) + primary(detail);
type Masters = Record<StudioVariant, string>;
const drawings: Record<string, Masters> = {};
const a = (name: string, soft: string, block: string, cutout: string, print: string, sketch: string) => { drawings[name] = { soft, block, cutout, imprint: print, sketch }; };

a('house',
  ink('M3.2 10.1C5.5 7.7 8.6 5 11.4 3.2q.6-.4 1.2 0c2.8 1.8 5.9 4.5 8.2 6.9M5.1 13v4.2q0 3.3 3.2 3.3h.5v-4.3q0-3.1 3.2-3.1t3.2 3.1v4.3h.5q3.2 0 3.2-3.3V13',2.3),
  p('M2 10L11.8 2l9 7.4v3L11.8 5 2 13zM4 12.5h3V19h2.5v-5h6v5H18v-6.5h3V22h-7v-5h-1.5v5H4zM21 12.5l1 1V23h-8v-1h7z'),
  p('M2 10l10-8 10 8H2zM4 12h7v9H4zM13 12h7v9h-4v-5h-3z')+c(12,7,1.3),
  imprint(p('M4.8 10.4C2 13 3.8 21 8 21h8c4.1 0 5.4-7.5 2.8-10.6L13.1 5q-1.2-1.1-2.4 0z'),ink('M3.1 10.5L12 2.8l8.9 7.7M9 21v-6q0-1.5 1.5-1.5h3q1.5 0 1.5 1.5v6')),
  ink('M2.8 10.8q4.5-4.5 9-7.8 4.4 3.6 9 7.4M5 12.1l.1 8.4 3.8.2-.1-5.6 5.9-.2.2 5.8 4-.1-.2-8.1M7.3 21h-3'));

a('user',
  ink('M16.2 7.3c0 5.9-8.4 5.9-8.4 0s8.4-5.9 8.4 0M4.5 20.5v-.8c0-3.5 3.1-5.4 7.5-5.4s7.5 1.9 7.5 5.4v.8',2.3),
  hole('M6 7a5.5 5.5 0 1 0 11 0 5.5 5.5 0 1 0-11 0M9 7a2.5 2.5 0 1 1 5 0 2.5 2.5 0 1 1-5 0')+hole('M2 21c0-10 19-10 19 0v1H2zM5.5 19h12c-1.7-3.8-10.3-3.8-12 0')+p('M21 19l1 1v3H3v-1h18z'),
  c(12,6.5,4.5)+p('M2 21c0-4.8 4.5-7.5 9-7.5V21zM13 13.5c4.5 0 9 2.7 9 7.5h-9z'),
  imprint(p('M8 3c-2 2-1.6 7.1 1.4 8.2 4.1 1.6 7-1.2 6.5-4.9C15.5 2.5 10.7 1 8 3M4.3 20.8c-2.6-6.7 17.4-9.1 15.3-.1z'),ink('M5.1 20.9c.5-5 4.2-7.2 7.3-7.1 3.4.2 6.6 2 7.3 6.8')),
  ink('M16.1 7.1c.6-6-8.6-6.5-8.5.2.1 5.3 8.4 5.8 8.5-.2M3.9 21c-.4-4.7 3.6-7.1 8-7 4.7.2 7.9 2.8 7.7 6.5l-13.8.3'));

a('mail',
  ink('M4.9 4.7h14.2q2.2 0 2.2 3v8.6q0 3-3 3H5.7q-3 0-3-3v-6M3.3 6l7.1 5.5q1.6 1.2 3.2 0l7.1-5.5',2.3),
  hole('M2 4h19v17H2zM5 7v11h13V7z')+p('M5 7l6.5 5 6.5-5v3l-6.5 5L5 10zM21 6l1 1v15H3v-1h18z'),
  p('M2 5h20L12 13zM2 8l7 6-7 6zM22 8v12l-7-6zM10.5 15l1.5 1.2 1.5-1.2 7 6H3.5z'),
  imprint(p('M3 6c3.6-2 16.3-2.9 18 1s1 10.8-1.9 12.2c-3.1 1.4-14.6 1.4-16.4-1.4C.9 15 1.2 8 3 6'),ink('M2.7 6.6l8.4 6.3q1 .8 2 0l8.1-6.3M4 20h15.5')),
  ink('M3.1 5.1l17.6-.3.2 14.5-17.5.5-.3-12.4M3 5.2q4.1 3.5 8.8 7 4.7-3.3 9-7.3M3.7 18.8l5-5M20.7 19l-5.2-5'));

a('phone',
  ink('M8 4.1q-3.6-1.2-3.8 2.3C3.8 12.9 11.1 20.2 17.6 19.8q3.5-.2 2.3-3.8l-3.2-1.6-2.1 2c-3.5-1.6-5.4-3.5-7-7.1l2-2.1z',2.3),
  hole('M3 2h6l3 6-3 3q1.5 3 4.5 4.5l3-3 6 3v6c-10 4-24-10-19.5-19zM5.5 5c-1 6 7.5 14.5 13.5 13.5V17l-2-1-3 3c-5-2-8.5-5.5-10.5-10.5l3-3-1-2z'),
  p('M3 2h5l3 6-3 3-5-2zM3 11l4 2q2 3 5 5l-2 3c-4-2-6-6-7-10M14 17l4-4 5 3v5l-5 1z'),
  imprint(p('M4 3.5c-6 6.6 7.5 21.5 15.9 16.1l-3.7-5-3 1.9-5.5-5.7 1.9-3z'),ink('M4.7 3.6l3.7 4.5-1.7 2.7q2.1 3.5 5.9 5.7l2.6-1.8 4.6 4.2')),
  ink('M8.4 3.2l2 4.7-2.7 2.3q2.2 3.8 6 6l2.2-2.6 4.8 2.1c1.4 6-3.3 6.2-7.3 4.3C7.8 17.4 3.5 12.5 3.1 7c-.2-3.4 1.5-4.4 5.3-3.8'));

a('calendar',
  ink('M3.2 10v7.7q0 3 3 3h11.6q3 0 3-3V8q0-3-3-3H6.2q-3 0-3 3M7.6 3v4M16.4 3v4M3.6 10h16.8M8 14h1M15 14h1M8 17.5h1',2.3),
  hole('M2 4h19v17H2zM5 10v8h13v-8z')+r(6,2,3,5,1)+r(14,2,3,5,1)+r(7,12,3,3)+r(13,12,3,3)+p('M21 6l1 1v15H3v-1h18z'),
  p('M2 5h20v4H2z')+hole('M2 11h9v10H2zM5 14v3h3v-3zM13 11h9v10h-9zM16 14v3h3v-3z')+r(6,2,2,5)+r(16,2,2,5),
  imprint(p('M3.4 6.5c2.1-3.5 16.6-4 17.5.4 1 4.7 1.8 12.9-2.9 14-4.1 1-12.2 1.1-14.5-1.8C1.9 17 1.4 9.9 3.4 6.5'),ink('M7.5 2.6v5M16.5 2.6v5M3.1 10.4h17.8M7 15h3M14 15h3M7 18h3')),
  ink('M3.2 6.1l17.3-.5.3 15.2-17.2.3-.4-12.5M7.4 2.8l.2 5M16.2 2.7l.3 5M3.7 10.9l16.4-.2M7.4 15h2M14.4 14.8h2M7.5 18.5h2'));

a('clock',
  ink('M20.6 12c0 11.6-17.2 11.6-17.2 0S20.6.4 20.6 12M12 6.7v5.6l3.8 2.5',2.3),
  hole('M1.5 11.5a10 10 0 1 0 20 0 10 10 0 1 0-20 0M5 11.5a6.5 6.5 0 1 1 13 0 6.5 6.5 0 1 1-13 0')+p('M10 6h3v5l4 3-2 2-5-4zM21 10c3 7-2 13-9 13v-1c6 0 10-5 9-12'),
  p('M11 2C-1 3-1 21 11 22v-3C3 18 3 6 11 5zM13 2v3c8 1 8 13 0 14v3c12-1 12-19 0-20zM11 7h2v5l4 2-1 2-5-3z'),
  imprint(p('M4.7 5.2C10.1-.7 23.3 3.1 21 14.1c-1.8 8.9-13.3 10-17.5 3.3C1.4 14 1.3 9.1 4.7 5.2'),ink('M12 5.4v7l4.4 2.6M12 2.6h.1M3.3 12h.1M12 21.2h.1M20.7 12h.1')),
  ink('M20.9 11.3c.7 5-3.2 9.6-8.3 10-5.3.4-9.4-3.4-9.7-8.5-.5-5.8 3.8-9.5 8.9-9.8 4.3-.3 8.4 2.8 9.1 8.3M11.8 6.2l.1 6.4 4.2 2.2'));

a('map-pin',
  ink('M12 21s-7.1-5.6-7.1-11.2c0-9.6 14.2-9.6 14.2 0C19.1 15.4 12 21 12 21M14.7 9.5c0 3.6-5.4 3.6-5.4 0s5.4-3.6 5.4 0',2.3),
  hole('M11.5 22S2 15 2 9a9.5 9.5 0 0 1 19 0c0 6-9.5 13-9.5 13M7 9a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0')+p('M21 9c1 7-5 12-9 14l-.5-1C17 18 20 14 21 9'),
  hole('M4 9a8 8 0 1 0 16 0 8 8 0 1 0-16 0M9 9a3 3 0 1 1 6 0 3 3 0 1 1-6 0')+p('M8 18h8l-4 5z'),
  imprint(p('M11.6 22C7.1 18.6 2 14.2 3.6 8.5 5.4 1.6 17.2.5 20 7.2c2.5 6-3.4 11.3-8.4 14.8'),ink('M15.5 9.7c.1 5-7 5-7-.1 0-4.5 6.9-4.7 7 .1M8.3 22.1h7.4')),
  ink('M11.9 22.1C9 19.7 3.6 15 4.1 9.8 5-1 20.6 1 20 10c-.3 4.1-4 8.7-8.1 12.1M15.2 9.6c-.2-4.3-6.2-4-6.2.4 0 3.7 6.4 4.2 6.2-.4'));

a('heart',
  ink('M12 6.4C7.5-.2 1 4.1 3.5 10.9c1.5 4 5.1 6.9 8.5 9.2 3.4-2.3 7-5.2 8.5-9.2C23 4.1 16.5-.2 12 6.4z',2.3),
  hole('M12 22C-7 9 3-5 12 4c9-9 19 5 0 18M12 18C-1 8 5 1 12 8c7-7 13 0 0 10')+p('M21 7c4 6-3 13-9 16v-1c6-4 11-10 9-15'),
  p('M11 5C6-1 0 3 2 10c1 4 5 7 9 10zM13 5c5-6 11-2 9 5-1 4-5 7-9 10z'),
  imprint(p('M11.8 21C-2 12 1.1.7 9.2 3.6L12 6c4.1-6.4 12.6-2.4 9.2 5.2-1.7 3.9-5.9 7.7-9.4 9.8'),ink('M5.3 7.4q-.4 3.4 3.1 6.4')),
  ink('M12.1 6.6C8.4.2.7 3.5 3.5 10.4c1.8 4.2 5.4 7.5 8.4 10.1 3.3-2.5 7.3-6.2 8.7-10.4 2.2-6.9-5.4-9.1-8.5-3.5M5.9 7.1q-.3 2 1 3.8'));

a('star',
  ink('M12 3l2.8 5.5 6 .9-4.4 4.2 1 6-5.4-2.8-5.4 2.8 1-6-4.4-4.2 6-.9z',2.3),
  hole('M12 1l3.3 6.6 7.2 1-5.3 5.1 1.3 7.3-6.5-3.4-6.5 3.4 1.3-7.3L1.5 8.6l7.2-1zM12 7l-1.6 3.3-3.6.5 2.6 2.6-.6 3.5 3.2-1.7 3.2 1.7-.6-3.5 2.6-2.6-3.6-.5z')+p('M18.5 14l1 1L21 23l-8-4-.9-.5 6.4 2.6z'),
  p('M12 2l3 6-3 3-3-3zM2 9l6 .4 2 3-4 1zM22 9l-4 4-4-1 2-3zM7 15l4-1v4l-6 3zM13 14l4 1 2 6-6-3z'),
  imprint(p('M12 2.3l3.3 5.4 6.3 1.4-4.2 4.8.3 6.3-5.7-2.6-5.8 2.6.5-6.3L2.4 9l6.3-1.3z'),ink('M11.9 3.6l2.5 5.2 5.8 1.1M6.9 18.6l4.8-2.6 4.8 2.3')),
  ink('M12.1 2.7l2.7 5.8 6.2 1-4.5 4.4.8 6.1-5.3-2.9-5.6 2.6 1.1-6.1-4.4-4.5 6.3-.7z'));

a('shield-check',
  ink('M12 3l7.6 2.8v5.9c0 5-4.1 7.6-7.6 9.3-3.5-1.7-7.6-4.3-7.6-9.3V5.8zM8.4 12l2.3 2.4 5.1-5',2.3),
  hole('M12 1l9 3.5v8c0 5-5 8.5-9 10-4-1.5-9-5-9-10v-8zM6 6.5v6c0 3 3 5.8 6 7 3-1.2 6-4 6-7v-6l-6-2.3z')+p('M7.5 11.8l2-2 2.1 2.2 4-4 2 2-6 6zM21 5.5l1 1v7c0 5-5 8-9 9.5l-1-.5c5-2 9-6 9-10z'),
  hole('M12 1l9 3v7c0 6-5 9-9 12-4-2-9-6-9-12V4zM7 11l4 5 7-8-2-2-5 6-2-3zM11 2v3h2V2zM11 19v3h2v-3z'),
  imprint(p('M12 2l8.6 3.6c1.3 8-1.9 13-8.6 16.7C5.3 18.6 2.1 13.6 3.4 5.6z'),ink('M8 11.7l2.8 3 5.5-5.6')),
  ink('M11.8 2.6l8 2.7c.8 8.6-1.4 12.1-7.7 16.2-5.4-3-8.8-6.5-8.1-15.9l7.8-3M7.8 11.8l2.9 3.1 5.7-5.8'));

a('leaf',
  ink('M4.1 19.9C1.8 9.5 9 4.4 20 4c-.4 11-5.5 18.2-15.9 15.9M4.8 19.2l10-10',2.3),
  hole('M2 22C-1 8 8 2 22 2c0 14-6 23-20 20M6 18c8 .5 12-4 13-13C10 6 5.5 10 6 18')+p('M3 22L16 9l2 2L5 24z'),
  p('M3 18C1 7 10 3 20 2L3 18zM5 21L22 4c-1 11-6 19-17 17'),
  imprint(p('M3.7 19.8C.4 8.9 10 3.9 21.1 3c-.4 10.8-5.8 20.3-17.4 16.8'),ink('M3.4 21.2L16.8 8M9.3 15.3l-.5-5M12.9 11.6l5 .6')),
  ink('M3.7 20.4C1.5 9.2 10.3 4.2 20.7 3.2c.4 9.5-4.9 18-14.5 17.6M3 22.1L16 8.7M9.3 15.4l-.8-5.5'));

a('coffee',
  ink('M4 8h12.4v6.8q0 5.2-6.2 5.2T4 14.8zM17.1 9.2c6.2-1.1 6.3 7 .3 6.2M7.7 3v1M12.7 3v1M3.8 21.7h13.1',2.3),
  hole('M2 7h15v9c0 8-15 8-15 0zM5 10v6c0 4 9 4 9 0v-6zM17 8h2c6 0 6 10-2 10v-3c4 0 4-4 0-4z')+r(2,21,17,2)+r(6,2,2,3,1)+r(11,2,2,3,1),
  p('M2 8h6v12c-4 0-6-2-6-6zM10 8h7v6c0 4-3 6-7 6z')+hole('M19 8c6 0 6 10 0 10v-3c2 0 2-4 0-4z')+r(2,22,16,1),
  imprint(p('M3.1 8c3.4-1.6 10.2-1.5 13 .1v7.5c0 7-13 7-13 0z'),ink('M17 8.8c6-1 6.3 6.9 0 6.8M6.8 2.6q-1 1.5 0 3M12 2.6q-1 1.5 0 3M2.8 22h14.6')),
  ink('M3.3 8.1l13.2-.2-.1 8.3c-.1 6-12.5 6-12.8-.1l-.3-8M17 9c6.6-.7 5.8 7.9-.3 6.5M7.2 2.7q-1 1.4.1 3M11.8 2.4q-1.1 1.8 0 3M2.8 22.1l14.1-.2'));

a('camera',
  ink('M7 5.8l1.5-2.2h7L17 5.8h1.6q2.7 0 2.7 3v8.4q0 3-3 3H5.7q-3 0-3-3V8.8q0-3 2.7-3zM16.1 12.7c0 5.5-8.2 5.5-8.2 0s8.2-5.5 8.2 0',2.3),
  hole('M2 5h4l2-3h7l2 3h4v16H2zM6 12.5a5.5 5.5 0 1 0 11 0 5.5 5.5 0 1 0-11 0M3.5 7v2h3V7z')+c(11.5,12.5,2.2)+p('M21 7l1 1v14H3v-1h18z'),
  p('M2 6h5l2-3h6l2 3h5v4H2zM2 12h4v9H2zM18 12h4v9h-4zM8 20h8v1H8z')+hole('M7 14a5 5 0 1 0 10 0 5 5 0 1 0-10 0M10 14a2 2 0 1 1 4 0 2 2 0 1 1-4 0'),
  imprint(p('M3 6.6l4.5-.5L9 3.7h6l1.6 2.4 4.4.5c1.6 3.9 1.9 11.7-.9 13.5-2.9 1.7-13.5 1.9-16.2-.5C1.2 17.1 1.8 10.1 3 6.6'),ink('M16.3 12.9c0 5.8-8.6 5.8-8.6 0s8.6-5.8 8.6 0M18.3 8.7h.2')),
  ink('M3 6.4l4.5-.3L9 3.4l6.2.1 1.3 2.6 4.4.1-.2 14.1-17.4.3L3 8.4M16.1 13c.3-5.6-8.4-5.5-8.3.1.1 5.1 8.2 5.7 8.3-.1M18.2 8.6h.3'));

a('search',
  ink('M16.8 10.1c0 9-13.4 9-13.4 0s13.4-9 13.4 0M16.3 16.3l4.3 4.3',2.3),
  hole('M1 10a9 9 0 1 0 18 0 9 9 0 1 0-18 0M4.5 10a5.5 5.5 0 1 1 11 0 5.5 5.5 0 1 1-11 0')+p('M16 15l7 6-3 3-6-7z'),
  p('M9 2C4 2 1 5 1 10c0 4 3 8 8 8v-3c-6-1-6-9 0-10zM11 2v3c6 1 6 9 0 10v3c5 0 8-4 8-8 0-5-3-8-8-8M17 16l6 5-2 2-6-5z'),
  imprint(p('M3.6 4.4c5-5.1 15.1-1 13.6 6.3-1.3 7.5-10.6 9.4-14.1 2.9-1.6-3-1.4-6.8.5-9.2'),ink('M15.1 15.3l6 6M5.8 6.7q-1.7 2.1-.8 4.5',1.5)),
  ink('M17.3 9.9c.4 9.8-14.6 10.1-14.2.1C3.4.8 17 .9 17.3 9.9M15 15.2l6.4 6.2M16.9 17.6l3.5 3.5'));

a('arrow-right',
  ink('M4 12h15.5M13.5 5.8l5.8 6.2-5.8 6.2',2.6),
  p('M2 10h11V4l9 8-9 8v-6H2zM22 12l1 1-9 9v-2z'),
  p('M2 10h9v4H2zM13 3l9 9-9 9V3z'),
  imprint(p('M2.2 12c0-7.7 18.4-9.4 19.3-1.5.9 7.6-18.8 11.2-19.3 1.5'),ink('M5 12h13M12.7 6.9L18 12l-5.3 5.1',1.5)),
  ink('M3 12.3q8.3-.5 17.5-.2M14.1 5.3l6.4 6.8-6.7 6.5'));

a('check',
  ink('M4.3 12.4l5.1 5.4L19.7 6.2',2.8),
  p('M2 12l4-3 4 5L19 3l4 3-13 16z'),
  p('M2 12l3-3 6 7-3 3zM10 14L19 3l4 3-12 14-2-2z'),
  imprint(p('M4.8 4.1C11-1.2 23 4.7 20.7 13.9c-2.3 8.4-14 11.2-17.8 3.4C1.2 13.8 1.4 7.1 4.8 4.1'),ink('M6.4 11.8l3.4 3.8 7.7-8.2',1.7)),
  ink('M3.4 12l5.8 6.3Q14.7 12.4 20 5.8M9.4 17.9l9.3-10.2',1.45));

export const coreStudioIconNames = Object.freeze(Object.keys(drawings));
export const studioIcons: Readonly<Record<string, Readonly<Masters>>> = Object.freeze(Object.fromEntries(Object.entries({...drawings,...industryStudioIcons}).map(([name, masters]) => [name, Object.freeze(masters)])));
export const studioIconNames = Object.freeze(Object.keys(studioIcons));
