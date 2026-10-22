/** Original industry masters drawn for Vitris, 2026-10-22. No imported paths. */
import { p, c, r, line, hole, ring } from './drawing.ts';
import type { IconDefinition } from './catalog.ts';

const entries: IconDefinition[] = [];
// Separate functional parts form the two tone layers. Solid reuses their union;
// an optional solid master preserves negative space where a union would hide it.
function a(category: string, name: string, keywords: string, outline: string, body: string, detail: string, solid?: string) {
  entries.push({ name, category, keywords: keywords.split(' '), outline, solid: solid ?? body + detail, duotone: { secondary: body, primary: detail } });
}

// Electrical, renewable energy and charging
a('Electrical','power-outlet','electrician socket electrical outlet',r(4,2,16,20,2)+p('M8 8v4M16 8v4M10 17h4'),r(3,1,18,22,2),r(7,7,2,6)+r(15,7,2,6)+r(10,17,4,2),hole('M3 1h18v22H3zM7 7v6h2V7zM15 7v6h2V7zM10 17v2h4v-2z'));
a('Electrical','power-plug','electrical connection cord electrician',p('M6 2v6M14 2v6M3 8h14v5a7 7 0 0 1-14 0zM10 20v3h10'),p('M2 8h16v5a8 8 0 0 1-16 0z'),r(5,1,2,7)+r(13,1,2,7)+line('M10 21v2h11'));
a('Electrical','circuit-breaker','fuse panel switchboard safety electrician',r(3,2,18,20)+p('M7 6h10v6H7zM9 15v4M15 15v4M10 7v4'),r(2,1,20,22),r(6,5,12,8)+r(8,16,2,4)+r(14,16,2,4),hole('M2 1h20v22H2zM6 5v8h12V5zM8 16v4h2v-4zM14 16v4h2v-4z')+r(9,6,3,5));
a('Electrical','battery-charge','power rechargeable energy battery',p('M2 6h18v12H2zM20 10h2v4M11 7l-4 6h5l-1 4 5-7h-5z'),r(1,5,20,14,1)+r(21,9,2,6),p('M12 6l-6 8h6l-1 4 7-9h-6z'),hole('M1 5h20v14H1zM3 7v10h16V7z')+r(21,9,2,6)+p('M12 6l-6 8h6l-1 4 7-9h-6z'));
a('Electrical','solar-panel','solar renewable photovoltaic energy',p('M4 9h16l3 11H1zM8 9L6 20M16 9l2 11M3 14h18M12 20v3M8 23h8')+c(12,3,2),p('M4 8h16l4 13H0z'),line('M8 9L6 20M16 9l2 11M3 14h18M12 21v2M8 23h8')+c(12,3,2),hole('M4 8h16l4 13H0zM8 9L5 20h2l3-11zM14 9l3 11h2L16 9zM2 14v2h20v-2z')+c(12,3,2)+line('M12 21v2M8 23h8'));
a('Electrical','pendant-light','lighting installation ceiling fixture',p('M12 1v7M7 8h10l5 11H2zM9 22h6M8 1h8'),p('M6 8h12l5 12H1z'),line('M12 1v6M8 1h8M9 23h6'));
a('Electrical','ev-charger','electric vehicle charging car energy',r(3,2,12,20,1)+p('M6 6h6v5H6zM15 7h3l3 4v7c0 4-4 4-4 0v-3M8 14l-2 3h4l-2 3'),r(2,1,14,22,1),r(6,5,6,6)+line('M17 6h2l3 5v7c0 5-5 5-5 0v-3')+p('M9 13l-4 5h4l-1 3 5-6H9z'));
a('Electrical','multimeter','electrician testing voltage inspection meter',r(4,3,16,19,2)+r(7,6,10,5)+c(12,16,3)+p('M8 3V1M16 3V1M12 16l2-1'),r(3,2,18,21,2),r(7,6,10,5)+ring(12,16,3.5,1.5)+line('M8 2V1M16 2V1'),hole('M3 2h18v21H3zM7 6v5h10V6zM9 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0')+line('M8 2V1M16 2V1'));

// Plumbing and drainage
a('Plumbing','faucet','tap plumber plumbing water sink',p('M3 13V8h13l5 5v4h-5v-4H8v8M10 8V3M6 3h8M3 21h8'),p('M2 7h15l5 5v6h-7v-4H9v8H2z'),line('M10 6V2M6 2h8M17 21v2M21 21v2'));
a('Plumbing','sink','basin wash plumbing bathroom',p('M2 12h20l-4 7H6zM12 12V5c0-4 5-4 5 0M6 22h12M12 19v3'),p('M1 11h22l-5 9H6z'),line('M12 10V5c0-4 5-4 5 0M12 20v3M7 23h10'));
a('Plumbing','toilet','bathroom sanitation plumber',p('M14 2h7v11h-7zM3 13h18c0 5-4 6-5 7v3H7v-4c-4-1-4-4-4-6zM17 6h1'),r(13,1,9,12,1),p('M2 14h20c0 5-5 6-5 7v2H6v-4c-4-1-4-3-4-5z'));
a('Plumbing','shower','bath bathroom plumbing water',p('M5 22V6c0-6 8-6 8 0M9 7h9l3 4H6zM10 15v2M15 15v2M20 15v2M10 20v2M15 20v2M20 20v2'),p('M9 6h9l5 6H5z'),line('M4 23V6c0-6 9-6 9-1M10 15v2M15 15v2M20 15v2M10 20v2M15 20v2M20 20v2'));
a('Plumbing','valve','shutoff stopcock plumbing water control',p('M1 14h22v6H1zM8 14V9h8v5M12 9V3M5 3h14'),p('M1 13h22v8H1zM7 9h10v4H7z'),line('M12 8V3M5 3h14')+c(12,3,2));
a('Plumbing','water-heater','boiler hotwater tank installation',r(5,4,14,17,4)+p('M8 4V1M16 4V1M8 21v2M16 21v2M12 9v6')+c(12,12,3),r(4,3,16,19,4),ring(12,12,3.5,1.5)+line('M8 2V1M16 2V1M8 22v1M16 22v1'));
a('Plumbing','drain','drainage blockage plumber grate',c(12,12,10)+p('M6 6l12 12M6 18L18 6M4 12h16M12 4v16'),ring(12,12,10,8),line('M6 6l12 12M6 18L18 6M4 12h16M12 4v16'));
a('Plumbing','sewer','wastewater pipe drainage septic',p('M3 2h6v8h12v6H3zM4 20c3-3 5 3 8 0s5 3 8 0'),p('M2 1h8v8h12v8H2z'),line('M3 21c3-3 6 3 9 0s6 3 9 0'));

// HVAC, heating and cooling
a('HVAC','air-conditioner','cooling hvac aircon mini-split',r(2,4,20,11,2)+p('M5 11h14M7 18v4M12 18v3M17 18v4M18 7h1'),r(1,3,22,13,2),line('M4 12h16M7 18v4M12 18v3M17 18v4')+c(18,7,1));
a('HVAC','fan','ventilation airflow cooling hvac',c(12,12,10)+c(12,12,2)+p('M12 10C5-1 20 0 14 11M14 12c13-1 6 13-1 2M11 14C5 25-2 13 10 11'),ring(12,12,10,8),p('M12 10C5-1 20 0 14 11M14 12c13-1 6 13-1 2M11 14C5 25-2 13 10 11')+c(12,12,2));
a('HVAC','heat-pump','heating cooling outdoor hvac unit',r(2,3,20,17,1)+c(10,11,6)+p('M17 7h2M17 11h2M17 15h2M5 20v3M19 20v3M10 7v8M6 11h8'),r(1,2,22,19,1),ring(10,11,6,4)+line('M10 7v8M6 11h8M17 7h2M17 11h2M17 15h2M5 21v2M19 21v2'));
a('HVAC','radiator','heating warmth central radiator',r(3,5,4,15,2)+r(10,5,4,15,2)+r(17,5,4,15,2)+p('M1 9h2M7 9h3M14 9h3M21 9h2M7 17h3M14 17h3M5 1v1M12 1v1M19 1v1'),r(2,4,6,17,2)+r(16,4,6,17,2),r(9,4,6,17,2)+line('M1 9h22M5 1v1M12 1v1M19 1v1'));
a('HVAC','ductwork','ventilation duct install air distribution',p('M3 2h8v7h10v8H3zM3 6h8M7 9v8M15 9v8M21 7v12'),p('M2 1h10v7h10v10H2z'),line('M3 5h8M7 9v8M16 9v8M22 7v12'));
a('HVAC','air-filter','indoor air purification filter hvac',r(3,2,18,20)+p('M6 5l3 14 3-14 3 14 3-14'),r(2,1,20,22),line('M6 5l3 14 3-14 3 14 3-14'),hole('M2 1h20v22H2zM4 3v18h16V3z')+line('M6 5l3 14 3-14 3 14 3-14'));
a('HVAC','thermostat','temperature control smart heating hvac',r(3,2,18,20,3)+c(12,10,5)+p('M12 10l2-2M8 18h8'),r(2,1,20,22,3),ring(12,10,5,3)+line('M12 10l2-2M8 18h8'));
a('HVAC','airflow','fresh air ventilation breeze ducts',p('M2 6h12c7 0 7-7 2-4M2 12h19M2 18h12c7 0 7 7 2 4'),r(1,11,22,2,1),line('M2 6h12c7 0 7-7 2-4M2 18h12c7 0 7 7 2 4'));

// Roofing and exterior envelopes
a('Roofing','roof-tiles','roofer roofing tiled roof',p('M2 15L12 2l10 13M4 15h16v7H4zM5 11h14M8 7h8M12 2v20M8 15v7M16 15v7'),p('M1 15L12 1l11 14v9H1z'),line('M5 11h14M8 7h8M2 15h20M12 2v20M7 16v6M17 16v6'),p('M1 15L12 1l11 14v9H1z'));
a('Roofing','shingles','roof shingles asphalt slate roofer',p('M2 3h20v18H2zM2 9h20M2 15h20M8 3v6M16 3v6M6 9v6M14 9v6M10 15v6M18 15v6'),r(1,2,22,20),line('M2 9h20M2 15h20M8 3v6M16 3v6M6 9v6M14 9v6M10 15v6M18 15v6'));
a('Roofing','gutter','roof drainage rainwater gutters',p('M2 4h20v7c0 8-20 8-20 0zM6 4v7c0 3 12 3 12 0V4M12 17v6'),p('M1 3h22v8c0 10-22 10-22 0z'),line('M5 4v7c0 5 14 5 14 0V4M12 19v4'));
a('Roofing','downspout','rainwater drain exterior gutter',p('M4 2h15v5h-5v10l6 4-3 2-8-5V7H4z'),p('M3 1h17v7h-5v8l7 5-5 3-9-6V8H3z'),line('M9 7h5M9 13h5M10 18l4-2'));
a('Roofing','chimney','masonry fireplace roofing flue',p('M3 22l8-9 10 9M10 13V5h8v14M8 5h12M12 1v1M17 1v1M10 9h8'),p('M1 23l10-12 12 12zM9 4h10v15H9z'),r(7,3,14,3)+line('M10 10h8M12 1v1M17 1v1'));
a('Roofing','siding','exterior cladding fascia house',p('M2 6l10-5 10 5v16H2zM2 10h20M2 14h20M2 18h20'),p('M1 5l11-5 11 5v18H1z'),line('M2 6h20M2 10h20M2 14h20M2 18h20'));
a('Roofing','ladder','roofer climbing access ladder',p('M5 1v22M19 1v22M5 5h14M5 10h14M5 15h14M5 20h14'),r(4,1,3,22)+r(17,1,3,22),r(7,4,10,2)+r(7,9,10,2)+r(7,14,10,2)+r(7,19,10,2));
a('Roofing','roof-inspection','roofer inspection repair estimate',p('M2 11L12 2l10 9M5 9v12h6')+c(17,16,4)+p('M20 19l3 4'),p('M1 11L12 1l11 10-2 2-9-8-9 8zM4 12v10h7V12z'),ring(17,16,4.5,2.5)+line('M20 19l3 4'));

