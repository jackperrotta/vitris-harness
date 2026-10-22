/** Original Vitris industry revisions, v4. No new symbols or families. */
import { p, c, r, hole, ring, line } from './drawing.ts';
import type { IconDefinition } from './catalog.ts';
type Masters = Pick<IconDefinition,'outline'|'solid'|'duotone'>;
const entries: Record<string, Masters> = {};
function a(name: string, outline: string, solid: string, body: string, detail: string) { entries[name] = {outline,solid,duotone:{secondary:body,primary:detail}}; }
const frame = (x:number,y:number,w:number,h:number,t=2) => hole(`M${x} ${y}h${w}v${h}h-${w}zM${x+t} ${y+t}v${h-2*t}h${w-2*t}v-${h-2*t}z`);

a('ev-charger',
  r(3,3,11,18,1.5)+r(5.5,5.5,6,4)+p('M8 12l-2 4h3l-1 3 4-5H9M14 8h3l3 4v6c0 4-4 4-4 0v-3M18 9l2-2'),
  hole('M2.5 2.5h12v19h-12zM5 5v5h7V5zM8 12l-3 5h3l-1 3 5-6H9l1-2z')+line('M15 8h2l3 4v6c0 4-4 4-4 0v-3M18 9l2-2'),
  r(2.5,2.5,12,19,1.5),
  r(5,5,7,5)+p('M8 12l-3 5h3l-1 3 5-6H9l1-2z')+line('M15 8h2l3 4v6c0 4-4 4-4 0v-3M18 9l2-2'));
a('multimeter',
  r(5,3,14,18,2)+r(7.5,6,9,4)+c(12,15.5,3)+p('M12 15.5l1.5-1M8 3V1M16 3V1'),
  hole('M4.5 2.5h15v19h-15zM7 5.5v5h10v-5zM8.5 15.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0')+line('M12 15.5l1.5-1M8 2V1M16 2V1'),
  r(4.5,2.5,15,19,2),r(7,5.5,10,5)+ring(12,15.5,3.5,2)+line('M12 15.5l1.5-1M8 2V1M16 2V1'));
a('toilet',
  r(14,3,6,9,1)+p('M3 13h17c0 4-3 5-5 6v3H7v-4c-3-1-4-3-4-5M16 6h1M3 13v-2h9v2'),
  r(13.5,2.5,7,9,1)+p('M2.5 13h18c-.5 4-3.5 5.5-5.5 6.5V22H6.5v-4c-3-1-4-3-4-5z'),
  r(13.5,2.5,7,9,1),p('M2.5 13h18c-.5 4-3.5 5.5-5.5 6.5V22H6.5v-4c-3-1-4-3-4-5z')+line('M16 6h1'));
a('ductwork',
  p('M4 3h6v7h11v7H4zM4 7h6M7 10v7M16 10v7M21 8v11'),
  hole('M3 2h8v7h11v9H3zM4 6v2h6V6zM6 10v7h2v-7zM15 10v7h2v-7z')+r(21,7,2,13),
  p('M3 2h8v7h11v9H3z'),line('M4 7h6M7 10v7M16 10v7M22 8v11'));
a('air-filter',
  r(4,3,16,18)+p('M7 6l2.5 12L12 6l2.5 12L17 6'),
  frame(3.5,2.5,17,19)+line('M7 6l2.5 12L12 6l2.5 12L17 6'),
  r(3.5,2.5,17,19),line('M7 6l2.5 12L12 6l2.5 12L17 6'));
a('roof-tiles',
  p('M2 16L12 3l10 13v5H2zM5 12h14M8 8h8M2 16h20M12 3v18M7 16v5M17 16v5'),
  hole('M1.5 16L12 2l10.5 14v6h-21zM11 5L9 8h2zM13 5v3h2zM8 10l-2 3h5v-3zM13 10v3h5l-2-3zM5 15l-2 2h8v-2zM13 15v2h8l-2-2zM3 19v2h3v-2zM8 19v2h3v-2zM13 19v2h3v-2zM18 19v2h3v-2z'),
  p('M1.5 16L12 2l10.5 14v6h-21z'),line('M5 12h14M8 8h8M2 17h20M12 4v17M7 18v3M17 18v3'));
