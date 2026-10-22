/** Industry geometry revised in v3 for silhouette, spacing and small-size clarity. */
import { p, c, r, hole, ring, line } from './drawing.ts';
import type { IconDefinition } from './catalog.ts';
type Masters = Pick<IconDefinition, 'outline' | 'solid' | 'duotone'>;
const masters: Record<string, Masters> = {};
function a(name: string, outline: string, solid: string, body: string, detail: string) { masters[name] = { outline, solid, duotone: { secondary: body, primary: detail } }; }
const frame = (x: number, y: number, w: number, h: number) => hole(`M${x} ${y}h${w}v${h}h-${w}zM${x+2} ${y+2}v${h-4}h${w-4}v-${h-4}z`);

a('excavator',
  r(2.5,18,12.5,4,2)+p('M5 16V8h6v8H5zM5 12h6M11 12l4-8 3.5 1.5L21 12l-1 3h-3M15 4v7M7 16h6v2'),
  r(2,18,13,4.5,2.2)+hole('M4 7h8v10H4zM6 9v4h4V9z')+p('M12 11l2.5-8L19 5l3 7-1.5 4H17v-2h2l1-2-2.5-5-1.5-.7-2.5 6z'),
  r(2,18,13,4.5,2.2)+r(4,7,8,10,1),
  line('M6 9h4v4H6zM12 12l3-8 3.5 1.5L21 12l-1 3h-3'));
a('bulldozer',
  r(2,18,14,4,2)+p('M4 16V7h8v9H4zM6 7V4h5M4 12h8M12 14h4l2 4M19 11v10h3M7 16v2'),
  r(1.5,18,15,4.5,2.2)+hole('M3 6h10v11H3zM5 8v5h6V8z')+p('M18 11h2v9h2v2h-5z')+line('M14 14h2l2 4M6 5V3h6'),
  r(1.5,18,15,4.5,2.2)+r(3,6,10,11,1),
  p('M18 11h2v9h2v2h-5z')+line('M5 8h6v5H5zM14 14h2l2 4M6 5V3h6'));
a('dump-truck',
  p('M2 5h12l-2 10H4zM14 10h4l4 5v4h-8M16 11v4h6M5 19h10')+c(6,19,2.5)+c(18,19,2.5),
  p('M1.5 4.5h13l-2 11H4z')+hole('M15 9h3.5l4 5.5V19H15zM17 11v3h3.5l-2-3z')+c(6,19.5,3)+c(18,19.5,3),
  p('M1.5 4.5h13l-2 11H4zM15 9h3.5l4 5.5V19H15z'),
  c(6,19.5,3)+c(18,19.5,3)+line('M17 11v3h3.5M4 17h11'));
a('cement-mixer',
  p('M5 6l6-3 7 5-4 6-7-1zM7 5l7 8M8 14l-3 7M14 14l4 5M3 22h17M17 9l4-2v4l-4 1')+c(17,20,2),
  p('M4 6l7-4 8 6-5 7-8-1zM19 8l3-2v6l-4 1z')+line('M8 16l-3 6M14 16l2 3M3 22h17')+ring(17,20,2.5,1),
  p('M4 6l7-4 8 6-5 7-8-1zM19 8l3-2v6l-4 1z'),
  line('M7 5l7 8M8 16l-3 6M14 16l2 3M3 22h17')+ring(17,20,2.5,1));
a('lawnmower',
  p('M4 15h14l2 4H2zM7 15v-4h6v4M17 15l3-12h2')+c(5,20,2)+c(17,20,2),
  p('M4 14h14l3 6H1zM6 10h8v4H6z')+c(5,20,2.5)+c(17,20,2.5)+line('M18 13l2-11h2'),
  p('M4 14h14l3 6H1zM6 10h8v4H6z'),
  c(5,20,2.5)+c(17,20,2.5)+line('M18 13l2-11h2'));
a('chainsaw',
  r(2,11,9,9,1.5)+p('M4 11V7h5v4M11 12h9a3 3 0 0 0 0-6H9v5M14 8v2M17 8v2M20 8v2M5 15h3'),
  r(1.5,11,10,10,2)+hole('M10 5h10a4 4 0 0 1 0 8h-8v-2h8a2 2 0 0 0 0-4H10z')+line('M4 10V6h5M5 16h3'),
  r(1.5,11,10,10,2)+p('M10 5h10a4 4 0 0 1 0 8H10z'),
  line('M4 10V6h5M13 9h8M5 16h3'));
a('heat-pump',
  r(2,4,20,15,1.5)+c(10,11.5,5)+p('M10 8v7M6.5 11.5h7M18 8h1M18 12h1M18 16h1M5 19v3M19 19v3'),
  hole('M1.5 3.5h21v16h-21zM4 11.5a6 6 0 1 0 12 0 6 6 0 1 0-12 0M18 7v2h2V7zM18 11v2h2v-2zM18 15v2h2v-2z')+c(10,11.5,1.6)+line('M10 8v7M6.5 11.5h7M5 20v2M19 20v2'),
  r(1.5,3.5,21,16,1.5),
  ring(10,11.5,5,3.6)+c(10,11.5,1.5)+line('M10 8v7M6.5 11.5h7M18 8h1M18 12h1M18 16h1M5 20v2M19 20v2'));