// Construction and remodeling
a('Construction','brick-wall','masonry brick builder construction',p('M2 4h20v17H2zM2 10h20M2 16h20M8 4v6M16 4v6M6 10v6M14 10v6M10 16v5'),r(1,3,22,19),line('M2 10h20M2 16h20M8 4v6M16 4v6M6 10v6M14 10v6M10 16v5'));
a('Construction','cement-mixer','concrete builder construction mixing',p('M4 5l9-3 6 7-9 5zM8 14l-3 7M15 12l5 9M3 21h19M12 6l5 3')+c(17,20,2),p('M2 5l12-4 7 9-11 6z'),line('M8 16l-3 6M16 13l5 9M3 22h19')+ring(17,20,2.5,1));
a('Construction','scaffold','scaffolding access construction renovation',p('M4 2v21M20 2v21M1 8h22M1 17h22M4 8l16 9M20 8L4 17'),r(1,6,22,3)+r(1,16,22,3),line('M4 1v22M20 1v22M4 9l16 7M20 9L4 16'));
a('Construction','blueprint','architect drawing plans remodeling',p('M4 2h16v20H4zM7 6h10v5h-5v7H7zM12 11h5v7M1 19h4'),r(3,1,18,22),line('M7 5h10v6h-5v7H7zM12 11h5v7M1 20h4'));
a('Construction','workbench','carpentry workshop bench wood',p('M1 8h22v4H1zM4 12v11M20 12v11M4 19h16M7 8V2h4v6M16 4v4'),r(1,7,22,6),r(3,13,3,10)+r(18,13,3,10)+line('M6 19h12M7 6V1h4v5M16 3v3'));
a('Construction','wheelbarrow','builder landscaping hauling construction',p('M4 6h17l-5 9H7L3 3H1M9 15l-2 7M14 15l6 7M5 19h12')+c(19,19,3),p('M4 5h19l-6 11H7z'),line('M6 5L3 2H1M9 16l-2 7M14 16l3 3')+ring(19,20,3,1.3));
a('Construction','house-frame','framing newbuild residential construction',p('M2 10L12 1l10 9M4 9v14h16V9M4 15h16M8 6v17M16 6v17M12 2v13'),p('M1 10L12 0l11 10-2 2-9-8-9 8z'),line('M4 11v12h16V11M4 15h16M8 8v15M16 8v15M12 4v11'));
a('Construction','drywall','wallboard plaster renovation remodeling',p('M2 2h14v20H2zM16 8h6v14h-6M6 7h1M6 17h1M12 7h1M12 17h1M16 15h6'),r(1,1,15,22),r(17,8,6,15)+c(6,7,1)+c(6,17,1)+c(12,7,1)+c(12,17,1));

// Earthwork and civil construction
a('Excavation','excavator','earthmoving excavating digger earthwork',p('M2 20h12v3H2zM4 18V9h7v9M11 10l5-8 6 9-3 4h-4M6 10v4h4'),r(2,19,13,4,2)+r(3,8,9,10,1),line('M12 11l4-9 6 10-3 4h-4')+r(6,10,4,4));
a('Excavation','bulldozer','earthmoving grading dozer civil',p('M2 20h14v3H2zM4 18V8h8v10M12 14h5l3 6M20 10v12h3M5 8V5h6'),r(1,19,16,4,2)+r(3,7,10,11),p('M19 10h3v12h-5z')+line('M13 14h3l3 5M5 6V4h7'));
a('Excavation','dump-truck','earthwork hauling tipper construction',p('M2 4h13l-3 11H4zM15 9h5l3 6v5h-8M15 15h8')+c(6,20,3)+c(18,20,3),p('M1 3h15l-3 13H4zM16 8h4l3 7v4h-7z'),c(6,20,3)+c(19,20,3));
a('Excavation','road-roller','compaction paving civil asphalt',p('M3 12V4h9v14M12 12h7l3 6M5 4V1h5M18 18h5v5h-5')+c(6,19,4),r(2,3,11,15),ring(6,19,4,2)+r(17,17,6,6,1)+line('M13 12h5l3 4M5 2V1h5'));
a('Excavation','shovel','digging spade earthwork garden',p('M9 1h6v5l-3 3-3-3zM12 9v7M6 16h12v3l-6 5-6-5z'),p('M5 15h14v4l-7 5-7-5z'),line('M12 14V8M9 1h6v4l-3 3-3-3z'));
a('Excavation','traffic-cone','workzone civil safety construction',p('M9 2h6l5 18H4zM2 20h20v3H2zM7 10h10M6 15h12'),p('M9 1h6l6 20H3z'),r(1,20,22,3)+line('M7 10h10M6 15h12'));
a('Excavation','road','paving driveway asphalt civil',p('M7 1L1 23M17 1l6 22M12 2v3M12 10v4M12 19v4'),p('M6 1h12l6 22H0z'),r(11,2,2,4)+r(11,10,2,4)+r(11,19,2,4),hole('M6 1h12l6 22H0zM11 2v4h2V2zM11 10v4h2v-4zM11 19v4h2v-4z'));
a('Excavation','foundation','footings sitework building earthwork',p('M1 16h22M3 16V8h5v8M16 16V8h5v8M1 22h22M6 16v6M18 16v6M8 11h8'),p('M2 7h7v8h6V7h7v9H2z'),r(1,20,22,3)+line('M6 16v4M18 16v4M9 11h6'));

// Cleaning and household maintenance
a('Cleaning','broom','cleaner sweeping housekeeping janitorial',p('M17 1l-7 12M7 11l8 5-5 8-9-6zM5 17l5 4'),p('M6 10l10 6-6 8-10-6z'),line('M17 1l-6 10M5 16l6 4M8 14l6 4'));
a('Cleaning','mop','housekeeping floor cleaning janitorial',p('M15 1l-5 14M5 14h11l4 9H1zM6 17l-1 6M11 17v6M15 17l2 6'),p('M5 13h11l5 11H0z'),line('M15 1l-4 11M6 17l-1 6M11 17v6M15 17l2 6'));
a('Cleaning','bucket','cleaning water janitorial supplies',p('M3 9h18l-3 14H6zM5 9V6c0-7 14-7 14 0v3M7 13h10'),p('M2 8h20l-4 15H6z'),line('M5 7V6c0-7 14-7 14 0v1M7 13h10'));
a('Cleaning','spray-bottle','cleaning disinfectant sanitizing supplies',p('M7 2h13v4h-7v5l5 5v7H4v-7l5-5V6H7zM16 6v4M4 17h14'),p('M8 10h5l6 6v7H3v-7z'),p('M6 1h15v6H9z')+line('M17 7v3M4 17h14'));
a('Cleaning','vacuum','cleaner carpet housekeeping equipment',p('M2 16h12v7H2zM5 16v-3h6v3M14 18h4V3h3M18 18l5 5h-7')+c(5,22,1)+c(12,22,1),r(1,15,14,8,2),line('M5 14v-2h6v2M15 18h3V3h3')+p('M17 18h3l4 5H14z'));
a('Cleaning','squeegee','window cleaning glass washing',p('M2 4h20v5H2zM8 9v4h8V9M12 13v10'),r(1,3,22,7),p('M7 10h10v4h-4v9h-2v-9H7z'));
a('Cleaning','laundry','washer washing linen housekeeping',r(3,2,18,20,1)+c(12,14,6)+p('M3 7h18M6 4.5h1M17 4.5h1M7 14c3-3 7 3 10 0'),r(2,1,20,22,1),ring(12,14,6,4)+line('M3 7h18M8 14c3-3 5 3 8 0'));
a('Cleaning','pressure-washer','exterior cleaning powerwashing driveway',p('M3 7h9v13H3zM5 7V2h5v5M12 15h4V5h4M18 3l5 4M21 10l2 1M19 12l2 2')+c(5,21,2)+c(11,21,2),r(2,6,11,15,1),c(5,21,2)+c(11,21,2)+line('M5 5V1h5v4M13 15h3V5h4M18 3l5 4M21 10l2 1M19 12l2 2'));

// Landscaping and tree services
a('Landscaping','lawnmower','lawn grass mowing garden',p('M3 15h16v6H3zM7 15v-5h7v5M18 15l3-13h2')+c(5,21,2)+c(17,21,2),r(2,14,18,8,1),c(5,21,2)+c(17,21,2)+line('M7 13V9h7v4M19 13l2-11h2'));
a('Landscaping','hedge-trimmer','hedging shrubs pruning landscaping',p('M2 9h8v8H2zM10 12h12M13 12V9M16 12v3M19 12V9M6 9V5h4v4M5 17v5'),r(1,8,10,10,1),line('M11 12h12M13 12V8M17 12v4M21 12V8M5 7V4h5v3M5 19v4'));
a('Landscaping','watering-can','garden plants irrigation watering',p('M5 10h11v12H5zM5 12c-6-4-6 8 0 6M16 14l6-7v14l-6-2M8 10V6h6v4'),r(4,9,13,14,1),p('M17 13l6-8v17l-6-3z')+line('M3 12c-5-2-4 7 0 6M8 8V5h6v3'));
a('Landscaping','sprinkler','irrigation garden lawn watering',p('M6 20h12M12 20v-7M8 13h8M1 5c3-4 6-3 9 1M23 5c-3-4-6-3-9 1M5 9l3 2M19 9l-3 2'),p('M7 12h10v3h-4v5h6v3H5v-3h6v-5H7z'),line('M1 5c3-4 6-3 9 1M23 5c-3-4-6-3-9 1M5 9l3 2M19 9l-3 2'));
a('Landscaping','chainsaw','tree arborist cutting pruning',r(1,10,10,11,2)+p('M4 10V6h6v4M11 13h9c5 0 5-6 0-6h-9M14 7v6M18 7v6'),r(1,9,11,13,2),line('M4 7V4h6v3')+hole('M12 6h8c5 0 5 9 0 9h-8zM14 9v3h6c1 0 1-3 0-3z'));
a('Landscaping','garden-fork','soil gardening cultivator landscaping',p('M7 1v7M12 1v7M17 1v7M7 6c0 8 10 8 10 0M12 12v11'),p('M11 12h2v11h-2z'),line('M6 1v6c0 8 12 8 12 0V1M12 1v9'));
a('Landscaping','tree-stump','arborist stump grinding tree removal',p('M6 7h12v10l4 5H2l4-5zM6 7c0-5 12-5 12 0s-12 5-12 0M9 12v6M15 12v6'),p('M5 7h14v9l5 7H0l5-7z'),ring(12,7,6,3.5)+line('M9 12v6M15 12v6'));
a('Landscaping','landscape-plan','garden design planning grounds',p('M2 3h20v19H2zM2 16c7-7 13 7 20 0M10 3v9M10 12h12')+c(6,8,2)+c(17,7,2),r(1,2,22,21),line('M2 16c7-7 13 7 20 0M10 3v9M10 12h12')+c(6,8,2)+c(17,7,2));

