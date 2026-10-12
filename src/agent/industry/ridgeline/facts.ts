export const BUSINESS={
  name:'Ridgeline Exterior Co.',
  id:'construction-ridgeline-exteriors',
  status:'Illustrative demonstration company. Not a licensed contractor, and not offering local coverage.',
  area:'An example Hill Country list, not a service-area promise.',
  phone:'(000) 555-0148',
  email:'hello@ridgeline.example',
  hours:'Example office hours: Monday–Friday, 8:00–17:00 Central Time.',
  zone:'America/Chicago',
  zoneLabel:'Central Time (America/Chicago)',
  editorialDate:'12 September 2026'
};
export const TOWNS=['Dripping Springs','Wimberley','Blanco','Johnson City','Fredericksburg','Kerrville','Other / ask about location'];
export const SERVICES=['Roofing','Gutters','Siding','Windows','Masonry'] as const;
export const TIMELINES=['This week','Next week','Within two weeks','Within a month','Exploratory interest'] as const;
export const TEAM=[
  {id:'avery',name:'Avery Cole',role:'Owner and estimator',photo:'ridge-portrait-avery',copy:'Avery leads the demonstration inspection and turns observations into a written scope. The role in this example is to separate what was seen, what is still unknown, and which options a homeowner can compare. Avery does not appear here as a licensed inspector or a public adjuster.'},
  {id:'morgan',name:'Morgan Lee',role:'Project coordinator',photo:'ridge-portrait-morgan',copy:'Morgan is the named contact in the demonstration. The coordinator keeps dates, access notes and open questions in one record, and tells the homeowner when a discovery changes the scope. Response time in this demo is not a guarantee.'},
  {id:'jordan',name:'Jordan Ellis',role:'Installation lead',photo:'ridge-portrait-jordan',copy:'Jordan’s example responsibility is the work sequence: protection, installation checks and the cleanup walk. The lead follows the written scope and flags conditions that were not visible at the first visit.'},
  {id:'taylor',name:'Taylor Reed',role:'Exterior specialist',photo:'ridge-portrait-taylor',copy:'Taylor connects roof edges, walls, openings and masonry in the demonstration. The specialist helps explain how one material meets another, and when a condition belongs with a different trade.'}
];
export const STORIES=[
  {id:'rowan',name:'Rowan Hale',context:'Roofing · illustrative scenario',quote:'The useful part was seeing the south slope and the chimney flashing named separately, instead of one vague recommendation to replace everything.',service:'Roofing'},
  {id:'camille',name:'Camille Ortiz',context:'Gutters · illustrative scenario',quote:'I could follow where the water was supposed to go, and the sketch showed the downspout still dumping against the foundation planting.',service:'Gutters'},
  {id:'helen',name:'Helen Brooks',context:'Siding · illustrative scenario',quote:'We talked through fiber cement and the trim at the window before anyone treated a color as the decision. The elevation notes made the damaged boards specific.',service:'Siding'}
];
export const PROJECTS={
  cedar:{name:'Cedar Bend',material:'Architectural shingles on a limestone ranch',kind:'Roof renewal demonstration',service:'roofing'},
  eave:{name:'Cedar Bend east eave',material:'Seamless gutter and downspout',kind:'Drainage demonstration',service:'gutters'},
  oak:{name:'Oak Shade',material:'Fiber-cement lap siding',kind:'Cladding demonstration',service:'siding'},
  window:{name:'Cedar Bend south window',material:'Double-hung replacement study',kind:'Opening demonstration',service:'windows'},
  chimney:{name:'Cedar Bend chimney',material:'Flashing and mortar joint study',kind:'Masonry interface demonstration',service:'masonry'}
};