a('chimney',
  p('M2 21l8-8 11 8M12 14V5h7v13M10 5h11M12 9h7M15 2V1M19 2V1'),
  p('M1 22l9-10 13 10z')+hole('M11 4h9v14l-9-5zM12 8v2h7V8z')+r(9,3,13,2)+line('M15 1v1M19 1v1'),
  p('M1 22l9-10 13 10zM11 4h9v14l-9-5z'),r(9,3,13,2)+line('M12 9h7M15 1v1M19 1v1'));
a('road-roller',
  p('M4 16V5h8v13M6 5V2h5M4 11h8M12 13h6l3 5M17 18h5v4h-5')+c(6,19,3),
  hole('M3 4h10v14H3zM5 6v5h6V6z')+ring(6,19,3.5,1.5)+r(16,17,7,5,1)+line('M14 13h4l3 4M6 3V1h6'),
  r(3,4,10,14),ring(6,19,3.5,1.5)+r(16,17,7,5,1)+line('M5 6h6v5H5zM14 13h4l3 4M6 3V1h6'));
a('broom',
  p('M17 2l-6 10M7 10l7 4-2 8-11-6zM6 14l-2 3M9 16l-2 3M12 17l-2 4'),
  hole('M7 9l8 5-2 9L0 16zM5 14l-3 3 2 1 3-3zM9 16l-3 3 2 1 3-3zM12 17l-2 4 2 1 2-4z')+line('M17 2l-5 8'),
  p('M7 9l8 5-2 9L0 16z'),line('M17 2l-5 8M6 14l-2 3M9 16l-2 3M12 17l-2 4'));
a('spray-bottle',
  p('M7 3h12v4h-7v5l5 4v6H5v-6l4-4V7H7zM15 7v4M5 17h12'),
  hole('M6 2h14v6h-7v3.5l5 4V23H4v-7.5l4-4V8H6zM6 17v4h10v-4z'),
  p('M8 7h5v4.5l5 4V23H4v-7.5l4-4z'),p('M6 2h14v6H6z')+line('M16 8v3M5 17h12'));
a('vacuum',
  r(3,13,10,8,2)+p('M6 13v-3h4v3M13 16h2V8c0-6 5-6 5-2v10M18 21h5l-3-5-2 5')+c(5.5,21,1)+c(11,21,1),
  r(2.5,12.5,11,9,2)+line('M6 12V9h4v3M14 16h1V8c0-6 5-6 5-2v10')+p('M18 17h3l2 5h-7z')+c(5.5,21,1.5)+c(11,21,1.5),
  r(2.5,12.5,11,9,2),line('M6 12V9h4v3M14 16h1V8c0-6 5-6 5-2v10')+p('M18 17h3l2 5h-7z')+c(5.5,21,1.5)+c(11,21,1.5));
a('pressure-washer',
  r(3,8,9,12,2)+p('M5 8V3h5v5M12 15h3V7c0-3 3-3 4-1l3 2M18 5l3-2M20 11l2 1M18 14l2 2')+c(5,21,1.5)+c(10,21,1.5),
  r(2.5,7.5,10,13,2)+line('M5 7V2h5v5M13 15h2V7c0-3 3-3 4-1l3 2M18 5l3-2M20 11l2 1M18 14l2 2')+c(5,21,1.7)+c(10,21,1.7),
  r(2.5,7.5,10,13,2),line('M5 7V2h5v5M13 15h2V7c0-3 3-3 4-1l3 2M18 5l3-2M20 11l2 1M18 14l2 2')+c(5,21,1.7)+c(10,21,1.7));