// Property and real estate
a('Real estate','for-sale','property realtor listing sign sale',p('M4 1v22M2 4h20M8 4v4M19 4v4M7 8h14v10H7zM10 12h8'),r(6,7,16,12),line('M4 1v22M2 4h20M8 4v3M19 4v3M10 12h8'));
a('Real estate','floor-plan','property layout architectural rooms',p('M2 2h20v20H2zM10 2v9h12M2 15h8v7M15 11v11M6 2v4M18 22v-3'),r(1,1,22,22),line('M10 2v9h12M2 15h8v7M15 11v11M6 2v4M18 22v-3'),hole('M1 1h22v22H1zM3 3v18h18V3z')+line('M10 2v9h12M2 15h8v7M15 11v11'));
a('Real estate','apartments','multifamily rental flats property',p('M2 22V7h9v15M11 22V2h11v20M5 11h2M5 16h2M15 6h3M15 11h3M15 16h3'),r(1,6,10,17)+r(12,1,11,22),r(4,10,3,3)+r(4,16,3,3)+r(15,5,4,3)+r(15,10,4,3)+r(15,16,4,3));
a('Real estate','house-key','property purchase realtor home ownership',p('M1 11l9-9 9 9M4 9v13h8')+c(17,15,4)+p('M17 19v4M20 21h-3'),p('M0 11L10 1l10 10-2 2-8-8-8 8zM3 12v11h9V12z'),ring(17,15,4.5,2.5)+line('M17 20v3M20 22h-3'));
a('Real estate','house-check','property inspection verified approved home',p('M2 11L12 2l10 9M5 9v13h14V9M8 15l3 3 6-7'),p('M1 11L12 1l11 10-3 1v11H4V12z'),line('M8 15l3 3 6-7'));
a('Real estate','open-house','property viewing realtor invitation',p('M1 10L12 1l11 9M4 9v14h16V9M9 23V12l7-2v13M13 16v2'),p('M0 10L12 0l12 10-2 2-10-8-10 8zM3 12h5v11H3zM17 12h4v11h-4z'),p('M9 12l7-3v14H9z')+line('M13 16v2'));
a('Real estate','location-house','neighborhood property area realtor',p('M12 23S2 16 2 11a10 10 0 0 1 20 0c0 5-10 12-10 12zM7 10l5-5 5 5M8 9v6h8V9'),p('M12 23S2 16 2 11a10 10 0 0 1 20 0c0 5-10 12-10 12z'),line('M7 10l5-5 5 5M8 9v6h8V9'));
a('Real estate','property-deed','title ownership deed realestate conveyance',p('M4 1h16v22H4zM7 8l5-4 5 4M8 8v5h8V8M8 18h8'),r(3,1,18,22),line('M7 8l5-4 5 4M8 8v5h8V8M8 18h8'));

// Law and professional counsel
a('Legal','scales','law justice legal balance attorney',p('M12 1v22M6 23h12M3 6h18M5 6L1 15h8zM19 6l-4 9h8zM1 15c0 5 8 5 8 0M15 15c0 5 8 5 8 0'),r(11,1,2,21)+r(5,21,14,2),line('M3 6h18M5 6L1 15h8zM19 6l-4 9h8z')+p('M1 15h8c0 5-8 5-8 0M15 15h8c0 5-8 5-8 0'));
a('Legal','gavel','law attorney judge dispute litigation',p('M3 7l6-6 9 9-6 6zM13 13l9 9M2 22h11v-4H2z'),p('M2 7l7-7 10 10-7 7z'),line('M14 14l8 8')+r(1,18,12,5));
a('Legal','courthouse','law legal institution court government',p('M1 7l11-6 11 6zM2 22h20M5 9v10M12 9v10M19 9v10M3 19h18'),p('M0 7l12-7 12 7zM1 21h22v3H1z'),r(4,9,3,11)+r(10.5,9,3,11)+r(17,9,3,11));
a('Legal','legal-contract','law agreement attorney contract',p('M3 1h16v22H3zM7 6h8M7 10h6M8 18l9-9 4 4-9 9-5 1z'),r(2,1,18,22),p('M7 18l10-10 5 5-10 10H7z'),hole('M2 1h18v22H2zM6 5v2h9V5zM6 10v2h7v-2z')+p('M7 18l10-10 5 5-10 10H7z'));
a('Legal','law-book','legal reference attorney statute',p('M4 2h16v20H4c-4 0-4-5 0-5h16M4 2v15M8 6h8M12 6v7M8 11h8'),r(3,1,18,17)+r(3,20,18,3),line('M7 6h10M12 6v8M8 12h8M2 3v18'));
a('Legal','justice','legal civil rights justice protection',p('M12 2l9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6zM12 6v12M7 9h10M7 9l-2 5h4zM17 9l-2 5h4z'),p('M12 1l10 4v7c0 6-5 9-10 11C7 21 2 18 2 12V5z'),line('M12 6v12M7 9h10M7 9l-2 5h4zM17 9l-2 5h4z'));
a('Legal','consultation','counsel advice legal professional meeting',p('M7 2h15v11h-5l-4 4v-4H7zM10 6h8')+c(6,15,3)+p('M1 23c0-7 10-7 10 0'),p('M6 1h17v13h-6l-5 5v-5H6z'),c(6,15,3)+p('M1 23c0-7 10-7 10 0z')+line('M10 6h8'));
a('Legal','estate-plan','will trust inheritance estate attorney',p('M4 1h16v22H4zM7 7h10M7 11h10M7 15h4M14 16l2 2 4-4M7 20h5'),r(3,1,18,22),line('M7 7h10M7 11h10M7 15h4M14 16l2 2 4-4M7 20h5'));

// Medical and women's health
a('Healthcare','hospital','clinic medical practice hospital',p('M7 22V2h10v20M1 22V9h6M17 9h6v13M10 6h4M12 4v4M10 22v-6h4v6'),r(6,1,12,22)+r(1,8,5,15)+r(18,8,5,15),line('M10 6h4M12 4v4')+r(10,16,4,7));
a('Healthcare','syringe','vaccination injection nurse medical',p('M6 3l15 15M10 1l13 13M3 6l10 13 6-6L6 3zM6 18l-5 5M9 9l3-3M12 12l3-3'),p('M2 6l11 14 7-7L6 2z'),line('M10 1l13 13M6 18l-5 5M9 9l3-3M12 12l3-3'));
a('Healthcare','ultrasound','obgyn prenatal medical imaging sonogram',r(3,2,18,15,1)+p('M8 22h8M12 17v5M6 13l6-7 6 7M6 13c4 3 8 3 12 0')+c(12,11,1),r(2,1,20,17,1),line('M8 23h8M12 18v5M6 13l6-7 6 7M6 13c4 3 8 3 12 0')+c(12,11,1.5));
a('Healthcare','maternity','obgyn womens health pregnancy prenatal',c(10,3,2)+p('M9 7c6 0 8 4 6 8l-2 2 3 6M9 7L5 17h5l-2 6M9 10l-1 4h7'),c(10,3,2.5)+p('M8 7c8-1 10 7 6 11l3 5h-4l-3-6H5z'),line('M9 10l-1 4h7M9 18l-2 5'));
a('Healthcare','womens-health','obgyn gynecology reproductive care women',c(12,8,6)+p('M12 14v9M8 20h8'),ring(12,8,7,4.5),r(10.8,14,2.4,9)+r(7.5,18.8,9,2.4));
a('Healthcare','dental-implant','dentist dental restoration implant',p('M5 5c0-6 5-3 7-3s7-3 7 3l-2 5H7zM9 10v11l3 2 3-2V10M9 14h6M9 18h6'),p('M4 5c0-7 6-4 8-4s8-3 8 4l-3 6H7z'),p('M8 12h8v9l-4 3-4-3z')+line('M8 15h8M8 19h8'));
a('Healthcare','brain','neurology mental health therapy cognitive',p('M12 4C6-3 1 5 4 8-2 11 2 18 6 17c0 7 6 7 6 2 0 5 6 5 6-2 4 1 8-6 2-9 3-3-2-11-8-4zM12 4v15M7 7l2 3-3 3M17 7l-2 3 3 3'),p('M12 4C6-3 1 5 4 8-2 11 2 18 6 17c0 7 6 7 6 2z'),p('M12 4c6-7 11 1 8 4 6 3 2 10-2 9 0 7-6 7-6 2z')+line('M7 7l2 3-3 3M17 7l-2 3 3 3'));
a('Healthcare','bone-joint','orthopedic physiotherapy rehabilitation bones',p('M4 2c-5 0-3 7 0 6l5 8c-4 5 3 8 5 5 5 2 8-5 3-6L9 7c1-5-6-8-5-5z'),p('M4 2c-5 0-3 7 0 6l5 8c-4 5 3 8 5 5 5 2 8-5 3-6L9 7c1-5-6-8-5-5z'),line('M7 9l7 8'));

// Senior care and home assistance
a('Care services','walking-aid','senior elderly mobility home care walker',p('M5 22V5c0-4 14-4 14 0v17M5 10h14M8 10v9M16 10v9M3 22h4M17 22h4'),line('M4 22V5c0-5 16-5 16 0v17M4 10h16'),r(7,10,2,10)+r(15,10,2,10)+r(2,21,5,2)+r(17,21,5,2));
a('Care services','wheelchair','accessibility senior care mobility',c(12,3,2)+p('M10 7v7h8l3 7M10 9h7M7 9a7 7 0 1 0 8 11'),c(12,3,2.5)+p('M9 7h3v6h7l4 8-3 1-3-6H9z'),line('M7 9a7 7 0 1 0 8 11M12 9h5'));
a('Care services','home-care','homecare caregiver domiciliary assistance',p('M1 11L12 1l11 10M4 9v14h16V9M12 19c-9-6-3-10 0-5 3-5 9-1 0 5z'),p('M0 11L12 0l12 11-2 2-10-9-10 9zM3 12h18v11H3z'),p('M12 21c-12-8-4-13 0-7 4-6 12-1 0 7z'));
a('Care services','nurse','caregiver nursing medical staff',p('M6 4l6-3 6 3-2 5H8zM8 9v4c0 6 8 6 8 0V9M3 23c0-7 18-7 18 0M10 5h4M12 3v4'),p('M5 4l7-4 7 4-3 6H8zM3 23c0-7 18-7 18 0z'),line('M8 10v3c0 6 8 6 8 0v-3M10 5h4M12 3v4'));
a('Care services','hands-care','care support compassion caregiver charity',p('M1 16l5-6 4 4-2 2M23 16l-5-6-4 4 2 2M1 16l6 7h10l6-7M12 12c-10-6-3-12 0-7 3-5 10 1 0 7z'),p('M0 16l6-7 5 6-3 2-4-3-2 2 5 6h10l5-6-2-2-4 3-3-2 5-6 6 7-7 8H7z'),p('M12 13C0 6 8-2 12 4c4-6 12 2 0 9z'));
a('Care services','pill-organizer','medication care pharmacy adherence senior',r(2,6,20,16,1)+p('M2 12h20M7 6v16M12 6v16M17 6v16M7 2h10'),r(1,5,22,18,1),line('M2 12h20M7 6v16M12 6v16M17 6v16M7 2h10'));
a('Care services','meal-care','care nutrition meal preparation assistance',c(12,12,8)+p('M12 12c-8-5-3-9 0-5 3-4 8 0 0 5zM1 4v16M23 4v16'),ring(12,12,9,7),p('M12 15c-12-7-4-13 0-7 4-6 12 0 0 7z')+line('M1 4v16M23 4v16'));
a('Care services','accessible-bath','senior bathroom safety accessible adaptation',p('M1 13h22l-3 8H4zM6 13V4h8M14 4v4M8 21v2M18 21v2M17 5h5v6'),p('M0 12h24l-4 10H4z'),line('M5 11V3h10v5M17 4h5v7M8 22v1M18 22v1'));