a('air-conditioner',
  r(2.5,4,19,11,2)+p('M5.5 11h13M6.5 18v3M12 18v2M17.5 18v3M17 7h1'),
  hole('M2 3.5h20v12H2zM5 10v3h14v-3zM16 6v2h3V6z')+line('M6.5 18v3M12 18v2M17.5 18v3'),
  r(2,3.5,20,12,2),
  line('M5 11.5h14M16.5 7h2M6.5 18v3M12 18v2M17.5 18v3'));
a('faucet',
  p('M4 21V9h12l4 4v4h-4v-3H9v7M10 9V4M6 4h8M3 21h7M18 20v2'),
  p('M3 8h13.5l4.5 4.5V18h-6v-3H10v7H3z')+line('M10 7V3M6 3h8M18 20v2'),
  p('M3 8h13.5l4.5 4.5V18h-6v-3H10v7H3z'),
  line('M10 7V3M6 3h8M18 20v2'));
a('shower',
  p('M5 22V7c0-6 9-6 9 0M10 7h8l3 4H7zM10 15v2M15 15v2M20 15v2M10 20v1M15 20v1M20 20v1'),
  p('M9.5 6.5h9L22 12H6z')+line('M4 22V7c0-7 10-7 10-1M10 15v2M15 15v2M20 15v2M10 20v1M15 20v1M20 20v1'),
  p('M9.5 6.5h9L22 12H6z'),
  line('M4 22V7c0-7 10-7 10-1M10 15v2M15 15v2M20 15v2M10 20v1M15 20v1M20 20v1'));
a('solar-panel',
  p('M5 9h14l3 11H2zM9.5 9L8 20M14.5 9L16 20M3.5 14.5h17M12 20v3M8 23h8')+c(12,3.5,1.5),
  hole('M4.5 8.5h15L23 21H1zM6 11l-2 7.5h4L9 11zM11 11l-1 7.5h4L13 11zM15 11l1 7.5h4L18 11z')+c(12,3.5,2)+line('M12 21v2M8 23h8'),
  p('M4.5 8.5h15L23 21H1z'),
  line('M9.5 10L8 20M14.5 10L16 20M3.5 14.5h17M12 21v2M8 23h8')+c(12,3.5,2));
a('hair-dryer',
  p('M4 5h9l5 3v7l-5 3H4q-2 0-2-2V7q0-2 2-2M18 9h4v5h-4M8 18v4h4l1-4M6 8v7'),
  p('M4 4h9.5L19 7.5v8L13.5 19H4q-3 0-3-3V7q0-3 3-3M20 8h3v7h-3zM7 19h6l-1 4H7z'),
  p('M4 4h9.5L19 7.5v8L13.5 19H4q-3 0-3-3V7q0-3 3-3'),
  p('M20 8h3v7h-3zM7 19h6l-1 4H7z')+line('M6 8v7'));
a('hard-drive',
  r(4,2,16,20,1.5)+c(12,10.5,4.5)+c(12,10.5,1.3)+p('M7 17l6-7M7 19h1M16 19h1'),
  frame(3.5,1.5,17,21)+ring(12,10.5,5,3.1)+c(12,10.5,1.3)+line('M7 17l6-7')+c(7.5,19.5,1)+c(16.5,19.5,1),
  r(3.5,1.5,17,21,1.5),
  ring(12,10.5,4.5,3.2)+c(12,10.5,1.3)+line('M7 17l6-7')+c(7.5,19.5,1)+c(16.5,19.5,1));
a('ultrasound',
  r(3,3,18,14,1.5)+p('M12 17v5M8 22h8M7 12l5-6 5 6q-5 4-10 0M11 11h2M6 14h1'),
  frame(2.5,2.5,19,15)+p('M11 18h2v3h4v2H7v-2h4z')+line('M7 12l5-6 5 6q-5 4-10 0')+c(12,11,1),
  r(2.5,2.5,19,15,1.5),
  line('M7 12l5-6 5 6q-5 4-10 0M12 18v4M8 22h8')+c(12,11,1));
a('wheelbarrow',
  p('M5 7h15l-5 9H8L4 4H2M9 16l-2 6M14 16l3 3M4 22h6')+c(19,20,2.5),
  p('M5 6h17l-6 11H8z')+line('M6 6L4 3H2M9 18l-2 4M14 18l2 1M4 22h6')+ring(19,20,3,1.4),
  p('M5 6h17l-6 11H8z'),
  line('M6 6L4 3H2M9 18l-2 4M14 18l2 1M4 22h6')+ring(19,20,3,1.4));
a('gavel',
  p('M4 7l5-5 7 7-5 5zM6 5l7 7M13.5 12l7.5 8M3 22h11v-3H3z'),
  p('M3 7l6-6 8 8-6 6zM14 12l8 8-2 2-8-8z')+r(2.5,18.5,12,4),
  p('M3 7l6-6 8 8-6 6z'),
  p('M14 12l8 8-2 2-8-8z')+r(2.5,18.5,12,4));

export const refinedIndustryMasters: Readonly<Record<string, Masters>> = Object.freeze(masters);
export const refinedIndustryNames = Object.freeze(Object.keys(masters));