a('hedge-trimmer',
  r(2,10,8,8,1)+p('M4 10V6h5v4M10 13h12M13 13v-3M16 13v3M19 13v-3M22 13v3M5 18v4'),
  r(1.5,9.5,9,9,1.5)+line('M4 9V5h5v4M11 13h11M13 13v-3M16 13v3M19 13v-3M22 13v3M5 19v3'),
  r(1.5,9.5,9,9,1.5),line('M4 9V5h5v4M11 13h11M13 13v-3M16 13v3M19 13v-3M22 13v3M5 19v3'));
a('watering-can',
  r(5,10,11,11,1)+p('M8 10V6h5v4M5 12c-6-2-6 8 0 6M16 15l4-7 2 1-4 10h-2M20 6l3 2'),
  r(4.5,9.5,12,12,1.5)+p('M16 14l4-7 3 2-5 11h-2z')+line('M8 9V5h5v4M4 12c-5-2-5 8 0 6M20 5l3 2'),
  r(4.5,9.5,12,12,1.5),p('M16 14l4-7 3 2-5 11h-2z')+line('M8 9V5h5v4M4 12c-5-2-5 8 0 6M20 5l3 2'));
a('tree-stump',
  p('M6 7c0-4 12-4 12 0s-12 4-12 0M6 7v9l-3 5h18l-3-5V7M9 12v6M15 12v6'),
  hole('M5 7c0-5 14-5 14 0v9l4 6H1l4-6zM8 7c0 2 8 2 8 0s-8-2-8 0M8 12v7h2v-7zM14 12v7h2v-7z'),
  p('M5 7c0-5 14-5 14 0v9l4 6H1l4-6z'),line('M6 7c0 3 12 3 12 0M9 12v6M15 12v6'));

// Property, professional services and care. Counters are drawn into the filled
// masters rather than painting a second filled shape over an existing body.
a('house-key',
  p('M2 10l7-7 7 7M4 9v12h7V11H8v10')+c(17,13,3)+p('M17 16v6h4M17 19h3'),
  p('M1 10l8-8 8 8-1.5 1.5L9 5l-6.5 6.5zM3 11h3v11H3zM6 19h5v3H6z')+ring(17,13,4,2)+p('M16 17h2v2h3v2h-3v2h-2z'),
  p('M1 10l8-8 8 8-1.5 1.5L9 5l-6.5 6.5zM3 11h3v11H3zM6 19h5v3H6z'),ring(17,13,4,2)+p('M16 17h2v2h3v2h-3v2h-2z'));
a('location-house',
  p('M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM7 10l5-4 5 4M9 9v5h6V9'),
  hole('M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 1 1 18 0zM6 10l6-5 6 5-1.5 1.5L12 8l-4.5 3.5zM8 11v4h8v-4z'),
  p('M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 1 1 18 0z'),p('M6 10l6-5 6 5-1.5 1.5L12 8l-4.5 3.5zM8 11v4h8v-4z'));
a('legal-contract',
  p('M12 3H3v18h10M6 7h5M6 11h4M13 19l-1-3L20 5l3 2-8 11zM18 8l3 2'),
  hole('M2 2h11v3H5v15h6v2H2zM6 7h5v2H6zM6 11h4v2H6z')+p('M11 16L20 4l4 3-9 12-4 2z')+line('M18 8l3 2'),
  p('M2 2h11v3H5v15h6v2H2z'),r(6,7,5,2)+r(6,11,4,2)+p('M11 16L20 4l4 3-9 12-4 2z')+line('M18 8l3 2'));
a('syringe',
  p('M6 4l14 14M4 6L8 2M5 9l4-4 11 11-4 4zM8 12l3-3M11 15l3-3M18 18l4 4'),
  hole('M4 9l5-5 12 12-5 5zM8 11l2 2 3-3-2-2zM12 15l2 2 3-3-2-2z')+line('M6 4l-2-2M4 6L8 2M19 19l3 3'),
  p('M4 9l5-5 12 12-5 5z'),line('M6 4l-2-2M4 6L8 2M8 12l3-3M12 16l3-3M19 19l3 3'));