// Barber, hair, salon and beauty
a('Beauty','razor','barber shave shaving grooming',p('M3 2h18v6H3zM7 8v4h10V8M12 12v11M6 5h12'),r(2,1,20,8),p('M6 9h12v4h-4v10h-4V13H6z')+line('M6 5h12'));
a('Beauty','hair-clipper','barber grooming haircut clippers',p('M5 2h14v7l-3 14H8L5 9zM5 6h14M8 2V1M12 2V1M16 2V1M10 12h4'),p('M4 7h16l-4 16H8z'),r(4,1,16,5)+r(9,11,6,4,1));
a('Beauty','comb','hair barber salon styling comb',p('M2 3h20v5H2zM3 8v13M7 8v13M11 8v13M15 8v13M19 8v13'),r(1,2,22,7,1),r(2,9,2,13)+r(6,9,2,13)+r(10,9,2,13)+r(14,9,2,13)+r(18,9,2,13));
a('Beauty','hair-dryer','salon hair styling blowdry',p('M2 4h12l5 4v6l-5 3H2zM8 17v6h5l2-7M19 8h4v5h-4M5 7v7'),p('M1 3h14l5 5v6l-5 4H1z'),p('M7 18h8l-2 5H7zM20 7h3v7h-3z')+line('M5 7v7'));
a('Beauty','salon-chair','barber furniture salon seat grooming',p('M5 2h14v11H5zM2 10v7h20v-7M12 17v6M7 23h10'),r(4,1,16,13,1),p('M1 10h3v6h16v-6h3v9H1zM11 19h2v2h5v2H6v-2h5z'));
a('Beauty','manicure','nail beauty salon polish treatment',p('M7 8h10v15H7zM9 1h6v7H9zM10 12v7M7 16h10'),r(6,8,12,15,2),r(8,1,8,6,1)+line('M10 12v7'));
a('Beauty','mirror','beauty makeup reflection salon',c(12,8,7)+p('M12 15v8M7 23h10M9 5l-1 3'),c(12,8,7.5),p('M10 16h4v5h5v2H5v-2h5z')+line('M9 4L7 8'));
a('Beauty','hair-color','salon hair coloring dye stylist',p('M2 4h8v15H2zM4 1v3M8 1v3M14 22V9h7v13M14 9l3-7h4v7M5 8h2'),r(1,3,10,18,1),p('M13 9h9v14h-9zM14 7l3-6h5v6z')+line('M4 1v2M8 1v2M5 8h2'));

// Wellness and massage
a('Wellness','massage','massage therapy treatment wellness',p('M2 17h20M4 17v6M20 17v6M6 12h11c5 0 5 5 0 5M3 9h2M7 3l4 3 4-3M11 6v5')+c(4,13,2),p('M1 16h22v3H1zM3 19h3v4H3zM18 19h3v4h-3z'),c(4,13,2.5)+r(7,11,15,5,2)+line('M7 3l4 3 4-3M11 6v3'));
a('Wellness','hot-stones','massage spa hot stone relaxation',p('M2 20c0-5 20-5 20 0s-20 4-20 0M5 13c0-4 14-4 14 0s-14 4-14 0M8 6c0-4 8-4 8 0s-8 4-8 0'),p('M1 20c0-6 22-6 22 0s-22 5-22 0M7 6c0-5 10-5 10 0S7 11 7 6'),p('M4 13c0-5 16-5 16 0s-16 5-16 0'));
a('Wellness','aroma','essential oil aromatherapy wellness spa',p('M7 11h10v12H7zM9 7h6v4H9zM12 7V3M4 8c-3-3 2-4 0-7M20 8c3-3-2-4 0-7'),r(6,10,12,13,2),r(8,6,8,4)+line('M12 5V2M4 8c-3-3 2-4 0-7M20 8c3-3-2-4 0-7'));
a('Wellness','candle','spa relaxation ambience candle',p('M6 10h12v13H6zM12 8c-5-3-1-5 0-7 2 2 5 5 0 7M12 8v3M6 13h12'),r(5,10,14,13,1),p('M12 8c-7-4-1-7 0-8 3 3 6 6 0 8')+line('M12 8v3M6 14h12'));
a('Wellness','yoga','wellness meditation fitness balance',c(12,3,2)+p('M8 8h8l3 5 4 1M1 14l4-1 3-5M9 8v7l-7 6h20l-7-6V8M9 15h6'),c(12,3,2.5)+p('M8 7h8l-1 8 8 6H1l8-6z'),line('M8 8l-3 5-4 1M16 8l3 5 4 1M7 21l5-4 5 4'));
a('Wellness','acupuncture','therapy needles holistic wellness',p('M5 2l14 20M3 5l4-3M11 2l-8 20M9 2l4 1M20 3l-8 19M18 3l4 2'),line('M5 2l14 20M11 2L3 22M20 3l-8 19'),r(2,2,7,2)+r(8,1,6,2)+p('M18 2l5 2-1 2-5-2z'));
a('Wellness','sauna','spa heat steam wellness sauna',p('M2 15h20v4H2zM5 19v4M19 19v4M6 11c-4-4 3-5 0-9M12 11c-4-4 3-5 0-9M18 11c-4-4 3-5 0-9'),r(1,14,22,6),r(4,20,3,3)+r(17,20,3,3)+line('M6 11c-4-4 3-5 0-9M12 11c-4-4 3-5 0-9M18 11c-4-4 3-5 0-9'));
a('Wellness','facial','skincare facial esthetician spa beauty',p('M5 4c0-4 14-4 14 0v10c0 5-5 9-7 9s-7-4-7-9zM8 9h2M14 9h2M12 11v4M9 18h6'),p('M4 4c0-5 16-5 16 0v10c0 5-5 10-8 10s-8-5-8-10z'),line('M8 9h2M14 9h2M12 11v4M9 18h6'));

// Computer and electronics repair
a('Repair','chip-repair','computer electronics repair processor chip',r(6,6,12,12)+p('M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5M10 10h4v4h-4z'),r(5,5,14,14,1),r(9,9,6,6)+line('M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4'));
a('Repair','soldering-iron','electronics repair solder workshop',p('M2 4l4-3 10 12-4 4zM14 15l7 7M17 11l3-2M20 3c-3 2 3 3 0 5'),p('M1 4l5-4 11 13-5 5z'),line('M15 16l7 7M17 10l3-2M20 2c-3 2 3 3 0 5'));
a('Repair','screen-repair','computer monitor repair cracked screen',r(2,2,20,16,1)+p('M12 18v5M7 23h10M9 2l4 6-5 3 7 7M13 8h5'),r(1,1,22,18,1),line('M12 19v4M7 23h10M9 2l4 6-5 3 7 7M13 8h5'));
a('Repair','phone-repair','mobile phone repair cracked glass',r(6,1,12,22,2)+p('M10 1l4 7-5 3 6 7M10 20h4'),r(5,1,14,22,2),line('M10 2l4 6-5 3 6 7M10 20h4'));
a('Repair','battery-replace','phone battery repair replacement power',p('M7 4h10v19H7zM10 1h4v3M2 8V3h4M22 16v5h-4M10 12h4M12 10v4'),r(6,4,12,19,1),r(9,1,6,2)+line('M2 8V3h3M22 16v5h-3M10 12h4M12 10v4'));
a('Repair','hard-drive','data recovery disk storage repair',r(3,2,18,20,1)+c(12,11,6)+c(12,11,2)+p('M6 18l7-8M7 20h1M17 20h1'),r(2,1,20,22,1),ring(12,11,6,3)+line('M6 18l7-8')+c(7,20,1)+c(17,20,1));
a('Repair','diagnostics','electronics troubleshooting testing repair',p('M3 2h18v20H3zM6 12h3l2-5 3 10 2-5h2M7 4h1M16 4h1'),r(2,1,20,22,1),line('M6 12h3l2-5 3 10 2-5h2')+c(7,4,1)+c(17,4,1));
a('Repair','repair-tools','maintenance electronics technician repair',p('M2 3l4-2 4 6-3 3-3-3zM7 10l14 13M16 1a5 5 0 0 0-4 7L1 19l4 4L16 12a5 5 0 0 0 7-4l-4 2-4-4z'),p('M16 1a5 5 0 0 0-4 7L1 19l4 4L16 12a5 5 0 0 0 7-4l-4 2-4-4z'),p('M1 3l5-3 5 7-4 4-4-4z')+line('M9 12l12 11'));

// Software, AI and SaaS
a('Software','api','software integration developer api endpoints',p('M7 5L1 12l6 7M17 5l6 7-6 7M14 2l-4 20'),p('M13 1h2l-4 22H9z'),line('M7 5L1 12l6 7M17 5l6 7-6 7'));
a('Software','cloud-code','saas cloud platform software development',p('M5 18C-3 18 0 7 7 9 9-3 24 3 20 11c5 1 4 7-1 7M9 12l-3 3 3 3M15 12l3 3-3 3'),p('M5 20C-4 20-1 6 6 8 10-5 25 3 21 11c5 2 3 9-2 9z'),line('M9 11l-4 4 4 4M15 11l4 4-4 4'));
a('Software','ai-network','ai native intelligence neural automation',c(12,12,4)+c(4,4,2)+c(20,4,2)+c(4,20,2)+c(20,20,2)+p('M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3'),c(12,12,5),c(4,4,2.5)+c(20,4,2.5)+c(4,20,2.5)+c(20,20,2.5)+line('M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3'));
a('Software','workflow','automation process integration software',r(8,1,8,6)+r(1,17,8,6)+r(15,17,8,6)+p('M12 7v5M5 17v-5h14v5'),r(7,1,10,7,1),r(1,16,9,7,1)+r(14,16,9,7,1)+line('M12 8v4M5 15v-3h14v3'));
a('Software','subscription','saas billing recurring subscription',r(3,3,18,18,2)+p('M3 8h18M8 12c4-4 9 1 6 5M16 13v4h-4M7 17h.1'),r(2,2,20,20,2),line('M3 8h18M8 12c4-4 9 1 6 5M16 13v4h-4')+c(7,17,1));
a('Software','dashboard','analytics software portal dashboard',r(1,3,22,18,1)+p('M1 8h22M9 8v13M13 17v-4M17 17v-6M21 17v-3M4 5h1'),r(1,2,22,20,1),line('M1 8h22M9 8v13M13 17v-4M17 17v-6M21 17v-3')+c(4,5,1));
a('Software','code-branch','version control git development branch',c(5,3,2)+c(5,21,2)+c(19,3,2)+p('M5 5v14M19 5v4c0 6-14 2-14 8'),line('M5 5v14M19 5v4c0 6-14 2-14 8'),c(5,3,3)+c(5,21,3)+c(19,3,3));
a('Software','bug','software debugging issue testing',p('M7 8h10v9c0 8-10 8-10 0zM9 8V4h6v4M4 3l5 3M20 3l-5 3M1 11h6M17 11h6M1 18h6M17 18h6M12 8v14'),p('M6 7h12v10c0 9-12 9-12 0z'),line('M9 6V3h6v3M4 2l4 3M20 2l-4 3M1 11h4M19 11h4M1 18h4M19 18h4M12 8v14'));

// Creative agencies, designers and portfolios
a('Creative','vector-pen','design agency vector graphic illustration',p('M12 2l8 13-8 8-8-8zM12 2v10')+c(12,14,2)+p('M8 20h8'),p('M12 1l9 14-9 9-9-9z'),ring(12,14,2.8,1)+line('M12 2v9M8 20h8'));
a('Creative','layers','design agency composition layers',p('M1 7l11-5 11 5-11 5zM1 12l11 5 11-5M1 17l11 5 11-5'),p('M0 7l12-6 12 6-12 6z'),line('M1 13l11 5 11-5M1 18l11 5 11-5'));
a('Creative','color-swatches','branding design palette colors',p('M2 2h7v19H2zM9 6l5-3 8 14-6 4-7-12M9 16h13v7H5')+c(5.5,18,1),r(1,1,9,22,1),p('M11 6l4-3 8 14-7 4-5-9zM11 19h12v4H11z')+c(5.5,18,1.5));
a('Creative','typography','type font branding design editorial',p('M2 3h20M12 3v20M7 23h10M2 3v4M22 3v4'),r(1,2,22,3),p('M10.5 5h3v15H18v3H6v-3h4.5z')+r(1,5,2,3)+r(21,5,2,3));
a('Creative','motion-design','animation motion creative studio',p('M7 3l15 9-15 9zM2 5h2M1 12h3M2 19h2'),p('M6 2l17 10-17 10z'),line('M2 5h1M1 12h2M2 19h1'));
a('Creative','film-camera','video production creative filmmaking',r(2,9,14,13,1)+c(5,5,4)+c(13,5,4)+p('M16 13l7-4v13l-7-4'),r(1,9,16,14,1),c(5,5,4)+c(13,5,4)+p('M18 12l5-3v14l-5-4z'));
a('Creative','storyboard','agency video production storyboard narrative',r(2,3,20,18)+p('M2 12h20M12 3v18M5 9l3-3 2 3M15 15l4 3-4 1'),r(1,2,22,20),line('M2 12h20M12 3v18M5 9l3-3 2 3')+p('M15 15l5 3-5 2z'));
a('Creative','brand-mark','branding identity design studio',p('M12 1l10 6v10l-10 6-10-6V7zM7 17V7l10 10V7'),p('M12 0l11 7v10l-11 7L1 17V7z'),line('M7 17V7l10 10V7'));

// Restaurants, catering and food businesses
a('Food services','burger','restaurant takeaway burger food',p('M2 10c0-12 20-12 20 0zM2 14h20M2 18h20v4H2zM7 6h1M15 6h1'),p('M1 10c0-13 22-13 22 0zM1 18h22v5H1z'),r(1,13,22,3,1)+c(7,6,1)+c(15,6,1));
a('Food services','fish','restaurant seafood fish food',p('M2 12c5-9 13-9 17-3l4-4v14l-4-4c-4 6-12 6-17-3zM14 9v6')+c(7,11,1),p('M1 12c6-11 14-11 18-4l5-4v16l-5-4c-4 7-12 7-18-4z'),c(7,11,1.5)+line('M14 8v8'));
a('Food services','bread','bakery bread loaf artisan food',p('M4 9c-7-4 1-11 6-7 3-3 8-1 9 2 7 0 5 7 1 7v11H4zM9 10v7M15 8v9'),p('M3 10C-4 5 4-3 10 1c3-3 9-1 10 2 7 1 4 9 1 9v11H3z'),line('M9 9v8M15 7v10'));
a('Food services','croissant','bakery pastry cafe breakfast',p('M1 17l5-10 6-4 6 4 5 10-6 5-5-3-5 3zM6 7l4 12M18 7l-4 12M12 3v16'),p('M0 17L5 6l7-4 7 4 5 11-7 6-5-3-5 3z'),line('M6 7l4 12M18 7l-4 12M12 3v16'));
a('Food services','sushi','restaurant japanese sushi food',p('M3 8c0-7 18-7 18 0v10c0 7-18 7-18 0zM3 8c0 7 18 7 18 0M8 8c0-3 8-3 8 0s-8 3-8 0'),p('M2 8c0-9 20-9 20 0v10c0 8-20 8-20 0z'),ring(12,8,5,2)+line('M3 10c4 6 14 6 18 0'));
a('Food services','taco','restaurant mexican taco takeaway food',p('M2 19c0-22 20-22 20 0zM2 19c7-5 13-5 20 0M5 10l3 2 4-4 4 4 3-2'),p('M1 20C1-4 23-4 23 20z'),line('M2 19c7-5 13-5 20 0M5 10l3 2 4-4 4 4 3-2'));
a('Food services','takeaway','restaurant delivery takeout food container',p('M5 5h14l3 7-4 10H6L2 12zM2 12h20M8 5V2h8v3M8 12l4 4 4-4'),p('M4 4h16l4 8-5 11H5L0 12z'),line('M2 12h20M8 3V1h8v2M8 12l4 4 4-4'));
a('Food services','restaurant-menu','restaurant catering food menu',p('M3 2h18v20H3zM7 6h10M7 10h4M7 14h4M7 18h4M16 10h1M16 14h1M16 18h1'),r(2,1,20,22,1),line('M7 6h10M7 10h4M7 14h4M7 18h4')+c(17,10,1)+c(17,14,1)+c(17,18,1));

// Retail and ecommerce
a('Retail','hanger','clothing apparel fashion retail',p('M9 5c0-6 8-5 6 0l-3 3v2L1 19v3h22v-3L12 10'),p('M1 19l11-10 11 10v4H1z'),line('M9 5c0-6 8-5 6 0l-3 3')+p('M4 20h16l-8-7z'));
a('Retail','shoe','footwear fashion retail shop',p('M2 12V5h5l3 8 12 4v5H2zM2 18h20M9 11l4-2M12 14l4-2'),p('M1 11V4h7l3 8 12 4v7H1z'),line('M2 18h20M9 11l4-2M12 14l4-2'));
a('Retail','necklace','jewelry jewellery boutique retail',p('M3 2c0 18 18 18 18 0M12 16l5 4-5 4-5-4z'),line('M3 2c0 18 18 18 18 0'),p('M12 15l6 5-6 4-6-4z'));
a('Retail','perfume','fragrance beauty retail boutique',r(4,10,16,13,2)+p('M8 10V6h8v4M9 1h6v5H9zM8 15h8v4H8z'),r(3,9,18,14,2),r(7,5,10,4)+r(8,1,8,3)+r(8,14,8,5));
a('Retail','cosmetics','makeup beauty retail shop',p('M3 12h7v11H3zM4 12V4l5-3v11M15 6h6v17h-6zM15 10h6'),r(2,12,9,11)+r(14,6,8,17,1),p('M3 11V4l7-4v11z')+line('M15 11h6'));
a('Retail','cash-register','retail checkout pos shop payments',p('M4 10h16l3 9v4H1v-4zM7 2h10v8H7zM5 19h14M9 5h6M7 14h1M12 14h1M17 14h1'),p('M4 9h16l4 10v5H0V19z'),r(6,1,12,8,1)+line('M5 19h14M9 5h6')+c(7,14,1)+c(12,14,1)+c(17,14,1));
a('Retail','product-shelves','retail store inventory merchandising',p('M2 2v21M22 2v21M2 10h20M2 20h20M5 3h5v7H5zM14 5h5v5h-5zM6 14h5v6H6zM15 13h4v7h-4z'),line('M2 1v22M22 1v22M2 10h20M2 20h20'),r(5,3,5,6)+r(14,5,5,4)+r(6,14,5,5)+r(15,13,4,6));
a('Retail','returns','ecommerce product returns exchange',p('M3 6l9-5 9 5v12l-9 5-9-5zM3 6l9 5 9-5M12 11v12M6 15h9M6 15l3-3M6 15l3 3'),p('M2 6l10-6 10 6v13l-10 5-10-5z'),line('M3 6l9 5 9-5M12 11v12M6 15h9M6 15l3-3M6 15l3 3'));

// Finance, insurance and accounting
a('Finance','bank','finance banking institution savings',p('M1 7l11-6 11 6zM2 22h20M5 10v9M12 10v9M19 10v9')+c(12,5,1),p('M0 7l12-7 12 7zM1 21h22v3H1z'),r(4,9,3,11)+r(10.5,9,3,11)+r(17,9,3,11)+c(12,5,1));
a('Finance','calculator','accounting accountant finance estimate',r(4,1,16,22,1)+r(7,4,10,5)+p('M7 13h1M12 13h1M17 13v7M7 18h1M12 18h1'),r(3,1,18,22,1),r(7,4,10,5)+r(7,12,2,2)+r(11,12,2,2)+r(15,12,2,8)+r(7,18,2,2)+r(11,18,2,2));
a('Finance','piggy-bank','savings finance budget money',p('M5 8c-3-2-4 0-3 3-4 6 4 11 13 8l3 3v-5l3-3h2v-5h-4l-2-5-4 3M8 5V2h5M8 10h5')+c(17,10,1),p('M5 7c-5-2-6 2-3 5-2 8 6 11 13 8l4 3v-6l4-3V8h-4l-2-5-4 3z'),line('M8 4V1h5M8 10h5')+c(17,10,1.2));
a('Finance','safe','finance secure storage vault',r(2,2,20,20,2)+r(5,5,14,14)+c(12,12,4)+p('M12 8v8M8 12h8M4 22v1M20 22v1'),r(1,1,22,22,2),ring(12,12,4.5,2.5)+line('M12 8v8M8 12h8M4 23v1M20 23v1'),hole('M1 1h22v22H1zM4 4v16h16V4z')+ring(12,12,4.5,2.5)+line('M12 8v8M8 12h8'));
a('Finance','tax-report','accountant tax filing finance report',p('M4 1h16v22H4zM8 6h8M8 10h8M8 14h3M8 18h3M15 14l3 6')+c(15,15,1)+c(18,19,1),r(3,1,18,22),line('M8 6h8M8 10h8M8 14h3M8 18h3M15 14l3 6')+c(15,15,1)+c(18,19,1));
a('Finance','insurance','policy insurance protection coverage',p('M12 1l10 4v7c0 6-5 9-10 11C7 21 2 18 2 12V5zM5 12c0-8 14-8 14 0zM12 12v5c0 3 4 3 4 0'),p('M12 1l10 4v7c0 6-5 9-10 11C7 21 2 18 2 12V5z'),p('M5 12c0-8 14-8 14 0z')+line('M12 12v5c0 3 4 3 4 0'));
a('Finance','mortgage','home loan lending mortgage finance',p('M1 11L12 1l11 10M4 10v13h16V10M15 12c-7-3-9 4-3 4s5 7-3 4M12 10v12'),p('M0 11L12 0l12 11-2 2-10-9-10 9zM3 12h18v11H3z'),line('M15 12c-7-3-9 4-3 4s5 7-3 4M12 10v12'));
a('Finance','financial-contract','consulting agreement accounting contract',p('M3 1h17v22H3zM7 5h8M7 9h8M7 13h4M14 16l2 2 7-7M7 20h4'),r(2,1,19,22),line('M7 5h8M7 9h8M7 13h4M14 16l2 2 7-7M7 20h4'));

// Education, science and community organizations
a('Education','book-open','school education reading learning',p('M12 5C8 1 2 2 1 3v17c4-2 7-2 11 1 4-3 7-3 11-1V3c-4-2-7-1-11 2zM12 5v16M4 7h5M15 7h5'),p('M11 4C7 0 2 1 0 2v20c4-2 7-2 11 1z'),p('M13 4c4-4 9-3 11-2v20c-4-2-7-2-11 1z'));
a('Education','graduation-cap','university learning school graduate',p('M1 7l11-5 11 5-11 5zM5 10v7c4 5 10 5 14 0v-7M23 7v10'),p('M0 7l12-6 12 6-12 6z'),p('M4 12l8 4 8-4v6c-5 6-11 6-16 0z')+line('M23 9v9'));
a('Education','school','education classroom learning schoolhouse',p('M6 22V7l6-6 6 6v15M1 22V11h5M18 11h5v11M10 22v-6h4v6')+c(12,8,2),p('M5 7l7-7 7 7v16H5zM1 10h4v13H1zM19 10h4v13h-4z'),ring(12,8,2.5,1)+r(10,16,4,7));
a('Education','microscope','science laboratory education research',p('M8 1l7 4-4 8-7-4zM14 9c11 0 10 13-2 13H3M10 22v-5M2 14h11M5 17v-3'),p('M8 0l8 5-5 10-8-5z'),line('M16 9c10 2 7 14-4 14H2M10 22v-5M2 16h11'));
a('Education','atom','science education research physics',c(12,12,2)+p('M2 12c0-8 20-8 20 0S2 20 2 12M7 3c7-4 17 13 10 18S0 7 7 3M17 3C10-1 0 16 7 21S24 7 17 3'),c(12,12,3),line('M2 12c0-8 20-8 20 0S2 20 2 12M7 3c7-4 17 13 10 18S0 7 7 3M17 3C10-1 0 16 7 21S24 7 17 3'));
a('Education','puzzle','learning children problem solving community',p('M2 6h7c-3-6 9-6 6 0h7v5c-6-3-6 9 0 6v6H2v-6c6 3 6-9 0-6z'),p('M1 6h8c-3-6 9-6 6 0h8v5c-6-3-6 9 0 6v6H1z'),p('M1 11c8-4 8 10 0 6z'));
a('Education','chalkboard','teaching tutor classroom education',r(2,2,20,15,1)+p('M12 17v6M5 23l4-6M19 23l-4-6M6 6h8M6 10h11M16 14h4'),r(1,1,22,17,1),line('M12 19v4M5 23l4-5M19 23l-4-5M6 6h8M6 10h11')+r(16,14,4,2));
a('Education','certificate','training qualification award education',r(2,2,20,17,1)+p('M6 6h12M6 10h7M13 18l-1 5 4-2 4 2-1-5')+c(16,15,4),r(1,1,22,19,1),c(16,15,4.5)+p('M13 19l-1 5 4-2 4 2-1-5z')+line('M6 6h12M6 10h7'));