a('maternity',
  c(11,4,2.5)+p('M8 8c-3 4-2 8-1 10l-1 4M13 8c0 2 5 3 5 7 0 3-4 4-6 3v4M9 10l-1 4 6 2M8 18h4'),
  c(11,4,2.8)+p('M8 8h5c0 2 6 3 6 7 0 3-3 5-6 4v4h-3v-5H8l-1 5H4l2-6C4 13 5 10 8 8z')+line('M9 11l-1 3 6 2'),
  p('M8 8h5c0 2 6 3 6 7 0 3-3 5-6 4v4h-3v-5H8l-1 5H4l2-6C4 13 5 10 8 8z'),c(11,4,2.8)+line('M9 11l-1 3 6 2'));
a('dental-implant',
  p('M5 3c2-2 4 0 7 0s5-2 7 0c2 3-1 7-3 8H8C6 10 3 6 5 3M9 11v9l3 3 3-3v-9M9 14h6M9 18h6'),
  p('M4 3c2-3 5-1 8-1s6-2 8 1c2 3-1 7-4 9H8C5 10 2 6 4 3z')+hole('M8 13h8v7l-4 4-4-4zM9 15v2h6v-2zM10 19v1h4v-1z'),
  p('M4 3c2-3 5-1 8-1s6-2 8 1c2 3-1 7-4 9H8C5 10 2 6 4 3z'),p('M8 13h8v7l-4 4-4-4z')+line('M9 16h6M10 20h4'));
a('brain',
  p('M12 5C10 0 4 2 4 6c-4 1-3 7-1 8-2 4 3 7 6 6 1 3 3 1 3-1V5zM12 5c2-5 8-3 8 1 4 1 3 7 1 8 2 4-3 7-6 6-1 3-3 1-3-1M5 7c3-1 4 1 3 3M3 14c3-2 5 0 4 2M19 7c-3-1-4 1-3 3M21 14c-3-2-5 0-4 2'),
  p('M11 4C9-1 3 1 3 6c-4 1-3 7-1 8-2 5 3 8 6 7 2 3 3 1 3-1zM13 4c2-5 8-3 8 2 4 1 3 7 1 8 2 5-3 8-6 7-2 3-3 1-3-1z')+line('M5 7c3-1 4 1 3 3M3 14c3-2 5 0 4 2M19 7c-3-1-4 1-3 3M21 14c-3-2-5 0-4 2'),
  p('M11 4C9-1 3 1 3 6c-4 1-3 7-1 8-2 5 3 8 6 7 2 3 3 1 3-1zM13 4c2-5 8-3 8 2 4 1 3 7 1 8 2 5-3 8-6 7-2 3-3 1-3-1z'),line('M5 7c3-1 4 1 3 3M3 14c3-2 5 0 4 2M19 7c-3-1-4 1-3 3M21 14c-3-2-5 0-4 2'));
a('bone-joint',
  p('M7 2v4c0 2-3 2-3 5 0 2 3 3 5 1 2 2 5 1 5-1 0-3-3-3-3-5V2M13 22v-4c0-2-3-2-3-4 0-2 3-3 5-1 2-2 5-1 5 1 0 2-3 2-3 4v4'),
  p('M6 1h6v5c0 2 3 2 3 5 0 3-4 4-6 2-2 2-6 1-6-2 0-3 3-3 3-5zM12 23h6v-5c0-2 3-2 3-4 0-3-4-4-6-2-2-2-6-1-6 2 0 2 3 2 3 4z'),
  p('M6 1h6v5c0 2 3 2 3 5 0 3-4 4-6 2-2 2-6 1-6-2 0-3 3-3 3-5z'),p('M12 23h6v-5c0-2 3-2 3-4 0-3-4-4-6-2-2-2-6-1-6 2 0 2 3 2 3 4z'));