// Veterinary, pet care and animal businesses
a('Pets','paw','pet dog cat animal care',c(5,7,2.5)+c(10,4,2.5)+c(16,4,2.5)+c(21,8,2.5)+p('M5 18c0-8 14-8 14 0s-5 3-7 3-7 5-7-3z'),p('M4 18c0-10 16-10 16 0s-6 4-8 4-8 5-8-4z'),c(4,7,2.5)+c(10,4,2.5)+c(16,4,2.5)+c(21,8,2.5));
a('Pets','dog','pet canine grooming veterinary dog',p('M6 8L3 2l7 2h4l7-2-3 6v9c0 8-12 8-12 0zM8 11h1M15 11h1M10 16h4M12 16v4'),p('M5 8L2 1l8 2h4l8-2-3 7v9c0 9-14 9-14 0z'),c(8,11,1)+c(16,11,1)+p('M9 16h6l-3 4z'));
a('Pets','cat','pet feline cat veterinary boarding',p('M4 9V1l6 5h4l6-5v8c8 13-24 17-16 0zM7 12h1M16 12h1M10 16h4M1 15l5 1M23 15l-5 1'),p('M3 9V0l7 5h4l7-5v9c8 15-26 18-18 0z'),c(8,12,1)+c(16,12,1)+p('M10 16h4l-2 3z')+line('M1 15l5 1M23 15l-5 1'));
a('Pets','pet-bone','dog treat pet supply animal',p('M5 3C0 0-2 8 3 9l10 10c-3 5 5 7 6 2 5-1 3-9-2-6L7 5c1-5-4-5-2-2z'),p('M5 3C0 0-2 8 3 9l10 10c-3 5 5 7 6 2 5-1 3-9-2-6L7 5c1-5-4-5-2-2z'),line('M7 8l9 9'));
a('Pets','pet-collar','pet grooming accessory dog collar',p('M2 6h20v8H2zM8 6v8M15 14v4')+c(15,20,3),r(1,5,22,10,1),r(6,5,5,10)+ring(15,20,3,1.3)+line('M15 15v2'));
a('Pets','pet-bowl','pet feeding animal food bowl',p('M5 8h14l4 13H1zM2 18h20M8 4h1M15 4h1'),p('M4 7h16l4 15H0z'),line('M2 18h20')+c(8,3,1.5)+c(15,3,1.5));
a('Pets','veterinary','animal veterinary clinic healthcare',p('M8 1h8v7h7v8h-7v7H8v-7H1V8h7z')+c(10,10,1)+c(14,10,1)+p('M9 15c0-5 6-5 6 0z'),p('M7 1h10v6h6v10h-6v6H7v-6H1V7h6z'),c(9,10,1.5)+c(15,10,1.5)+p('M8 16c0-7 8-7 8 0z'));
a('Pets','aquarium','fish aquatic pet shop aquarium',p('M2 3h20v19H2zM2 8c5-4 15 4 20 0M7 15c3-4 6-4 8-1l4-3v8l-4-3c-2 3-5 3-8-1z'),r(1,2,22,21,1),line('M2 8c5-4 15 4 20 0')+p('M6 15c3-5 7-5 9-2l5-3v10l-5-3c-2 3-6 3-9-2z'));

// Weddings, events and venues
a('Events','balloons','party event celebration birthday',p('M11 7c0 9-10 9-10 0s10-8 10 0M6 14l-2 3h4zM6 17v6M23 8c0 9-10 9-10 0s10-8 10 0M18 15l-2 3h4zM18 18v5'),p('M12 7C12-3 0-3 0 7s12 10 12 0'),p('M24 8C24-2 12-2 12 8s12 10 12 0')+line('M6 15v8M18 16v7'));
a('Events','wedding-rings','wedding marriage jeweler event',c(8,15,7)+c(17,15,6)+p('M4 6l4-5 4 5-4 4z'),ring(8,15,8,5),ring(17,15,6.5,4.5)+p('M3 5l5-5 5 5-5 6z'));
a('Events','bouquet','wedding florist event flowers bouquet',p('M5 12l7 11 7-11zM12 16V5M8 15L4 8M16 15l4-7')+c(12,4,3)+c(4,6,3)+c(20,6,3),p('M4 11l8 13 8-13z'),c(12,4,3)+c(4,6,3)+c(20,6,3)+line('M12 15V8M9 14L5 9M15 14l4-5'));
a('Events','confetti','party event celebration launch',p('M1 23l6-17 10 10zM10 4l2-3M18 1v4M20 9h3M17 18l6 3M4 15l6 6M6 10l8 8'),p('M0 24L6 5l13 13z'),line('M10 4l2-3M18 1v4M20 9h3M17 18l6 3M4 15l6 6M6 10l8 8'));
a('Events','stage','venue theatre performance event',p('M1 3h22v20H1zM1 3l7 10-7 7M23 3l-7 10 7 7M1 20h22M8 3v5M16 3v5'),p('M0 2h24v22H0z'),p('M3 5h18l-6 8 6 6H3l6-6z')+line('M1 20h22'));
a('Events','spotlight','event production lighting stage',p('M4 2l9 4-4 9-9-4zM11 12l12-3v14zM6 14v9M2 23h9'),p('M4 1l10 5-5 10-9-5z'),p('M12 13l11-3v13z')+line('M6 17v6M2 23h9'));
a('Events','champagne','wedding celebration toast event drinks',p('M2 2h7v9c0 5-7 5-7 0zM5.5 15v8M2 23h7M15 2h7v9c0 5-7 5-7 0zM18.5 15v8M15 23h7M3 7h5M16 7h5'),p('M1 1h9v10c0 7-9 7-9 0zM14 1h9v10c0 7-9 7-9 0z'),line('M5.5 17v6M2 23h7M18.5 17v6M15 23h7M3 7h5M16 7h5'));
a('Events','wedding-arch','wedding venue ceremony floral arch',p('M3 23V10c0-12 18-12 18 0v13M7 23V10c0-7 10-7 10 0v13M1 23h8M15 23h8')+c(5,9,2)+c(19,9,2),p('M2 23V10c0-13 20-13 20 0v13h-4V10c0-8-12-8-12 0v13z'),c(4,9,2.5)+c(20,9,2.5)+line('M1 23h8M15 23h8'));

// Automotive service and repair
a('Automotive','piston','engine auto mechanic automotive',p('M5 2h14v8H5zM5 5h14M10 10v8h4v-8')+c(12,20,3),r(4,1,16,10),p('M9 11h6v8H9z')+ring(12,20,3,1.2)+line('M5 5h14'));
a('Automotive','tire','tyre auto wheel mechanic',c(12,12,10)+c(12,12,5)+p('M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3'),ring(12,12,11,6),ring(12,12,5,2)+line('M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3'));
a('Automotive','engine','auto mechanic engine motor repair',p('M4 7h6V3h7v4h4v13H4v-5H1V9h3zM7 2h13M8 10l3 4 3-4 3 4M21 10h2v7h-2'),p('M3 6h6V3h9v3h4v15H3v-5H0V8h3z'),line('M7 1h13M8 10l3 4 3-4 3 4')+r(22,9,2,9));
a('Automotive','car-battery','automotive battery starting power',r(2,6,20,17,1)+p('M5 6V2h4v4M15 6V2h4v4M6 13h4M8 11v4M15 13h4'),r(1,5,22,18,1),r(4,1,6,3)+r(14,1,6,3)+line('M6 13h4M8 11v4M15 13h4'));
a('Automotive','car-lift','automotive workshop mechanic inspection',p('M3 1v22M21 1v22M3 17h18M6 14V8l2-5h8l2 5v6H6zM6 9h12M8 12h1M15 12h1'),line('M2 1v22M22 1v22M2 18h20'),p('M5 14V8l3-6h8l3 6v6z')+line('M6 9h12'));
a('Automotive','steering-wheel','automotive driving steering',c(12,12,10)+c(12,12,3)+p('M2 10l7 2M22 10l-7 2M12 15v7'),ring(12,12,11,8.5),c(12,12,3.5)+line('M3 10l5 2M21 10l-5 2M12 16v6'));
a('Automotive','oil-can','auto service lubrication oil change',p('M3 9h12v12H3zM6 9V5h6v4M15 11l7-5v6l-7 5M3 11c-4 0-4 6 0 6M21 16c-3 4-3 6 0 6s3-2 0-6'),r(2,8,14,14,1),p('M16 11l7-7v9l-7 5zM21 16c-4 5-4 7 0 7s4-2 0-7')+line('M6 7V4h6v3'));
a('Automotive','brake-disc','auto brakes mechanic rotor service',c(11,12,10)+c(11,12,4)+p('M18 4h5v16h-5zM6 5l1 2M3 11h2M5 18l2-1M11 20v-2'),ring(11,12,10,5),r(18,3,5,18,1)+line('M6 5l1 2M3 11h2M5 18l2-1M11 20v-2'));

// Agriculture and rural businesses
a('Agriculture','barn','farm agriculture rural barn',p('M1 10l11-9 11 9M3 9v14h18V9M7 23V12h10v11M7 12l10 11M17 12L7 23'),p('M0 10L12 0l12 10-2 2-10-8-10 8zM2 11h20v12H2z'),line('M7 23V12h10v11M7 12l10 11M17 12L7 23'));
a('Agriculture','tractor','farm agriculture tractor equipment',p('M4 15V3h10v15M5 3V1h8M14 12h6v8M17 12V6h3')+c(6,19,4)+c(19,21,2),p('M3 2h12v9h6v10H3z'),ring(6,19,4.5,2)+ring(19,21,2.5,1)+line('M17 10V5h3'));
a('Agriculture','wheat','grain farm agriculture harvest',p('M12 23V2M12 6C4 6 5 1 5 1s7-1 7 5M12 11c-8 0-7-5-7-5s7-1 7 5M12 16c-8 0-7-5-7-5s7-1 7 5M12 9c8 0 7-5 7-5s-7-1-7 5M12 14c8 0 7-5 7-5s-7-1-7 5M12 19c8 0 7-5 7-5s-7-1-7 5'),line('M12 23V1'),p('M11 6C3 6 4 1 4 1s7-1 7 5M11 12c-8 0-7-5-7-5s7-1 7 5M11 18c-8 0-7-5-7-5s7-1 7 5M13 9c8 0 7-5 7-5s-7-1-7 5M13 15c8 0 7-5 7-5s-7-1-7 5M13 21c8 0 7-5 7-5s-7-1-7 5'));
a('Agriculture','apple','orchard fruit farm produce',p('M12 8C-4-3 0 28 12 22 24 28 28-3 12 8M12 8V3M12 4c0-5 8-3 8-3s0 6-8 3'),p('M12 8C-4-3 0 28 12 22 24 28 28-3 12 8'),p('M12 4c0-5 8-3 8-3s0 6-8 3')+line('M12 7V3'));
a('Agriculture','seedling','plants nursery farm growth agriculture',p('M12 23V9M12 12C1 13 1 4 1 4s11-1 11 8M12 17c11 1 11-8 11-8s-11-1-11 8M6 23h12'),line('M12 23V9M6 23h12'),p('M11 12C0 13 0 3 0 3s11-1 11 9M13 17c11 1 11-9 11-9s-11-1-11 9'));
a('Agriculture','beehive','apiary honey bees farm',p('M3 20c0-4 18-4 18 0v3H3zM5 16c0-4 14-4 14 0M7 12c0-4 10-4 10 0M9 8c0-5 6-5 6 0M3 20h18M8 23v-4h8v4'),p('M2 20c0-4 2-4 3-5 0-4 2-4 3-5 0-6 8-6 8 0 1 1 3 1 3 5 1 1 3 1 3 5v3H2z'),line('M5 16h14M7 12h10M9 8h6')+r(9,19,6,4,2));
a('Agriculture','chicken','poultry farm agriculture animal',p('M7 8c-6-5-8 2-4 5-3 11 17 12 17 0l3-3-5-1c-1-5-5-6-6-1M8 21v2M15 21v2M14 5l1-3 3 3'),p('M7 8c-6-5-8 2-4 5-3 11 17 12 17 0l3-3-5-1c-1-5-5-6-6-1z'),p('M13 5l2-4 4 4z')+c(16,8,1)+line('M8 21v2M15 21v2'));
a('Agriculture','produce-basket','farm market produce grocery harvest',p('M1 12h22l-4 11H5zM5 12l4-10M19 12L15 2M8 16v4M16 16v4M12 16v4')+c(6,9,3)+c(16,8,4),p('M0 11h24l-5 13H5z'),c(6,8,3)+c(16,7,4)+line('M5 10L9 1M19 10l-4-9M8 16v4M16 16v4M12 16v4'));

// Sports, recreation and fitness
a('Sports','soccer-ball','football soccer sport recreation',c(12,12,10)+p('M12 7l5 4-2 6H9l-2-6zM12 7V2M17 11l5-2M15 17l3 4M9 17l-3 4M7 11L2 9'),c(12,12,10),p('M12 7l5 4-2 6H9l-2-6z')+line('M12 7V2M17 11l5-2M15 17l3 4M9 17l-3 4M7 11L2 9'));
a('Sports','basketball','basketball sport recreation court',c(12,12,10)+p('M2 12h20M12 2v20M4 5c10 2 10 12 16 14M20 5C10 7 10 17 4 19'),c(12,12,10),line('M2 12h20M12 2v20M4 5c10 2 10 12 16 14M20 5C10 7 10 17 4 19'));
a('Sports','tennis','racket racquet sport tennis',p('M7 16C-5 8 11-7 19 3S15 24 7 16zM7 16l-6 7M6 5l11 11M3 9l10 10M10 2l11 10M5 14L16 3'),p('M7 16C-5 8 11-7 19 3S15 24 7 16z'),line('M7 16l-6 7M6 5l11 11M3 9l10 10M10 2l11 10M5 14L16 3'),line('M7 16C-5 8 11-7 19 3S15 24 7 16zM7 16l-6 7M6 5l11 11M3 9l10 10M10 2l11 10M5 14L16 3'));
a('Sports','golf','golf course sport recreation',p('M7 23V1l14 5-14 5M2 23h15M19 20h.1'),p('M8 1l15 5-15 6z'),line('M7 1v22M2 23h15')+c(20,20,2));
a('Sports','swimming','pool swim leisure sports',p('M1 20c4-4 7 4 11 0s7 4 11 0M2 14l7-7 9 6M9 7l5-5 4 3')+c(20,10,2),p('M1 14l8-8 10 8-4 3-6-6-5 6z'),c(20,10,2.5)+line('M1 21c4-4 7 4 11 0s7 4 11 0M10 6l4-4 4 3'));
a('Sports','runner','running athletics fitness trainer',c(16,3,2)+p('M3 9l6-3 7 6 6 1M11 8l-5 7 6 2-1 6M6 15l-4 6M16 12l-3 4'),c(16,3,2.5)+p('M9 5l7 6-3 5-7-1-3 6-3-1 6-9 4-3-1-1-5 3-2-2z'),line('M14 12l8 1M8 15l5 2-1 6'));
a('Sports','weightlifting','fitness gym strength personal trainer',p('M1 6h22M3 2v8M21 2v8M7 6v7h10V6M12 13v5M6 23l6-5 6 5')+c(12,9,2),line('M1 6h22M7 6v7h10V6M12 13v5M6 23l6-5 6 5'),r(2,1,3,10)+r(19,1,3,10)+c(12,9,2));
a('Sports','hiking','outdoor adventure hiking recreation',c(14,3,2)+p('M10 7l5 2 3 5M11 8l-3 8 5 2-2 5M8 16l-4 7M18 9v14M6 7l-2 7 4 1'),p('M10 6l6 2-5 8 3 2-2 5H9l1-4-4-2z'),c(14,3,2.5)+line('M15 9l3 5M18 9v14M8 17l-4 6M6 7l-2 7'));

// Security and fire protection
a('Security','cctv','surveillance camera security monitoring',p('M1 4h17l5 5-4 6-18-5zM10 13v6h8M18 16v6M18 5l-3 8'),p('M0 3h18l6 6-5 7L0 10z'),line('M10 14v5h8M18 16v6M18 5l-3 8'));
a('Security','alarm','security intrusion alarm warning',p('M5 19V9a7 7 0 0 1 14 0v10M2 19h20v4H2zM12 5v7M1 3l3 2M23 3l-3 2'),p('M4 19V9a8 8 0 0 1 16 0v10z'),r(1,19,22,4)+line('M12 5v7M1 3l3 2M23 3l-3 2'));
a('Security','fingerprint','biometric security identity access',p('M2 11c0-13 20-13 20 0M5 14v-3c0-9 14-9 14 0v5M8 19v-8c0-5 8-5 8 0v9M12 9v14M3 17v3M20 20v2'),line('M2 11c0-13 20-13 20 0M5 14v-3c0-9 14-9 14 0v5'),line('M8 19v-8c0-5 8-5 8 0v9M12 9v14M3 17v3M20 20v2'));
a('Security','security-badge','guard security verified personnel',p('M12 1l4 4h6l-1 9-9 9-9-9L2 5h6zM12 7l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z'),p('M12 0l4 4h7l-1 11-10 9L2 15 1 4h7z'),p('M12 6l2 4h5l-4 4 1 5-4-3-4 3 1-5-4-4h5z'));
a('Security','fire-extinguisher','fire safety protection extinguisher',r(5,9,12,14,2)+p('M9 9V4h5v5M9 4V1h9M14 4h7v9M21 9h2v6h-2M8 15h6M8 18h6'),r(4,8,14,15,2),r(8,3,7,5)+line('M9 2V1h9M15 4h6v4M8 15h6M8 18h6')+r(20,8,3,8));
a('Security','access-card','security access identity card entry',r(1,5,22,15,1)+p('M5 9h4v5H5zM13 10h6M13 14h6M5 17h4'),r(1,4,22,17,1),r(5,8,4,6)+line('M13 10h6M13 14h6M5 17h4'));
a('Security','doorbell','smart security doorbell home access',r(7,1,10,22,3)+c(12,6,2)+c(12,16,3),r(6,1,12,22,3),ring(12,6,2.5,1)+ring(12,16,3.5,1.8));
a('Security','security-house','home security burglary protection alarm',p('M1 10L12 1l11 9M4 10v13h16V10M12 10l5 2v4c0 3-3 5-5 6-2-1-5-3-5-6v-4z'),p('M0 10L12 0l12 10-2 2-10-8-10 8zM3 12h18v11H3z'),p('M12 9l6 3v4c0 3-3 6-6 7-3-1-6-4-6-7v-4z'));

// Logistics, warehousing and moving
a('Logistics','forklift','warehouse logistics lifting forklift',p('M2 13h10v7H2zM5 13V3h7v10M16 2v18h7M12 15h4M5 5h7')+c(5,21,2)+c(11,21,2),r(1,12,12,9,1),line('M5 11V2h8v9M16 1v20h7M13 15h3')+c(5,21,2)+c(11,21,2));
a('Logistics','pallet','warehouse freight storage pallet',p('M1 17h22v6H1zM4 17V2h16v15M4 10h16M12 2v15M5 20h2M17 20h2'),r(3,1,18,16),p('M0 18h24v6H0z')+line('M4 10h16M12 2v15M4 21h4M16 21h4'));
a('Logistics','dolly','moving handtruck delivery removals',p('M4 1h3v18h15M7 6h13v12H7zM13 6v12M7 19l-3 4')+c(9,21,2),r(8,5,13,13,1),line('M3 1h3v19h17M13 6v11')+ring(9,21,2,1));
a('Logistics','warehouse','logistics storage distribution warehouse',p('M1 8l11-7 11 7v15H1zM5 23V11h14v12M5 15h14M5 19h14'),p('M0 8l12-8 12 8v16H0z'),line('M5 23V11h14v12M5 15h14M5 19h14'));
a('Logistics','delivery-van','courier moving logistics delivery',p('M1 5h15l7 8v8H1zM16 5v8h7M3 9h8M3 13h8')+c(5,21,2)+c(19,21,2),p('M0 4h16l8 9v9H0z'),c(5,21,2.5)+c(19,21,2.5)+line('M16 5v8h7M3 9h8M3 13h8'));
a('Logistics','shipping-container','freight logistics shipping container',r(1,4,22,17)+p('M5 7v11M10 7v11M15 7v11M20 7v11M1 2v3M23 2v3M1 20v3M23 20v3'),r(1,3,22,19),line('M5 7v11M10 7v11M15 7v11M20 7v11M1 2v3M23 2v3M1 20v3M23 20v3'));
a('Logistics','crane','construction logistics lifting crane',p('M7 23V1h5v22M1 6h22M7 1L1 6M12 1l11 5M20 6v10c0 4-4 4-4 0M4 23h11M7 11l5 5-5 5'),p('M6 1h7v23H6z'),line('M1 6h22M7 1L1 6M12 1l11 5M20 6v10c0 4-4 4-4 0M3 23h13M7 11l5 5-5 5'));
a('Logistics','courier','delivery shipping courier parcel',p('M2 9h13v14H2zM2 9l6-4 7 4M8 9v14M16 5h7M18 10h5M18 15h5M1 1h13'),p('M1 9l7-5 8 5v14H1z'),line('M2 9h13M8 9v14M17 5h6M19 10h4M19 15h4M1 1h13'));