a('nurse',
  p('M7 7L5 3h14l-2 4zM12 3v3M10.5 4.5h3M7 8v3a5 5 0 0 0 10 0V8M3 22v-2c0-6 18-6 18 0v2zM9 16l3 4 3-4'),
  hole('M4 2h16l-2 5H6zM11.4 2.7v1h-1v1.2h1v1h1.2v-1h1V3.7h-1v-1z')+p('M6 9h12v2a6 6 0 0 1-12 0zM2 23v-3c0-6 20-6 20 0v3z'),
  p('M6 9h12v2a6 6 0 0 1-12 0zM2 23v-3c0-6 20-6 20 0v3z'),hole('M4 2h16l-2 5H6zM11.4 2.7v1h-1v1.2h1v1h1.2v-1h1V3.7h-1v-1z'));
a('hands-care',
  p('M12 10L7 6c-3-3 1-6 5-2 4-4 8-1 5 2zM2 11v6l7 5h6l7-5v-6c-2-1-3 0-3 2v3l-5 2M2 11c2-1 3 0 3 2v3l5 2M5 15l5-1 2 2 2-2 5 1'),
  p('M12 11L6 6C3 2 8-1 12 3c4-4 9-1 6 3zM1 10h3l2 5 4-1 2 2 2-2 4 1 2-5h3v8l-8 5H9l-8-5z'),
  p('M1 10h3l2 5 4-1 2 2 2-2 4 1 2-5h3v8l-8 5H9l-8-5z'),p('M12 11L6 6C3 2 8-1 12 3c4-4 9-1 6 3z'));
a('meal-care',
  c(12,13,7)+p('M12 15l-3-3c-2-2 1-4 3-2 2-2 5 0 3 2zM2 2v6M5 2v6M2 6h3M3.5 8v14M21 22V2c-3 0-3 7 0 7'),
  ring(12,13,7,5.5)+p('M12 16l-4-4c-2-3 1-5 4-3 3-2 6 0 4 3z')+line('M1 2v5h4V2M3 2v20M22 22V2c-4 0-4 7 0 7'),
  c(12,13,7),p('M12 16l-4-4c-2-3 1-5 4-3 3-2 6 0 4 3z')+line('M1 2v5h4V2M3 2v20M22 22V2c-4 0-4 7 0 7'));

// Personal services, food and pets: silhouettes and intentional part separation.
a('hair-clipper',
  p('M5 6h14l-2 15H7zM5 6V3h14v3M8 3V1M12 3V1M16 3V1M6 10h12M10 14h4'),
  hole('M4 5h16l-2 17H6zM6 9v2h12V9zM9 14v2h6v-2z')+line('M6 3h12M8 3V1M12 3V1M16 3V1'),
  p('M4 5h16l-2 17H6z'),r(6,9,12,2)+r(9,14,6,2)+line('M6 3h12M8 3V1M12 3V1M16 3V1'));
a('hair-color',
  p('M3 9h8v13H3zM5 9V6h4v3M6 6V2h2M16 11h5v11h-5zM16 11l1-8h4v8M17 6h4'),
  r(2,9,10,14,1)+r(4,5,6,3)+line('M7 5V1h2')+hole('M15 2h7v21h-7zM17 8v2h3V8zM17 12v9h3v-9z'),
  r(2,9,10,14,1)+r(15,11,7,12),r(4,5,6,3)+line('M7 5V1h2')+p('M15 10l1-8h6v8z'));
a('repair-tools',
  p('M4 3l3 3-2 2-3-3c-2 5 2 8 5 6l11 11 4-4L11 7c2-4-2-7-7-4zM18 2l4 4-7 7M10 16l-6 6-2-2 6-6'),
  p('M4 2l4 4-2 2-4-4c-2 5 2 10 6 8l10 11 5-5L12 8C14 3 9 0 4 2zM18 1l5 5-7 7-5-5zM7 14l4 4-6 6-5-5z'),
  p('M18 1l5 5-7 7-5-5zM7 14l4 4-6 6-5-5z'),p('M4 2l4 4-2 2-4-4c-2 5 2 10 6 8l10 11 5-5L12 8C14 3 9 0 4 2z'));