// Filled housings retain meaningful negative space. Duotone keeps its separately
// authored body/detail layers; these masters avoid black-on-black lost details.
const frame = (x: number, y: number, w: number, h: number, t = 2) => hole(`M${x} ${y}h${w}v${h}h-${w}zM${x+t} ${y+t}v${h-2*t}h${w-2*t}v-${h-2*t}z`);
const shieldFrame = hole('M12 1l10 4v7c0 6-5 9-10 11C7 21 2 18 2 12V5zM4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3z');
const homeFrame = p('M0 11L12 0l12 11-2 2-10-9-10 9zM3 12h3v8h12v-8h3v11H3z');
const solidMasters: Record<string, string> = {
  'ev-charger': hole('M2 1h14v22H2zM6 5v6h6V5z')+p('M9 13l-4 5h4l-1 3 5-6H9z')+line('M17 6h2l3 5v7c0 5-5 5-5 0v-3'),
  'water-heater': hole('M4 7c0-6 16-6 16 0v11c0 6-16 6-16 0zM8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0')+line('M12 10v4M8 2V1M16 2V1M8 22v1M16 22v1'),
  'air-conditioner': hole('M1 3h22v13H1zM4 10v3h16v-3zM17 6v2h3V6z')+line('M7 18v4M12 18v3M17 18v4'),
  'heat-pump': hole('M1 2h22v19H1zM3 11a7 7 0 1 0 14 0 7 7 0 1 0-14 0M18 6v2h3V6zM18 10v2h3v-2zM18 14v2h3v-2z')+c(10,11,2)+line('M10 7v8M6 11h8M5 21v2M19 21v2'),
  thermostat: frame(2,1,20,22)+ring(12,10,5,3)+line('M12 10l2-2M8 18h8'),
  'roof-tiles': hole('M1 15L12 1l11 14v9H1zM5 11v2h14v-2zM8 7v2h8V7zM2 15v2h20v-2zM11 3v19h2V3zM6 17v5h2v-5zM16 17v5h2v-5z'),
  shingles: hole('M1 2h22v20H1zM2 8v2h20V8zM2 14v2h20v-2zM7 3v5h2V3zM15 3v5h2V3zM5 10v4h2v-4zM13 10v4h2v-4zM9 16v5h2v-5zM17 16v5h2v-5z'),
  siding: hole('M1 5l11-5 11 5v18H1zM3 6v2h18V6zM3 10v2h18v-2zM3 14v2h18v-2zM3 18v2h18v-2z'),
  'brick-wall': hole('M1 3h22v19H1zM2 9v2h20V9zM2 15v2h20v-2zM7 4v5h2V4zM15 4v5h2V4zM5 11v4h2v-4zM13 11v4h2v-4zM9 17v4h2v-4z'),
  blueprint: frame(3,1,18,22)+line('M7 5h10v6h-5v7H7zM12 11h5v7M1 20h4'),
  drywall: frame(1,1,15,22)+frame(17,8,6,15,1.5)+c(6,7,1)+c(6,17,1)+c(12,7,1)+c(12,17,1),
  laundry: hole('M2 1h20v22H2zM5 14a7 7 0 1 0 14 0 7 7 0 1 0-14 0M5 4v2h3V4zM16 4v2h3V4z')+line('M8 14c3-3 5 3 8 0'),
  'landscape-plan': frame(1,2,22,21)+line('M2 16c7-7 13 7 20 0M10 3v9M10 12h12')+c(6,8,2)+c(17,7,2),
  apartments: hole('M1 6h10v17H1zM4 10v3h3v-3zM4 16v3h3v-3zM12 1h11v22H12zM15 5v3h4V5zM15 10v3h4v-3zM15 16v3h4v-3z'),
  'house-check': homeFrame+line('M8 14l3 3 6-7'),
  'property-deed': frame(3,1,18,22)+line('M7 8l5-4 5 4M8 8v5h8V8M8 18h8'),
  'law-book': frame(3,1,18,17)+r(3,20,18,3)+line('M7 6h10M12 6v8M8 12h8M2 3v18'),
  justice: shieldFrame+line('M12 6v12M7 9h10M7 9l-2 5h4zM17 9l-2 5h4z'),
  'estate-plan': frame(3,1,18,22)+line('M7 7h10M7 11h10M7 15h4M14 16l2 2 4-4M7 20h5'),
  hospital: hole('M6 1h12v22H6zM11 3h2v2h3v2h-3v2h-2V7H8V5h3zM10 16v7h4v-7z')+r(1,8,4,15)+r(19,8,4,15),
  ultrasound: frame(2,1,20,17)+line('M8 23h8M12 18v5M6 13l6-7 6 7M6 13c4 3 8 3 12 0')+c(12,11,1.5),
  brain: hole('M12 4C6-3 1 5 4 8-2 11 2 18 6 17c0 7 6 7 6 2 0 5 6 5 6-2 4 1 8-6 2-9 3-3-2-11-8-4zM11 4v16h2V4z'),
  'home-care': homeFrame+p('M12 19c-9-6-3-10 0-5 3-5 9-1 0 5z'),
  'pill-organizer': frame(1,5,22,18)+r(1,10,22,3)+r(6,5,2,18)+r(11,5,2,18)+r(16,5,2,18)+r(7,1,10,2),
  facial: hole('M4 4c0-5 16-5 16 0v10c0 5-5 10-8 10s-8-5-8-10zM7 8v2h4V8zM13 8v2h4V8zM11 11v4h2v-4zM9 17v2h6v-2z'),
  'screen-repair': frame(1,1,22,18)+line('M12 19v4M7 23h10M9 2l4 6-5 3 7 7M13 8h5'),
  'phone-repair': frame(5,1,14,22)+line('M10 2l4 6-5 3 6 7M10 20h4'),
  'battery-replace': frame(6,4,12,19)+r(9,1,6,2)+line('M2 8V3h3M22 16v5h-3M10 12h4M12 10v4'),
  'hard-drive': frame(2,1,20,22)+ring(12,11,6,3)+line('M6 18l7-8')+c(7,20,1)+c(17,20,1),
  diagnostics: frame(2,1,20,22)+line('M6 12h3l2-5 3 10 2-5h2')+c(7,4,1)+c(17,4,1),
  'cloud-code': hole('M5 20C-4 20-1 6 6 8 10-5 25 3 21 11c5 2 3 9-2 9zM9 10l-4 5 4 4 1-2-2-2 2-3zM15 10l4 5-4 4-1-2 2-2-2-3z'),
  subscription: frame(2,2,20,20)+line('M3 8h18M8 12c4-4 9 1 6 5M16 13v4h-4')+c(7,17,1),
  dashboard: frame(1,2,22,20)+r(2,7,20,2)+r(8,8,2,13)+r(12,13,2,5)+r(16,11,2,7)+r(20,14,2,4)+c(4,5,1),
  bug: hole('M6 7h12v10c0 9-12 9-12 0zM11 9v13h2V9z')+line('M9 6V3h6v3M4 2l4 3M20 2l-4 3M1 11h4M19 11h4M1 18h4M19 18h4'),
  'vector-pen': hole('M12 1l9 14-9 9-9-9zM9 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M11 2v9h2V2z'),
  storyboard: frame(1,2,22,20)+r(1,11,22,2)+r(11,2,2,20)+line('M5 9l3-3 2 3')+p('M15 15l5 3-5 2z'),
  'brand-mark': hole('M12 0l11 7v10l-11 7L1 17V7zM3 8v8l9 5 9-5V8l-9-5z')+line('M7 17V7l10 10V7'),
  croissant: hole('M0 17L5 6l7-4 7 4 5 11-7 6-5-3-5 3zM5 8l4 12 2-1-4-12zM17 7l-4 12 2 1 4-12zM11 3v15h2V3z'),
  sushi: hole('M2 8c0-9 20-9 20 0v10c0 8-20 8-20 0zM5 8c0 5 14 5 14 0S5 3 5 8')+c(12,8,2),
  taco: hole('M1 20C1-4 23-4 23 20zM4 11l4 3 4-4 4 4 4-3-1-2-3 2-4-4-4 4-3-2zM3 18v2c7-4 11-4 18 0v-2c-7-4-11-4-18 0'),
  'restaurant-menu': frame(2,1,20,22)+line('M7 6h10M7 10h4M7 14h4M7 18h4')+c(17,10,1)+c(17,14,1)+c(17,18,1),
  hanger: hole('M1 19l11-10 11 10v4H1zM4 20h16l-8-7z')+line('M9 5c0-6 8-5 6 0l-3 3'),
  'cash-register': hole('M4 9h16l4 10v5H0V19zM5 19v2h14v-2zM6 13v2h3v-2zM11 13v2h3v-2zM16 13v2h3v-2zM6 1h12v8H6zM8 3v4h8V3z'),
  returns: hole('M2 6l10-6 10 6v13l-10 5-10-5zM4 7v10l8 4 8-4V7l-8 4z')+line('M6 15h9M6 15l3-3M6 15l3 3'),
  calculator: hole('M3 1h18v22H3zM7 4v5h10V4zM7 12v2h2v-2zM11 12v2h2v-2zM15 12v8h2v-8zM7 18v2h2v-2zM11 18v2h2v-2z'),
  'tax-report': frame(3,1,18,22)+line('M8 6h8M8 10h8M8 14h3M8 18h3M15 14l3 6')+c(15,15,1)+c(18,19,1),
  insurance: shieldFrame+p('M5 12c0-8 14-8 14 0z')+line('M12 12v5c0 3 4 3 4 0'),
  mortgage: homeFrame+line('M15 12c-7-3-9 4-3 4s5 7-3 4M12 10v12'),
  'financial-contract': frame(2,1,19,22)+line('M7 5h8M7 9h8M7 13h4M14 16l2 2 7-7M7 20h4'),
  school: hole('M5 7l7-7 7 7v16H5zM9 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0M10 16v7h4v-7z')+r(1,10,4,13)+r(19,10,4,13),
  chalkboard: frame(1,1,22,17)+line('M12 19v4M5 23l4-5M19 23l-4-5M6 6h8M6 10h11')+r(16,14,4,2),
  certificate: frame(1,1,22,19)+c(16,15,4.5)+p('M13 19l-1 5 4-2 4 2-1-5z')+line('M6 6h12M6 10h7'),
  dog: hole('M5 8L2 1l8 2h4l8-2-3 7v9c0 9-14 9-14 0zM7 10v2h3v-2zM14 10v2h3v-2zM9 16h6l-3 4z'),
  cat: hole('M3 9V0l7 5h4l7-5v9c8 15-26 18-18 0zM7 11v2h3v-2zM14 11v2h3v-2zM10 16h4l-2 3z')+line('M1 15l5 1M23 15l-5 1'),
  veterinary: hole('M7 1h10v6h6v10h-6v6H7v-6H1V7h6zM7.5 10a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M13.5 10a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M8 16c0-7 8-7 8 0z'),
  aquarium: frame(1,2,22,21)+line('M2 8c5-4 15 4 20 0')+p('M6 15c3-5 7-5 9-2l5-3v10l-5-3c-2 3-6 3-9-2z'),
  stage: hole('M0 2h24v22H0zM3 5l6 8-6 6h18l-6-6 6-8z'),
  'car-battery': hole('M1 5h22v18H1zM7 10h2v2h2v2H9v2H7v-2H5v-2h2zM15 12v2h4v-2z')+r(4,1,6,3)+r(14,1,6,3),
  'car-lift': line('M2 1v22M22 1v22M2 18h20')+hole('M5 14V8l3-6h8l3 6v6zM9 4L7 8h10l-2-4z'),
  barn: homeFrame+line('M7 23V12h10v11M7 12l10 11M17 12L7 23'),
  tractor: hole('M3 2h12v9h6v10H3zM6 5v6h6V5zM3 19a3 3 0 1 0 6 0 3 3 0 1 0-6 0')+ring(6,19,4.5,2)+ring(19,21,2.5,1)+line('M17 10V5h3'),
  beehive: hole('M2 20c0-4 2-4 3-5 0-4 2-4 3-5 0-6 8-6 8 0 1 1 3 1 3 5 1 1 3 1 3 5v3H2zM5 15v2h14v-2zM7 11v2h10v-2zM9 7v2h6V7zM9 19v4h6v-4z'),
  'soccer-ball': ring(12,12,10,8)+p('M12 7l5 4-2 6H9l-2-6z')+line('M12 7V2M17 11l5-2M15 17l3 4M9 17l-3 4M7 11L2 9'),
  basketball: ring(12,12,10,8)+line('M2 12h20M12 2v20M4 5c10 2 10 12 16 14M20 5C10 7 10 17 4 19'),
  'security-badge': hole('M12 0l4 4h7l-1 11-10 9L2 15 1 4h7zM12 6l2 4h5l-4 4 1 5-4-3-4 3 1-5-4-4h5z'),
  'access-card': frame(1,4,22,17)+r(5,8,4,6)+line('M13 10h6M13 14h6M5 17h4'),
  doorbell: hole('M6 1h12v22H6zM9.5 6a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M8.5 16a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0'),
  'security-house': homeFrame+p('M12 9l6 3v4c0 3-3 6-6 7-3-1-6-4-6-7v-4z'),
  pallet: frame(3,1,18,16)+r(3,8,18,3)+r(11,1,2,16)+hole('M0 18h24v6H0zM4 20v2h4v-2zM16 20v2h4v-2z'),
  warehouse: hole('M0 8l12-8 12 8v16H0zM5 11v12h14V11z')+r(5,14,14,2)+r(5,18,14,2),
  'shipping-container': frame(1,3,22,19)+r(4,7,2,11)+r(9,7,2,11)+r(14,7,2,11)+r(19,7,2,11),
};
for (const entry of entries) if (solidMasters[entry.name]) entry.solid = solidMasters[entry.name]!;
export const industryIcons: readonly IconDefinition[] = entries;