a('bread',
  p('M5 11C0 10 2 3 7 3h10c5 0 7 7 2 8v10H5zM8 7l2 3M14 7l2 3'),
  hole('M4 12C-2 10 1 2 7 2h10c6 0 9 8 3 10v10H4zM7 6l3 5 2-1-3-5zM13 6l3 5 2-1-3-5z'),
  p('M4 12C-2 10 1 2 7 2h10c6 0 9 8 3 10v10H4z'),line('M8 6l3 4M14 6l3 4'));
a('croissant',
  p('M3 20C0 15 2 10 6 8c0-3 3-5 6-4 3-1 6 1 6 4 4 2 6 7 3 12l-4-4c-3-2-7-2-10 0zM6 8l2 7M18 8l-2 7M9 5l1 9M15 5l-1 9'),
  hole('M2 21C-1 15 1 9 5 7c1-4 4-5 7-4 3-1 6 0 7 4 4 2 6 8 3 14l-5-4c-3-2-7-2-10 0zM5 9l2 7 2-1-2-7zM17 8l-2 7 2 1 2-7zM9 4l1 10h2L11 4zM13 4l-1 10h2l1-10z'),
  p('M2 21C-1 15 1 9 5 7c1-4 4-5 7-4 3-1 6 0 7 4 4 2 6 8 3 14l-5-4c-3-2-7-2-10 0z'),line('M6 8l2 7M18 8l-2 7M9 5l1 9M15 5l-1 9'));
a('takeaway',
  p('M5 7h14l4 7-5 8H6l-5-8zM8 7V3h8v4M1 14h22M8 14l4 4 4-4'),
  hole('M5 6h14l5 8-6 9H6l-6-9zM2 13v2h6l4 5 4-5h6v-2h-7l-3 4-3-4z')+line('M8 5V2h8v3'),
  p('M5 6h14l5 8-6 9H6l-6-9z'),line('M8 5V2h8v3M2 14h6l4 4 4-4h6'));
a('piggy-bank',
  p('M5 7c-4 1-4 10 1 12v3h3v-2h7v2h3v-5l3-1v-5h-3l-1-5-4 2M7 5h7M3 9C0 6 0 11 2 11')+c(16.5,11,0.7)+p('M8 8h5'),
  hole('M5 6c-5 2-5 11 0 14v3h5v-2h5v2h5v-5l3-1v-7h-3l-1-6-5 3C11 4 8 5 5 6zM7 8v2h6V8zM15.5 11a1 1 0 1 0 2 0 1 1 0 1 0-2 0')+line('M7 3h7M2 10C-1 6 0 12 2 12'),
  p('M5 6c-5 2-5 11 0 14v3h5v-2h5v2h5v-5l3-1v-7h-3l-1-6-5 3C11 4 8 5 5 6z'),r(7,8,6,2)+c(16.5,11,1)+line('M7 3h7M2 10C-1 6 0 12 2 12'));
a('dog',
  p('M7 5L3 3 1 11l4 3M17 5l4-2 2 8-4 3M6 5h12v10c0 8-12 8-12 0zM9 11h.5M14.5 11h.5M10 16h4M12 16v3'),
  hole('M6 4h12v11c0 10-12 10-12 0zM8 10v2h2v-2zM14 10v2h2v-2zM10 15l2 3 2-3z')+p('M4 2l-4 9 4 4 1-10zM20 2l4 9-4 4-1-10z'),
  p('M6 4h12v11c0 10-12 10-12 0z'),p('M4 2l-4 9 4 4 1-10zM20 2l4 9-4 4-1-10z')+c(9,11,1)+c(15,11,1)+p('M10 15l2 3 2-3z'));

// Transport and sport retain the same semantic names and 24-unit grid.
a('piston',
  r(5,2,14,8)+p('M5 5h14M5 8h14M10 10v6M14 10v6')+c(12,19,3),
  hole('M4 1h16v10h-5v5a4 4 0 1 1-6 0v-5H4zM6 4v2h12V4zM6 8v1h12V8zM10 19a2 2 0 1 0 4 0 2 2 0 1 0-4 0'),
  r(4,1,16,10),p('M9 11h6v5a4 4 0 1 1-6 0z')+line('M6 5h12M6 8h12'));
a('engine',
  p('M3 9h4V6h8l3 4h3v10H5l-3-4H1v-5h2zM8 2h7M12 2v4M8 12l3 4 3-5 3 4'),
  hole('M2 8h4V5h10l3 4h3v12H4l-3-4H0v-7h2zM7 12l4 6 3-5 2 4 2-1-4-7-3 5-2-3z')+line('M8 2h7M12 2v2'),
  p('M2 8h4V5h10l3 4h3v12H4l-3-4H0v-7h2z'),line('M8 2h7M12 2v2M8 12l3 4 3-5 3 4'));
a('car-lift',
  p('M2 2v21M22 2v21M5 19h14V9l-3-5H8L5 9zM5 10h14M8 14h1M15 14h1M3 19h18M7 20v2M17 20v2'),
  hole('M4 9l3-6h10l3 6v11H4zM8 5l-2 4h12l-2-4zM7 13v2h3v-2zM14 13v2h3v-2z')+r(1,1,2,22)+r(21,1,2,22)+line('M3 20h18'),
  p('M4 9l3-6h10l3 6v11H4z'),r(1,1,2,22)+r(21,1,2,22)+line('M7 10h10M7 14h2M15 14h2M3 20h18'));
a('tractor',
  p('M4 14V4h10v11M3 2h12M14 9h6v9M18 9V5h3M7 5v6h6')+c(7,18,4)+c(19,20,2),
  hole('M3 3h12v5h6v11H3zM5 5v6h7V5z')+r(2,1,14,2)+ring(7,18,5,2.5)+ring(19,20,3,1)+line('M18 7V4h3'),
  p('M3 3h12v5h6v11H3z')+r(2,1,14,2),ring(7,18,5,2.5)+ring(19,20,3,1)+line('M6 5h6v6H6zM18 7V4h3'));
a('basketball',
  c(12,12,10)+p('M2 12h20M12 2v20M5 5c8 2 12 6 14 14M19 5C11 7 7 11 5 19'),
  ring(12,12,10,8.2)+line('M3 12h18M12 3v18M5 5c8 2 12 6 14 14M19 5C11 7 7 11 5 19'),
  c(12,12,10),line('M3 12h18M12 3v18M5 5c8 2 12 6 14 14M19 5C11 7 7 11 5 19'));
a('delivery-van',
  p('M2 5h13v15H2zM15 8h3l4 6v6h-7M16 10v4h6M5 9h7M5 13h5')+c(6,20,2)+c(18,20,2),
  hole('M1 4h14v3h4l4 7v7H1zM16 9v4h4l-3-4zM4 8v2h8V8zM4 12v2h6v-2z')+ring(6,20,3,1.2)+ring(18,20,3,1.2),
  r(1,4,14,17)+p('M15 7h4l4 7v7h-8z'),line('M16 10v4h4M4 9h8M4 13h6')+ring(6,20,3,1.2)+ring(18,20,3,1.2));
a('courier',
  p('M3 9l7-4 7 4v13H3zM3 9l7 4 7-4M10 13v9M2 2h13M19 7h4M20 12h3M20 17h3'),
  hole('M2 9l8-5 8 5v14H2zM4 10l5 3v8h2v-8l5-3-1-1-5 3-5-3z')+line('M2 2h13M20 7h3M20 12h3M20 17h3'),
  p('M2 9l8-5 8 5v14H2z'),line('M4 10l6 3 6-3M10 13v8M2 2h13M20 7h3M20 12h3M20 17h3'));

export const industryRefinementsV4: Readonly<Record<string, Masters>> = Object.freeze(entries);
