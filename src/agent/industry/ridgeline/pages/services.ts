import {photo,compare,ridgeAsset} from '../photo.ts';
import {junctionDiagram,drainageDiagram,wallDiagram,windowOps} from '../diagrams.ts';
import {TEAM} from '../facts.ts';

const person=(id:string)=>TEAM.find(member=>member.id===id)!;
const profile=(id:string)=>`<article>${photo(person(id).photo,person(id).name+' , generated portrait.',{ratio:'3/4'})}<h3>${person(id).name}</h3><p>${person(id).role}. ${person(id).copy}</p></article>`;

export const servicesHtml=`
<section class="wrap">
  <p class="eyebrow">Services</p>
  <h1>Look at the whole exterior.</h1>
  <p class="lede">Water does not stop at the shingles. It crosses flashings, gutters, walls and the joints around windows and masonry. This directory is a way to choose which condition to inspect first.</p>
  <nav class="index" aria-label="Services on this page"><a href="#roofing">Roofing</a><a href="#gutters">Gutters</a><a href="#siding">Siding</a><a href="#windows">Windows</a><a href="#masonry">Masonry</a></nav>
</section>
<section class="wrap service-row" id="roofing">
  <div>${photo('ridge-cedar-elevation','Cedar Bend, the roofing subject for this directory.')}</div>
  <div class="copy">
    <h2>Roofing</h2>
    <p>A roof estimate starts with what the covering is doing at its edges and penetrations, not with a price per square pulled from a photograph. At Cedar Bend the demonstration looks at shingle wear, chimney metal and whether a repair can stay local. The same visit can name a full renewal if the field and the details are both tired, without pretending every crew installs every commercial system.</p>
    <ul><li>Record the covering and the visible deck concerns.</li><li>Separate a leak repair from a replacement scope.</li><li>Note drainage at the eaves that serve the roof.</li><li>List exclusions before anyone treats a number as final.</li></ul>
    <p>Inspection questions: where does water show up inside, which slope faces the weather, and has the ceiling stain changed after rain? <a class="action" href="@roofing">Open roofing</a> <a href="@contact" data-ridge-service="Roofing">Plan a roofing inspection</a></p>
    <div class="pair">${photo('ridge-shingle-detail','Shingle and flashing detail.',{ratio:'1/1'})}${photo('ridge-flashing','Chimney flashing detail.',{ratio:'1/1'})}</div>
  </div>
</section>
<section class="wrap service-row flip" id="gutters">
  <div class="copy">
    <h2>Gutters</h2>
    <p>Gutters are a route, not a trim color. The east eave study shows a run that either carries water past the wall or lets it fall against the limestone. Guards, larger capacity and open gutters ask different maintenance questions. None of them is maintenance-free. The directory asks where the downspout ends before it talks about a finish.</p>
    <ul><li>Trace overflow marks and sagging runs.</li><li>Check joints, fascia and obvious obstructions.</li><li>Follow each downspout to its discharge.</li><li>Write access and cleanup into the scope.</li></ul>
    <p>Questions: does water sheet over the edge in heavy rain, is the bed stained under the eave, and where does the lowest outlet point? <a class="action" href="@gutters">Open gutters</a> <a href="@contact" data-ridge-service="Gutters">Plan a gutter inspection</a></p>
  </div>
  <div>${photo('ridge-gutter-after','Gutter and downspout on the limestone eave.')}${photo('ridge-gutter-before','The same eave before the demonstration replacement.',{ratio:'16/7'})}</div>
</section>
<section class="wrap" id="siding">
  <div class="band">
    <h2>Siding</h2>
    <p>Oak Shade is a wall story. The elevation shows fiber-cement laps and the trim that has to meet windows and soffits. A partial repair and a full reclad answer different questions about moisture behind the boards. Finish samples change a labeled swatch on the siding page; they do not recolor the whole house photograph, because this demo does not have a valid recolored elevation.</p>
    <ul><li>Mark damaged panels on the elevation.</li><li>Look at trim, openings and visible water paths.</li><li>Allow for conditions hidden behind the cladding.</li><li>Coordinate soffit and fascia with the wall scope.</li></ul>
    ${photo('ridge-siding-after','Oak Shade elevation used as the siding subject.',{ratio:'21/9'})}
    <p><a class="action" href="@siding">Open siding</a> <a href="@contact" data-ridge-service="Siding">Plan a siding inspection</a></p>
  </div>
</section>
<section class="wrap pair" id="windows">
  <div>${photo('ridge-window-out','Exterior of the south double-hung.')}${photo('ridge-window-in','Interior of the same window type.')}</div>
  <div>
    <h2>Windows</h2>
    <p>The south opening is read from both sides. Operation, the frame, the seal and the way the trim sheds water matter more than a promised drop in the utility bill. Double-hung, casement and picture windows move or stay fixed in different ways. The page uses public guidance on frame, glazing and operation, and it does not invent a savings percentage.</p>
    <ul><li>Test whether the sash moves and locks.</li><li>Look for moisture at the sill and the corners.</li><li>Measure the opening before specifying a unit.</li><li>Plan the interior finish with the exterior trim.</li></ul>
    <p><a class="action" href="@windows">Open windows</a> <a href="@contact" data-ridge-service="Windows">Plan a window inspection</a></p>
  </div>
</section>
<section class="wrap service-row" id="masonry">
  <div class="pair">${photo('ridge-chimney','Cedar Bend chimney, shared with the roof record.')}${photo('ridge-mortar-before','Eroded mortar in the brick-pier study.',{ratio:'1/1'})}</div>
  <div>
    <h2>Masonry</h2>
    <p>The chimney at Cedar Bend is the same project the roof page uses for flashing. Mortar loss, a cracked cap and metal that no longer turns up the masonry are exterior observations. A relining or combustion question is referred to a qualified chimney specialist. This demonstration does not claim a sweep certification or a structural engineering opinion.</p>
    <ul><li>Photograph open joints and staining.</li><li>Look at the cap, crown and flashing line.</li><li>Separate repointing from unit replacement.</li><li>Say clearly when the flue is outside the scope.</li></ul>
    <p><a class="action" href="@masonry">Open masonry</a> <a href="@contact" data-ridge-service="Masonry">Plan a masonry inspection</a></p>
  </div>
</section>`;

export const roofingHtml=`
<section class="wrap split">
  <div>
    <p class="crumbs"><a href="@services">Services</a> / Roofing</p>
    <h1>A clear plan for the roof above you.</h1>
    <p>The residential roof in this demonstration is Cedar Bend: limestone walls, a shingle field and chimneys that interrupt the slope. The benefit of a written plan is that a leak, a worn field and a metal roof question do not get the same sentence. You should be able to see what would be repaired, what would be replaced, and which systems this example company only assesses.</p>
    <p><a class="action" href="@contact" data-ridge-service="Roofing">Plan a roofing inspection</a></p>
  </div>
  <div>${photo('ridge-cedar-elevation','Complete residential roof at Cedar Bend.',{eager:true})}${photo('ridge-shingle-detail','Material detail: shingles, drip edge and flashing.',{ratio:'16/7'})}</div>
</section>
<section class="wrap">
  <h2>Four kinds of roof work</h2>
  <div class="subgrid">
    <article>${photo('ridge-flashing','A localized flashing condition.',{ratio:'4/3'})}<h3>Localized repair</h3><p>A defined leak or defect, such as tired step flashing, can be scoped on its own when the surrounding covering is still serviceable. The scope says what is touched and what is left.</p></article>
    <article>${photo('ridge-cedar-before','Worn shingles before the renewal study.',{ratio:'4/3'})}<h3>Residential replacement</h3><p>A full renewal names the covering, underlayment approach, edge metal, ventilation observations and disposal. It is for a house roof, not a shortcut to every commercial specification.</p></article>
    <article>${photo('ridge-metal-roof','Standing-seam metal used as an assessment subject.',{ratio:'4/3'})}<h3>Standing-seam assessment</h3><p>Metal asks different questions about panel layout, fastening and how it meets walls. This demo evaluates whether metal fits the roof. It does not claim every crew installs every profile.</p></article>
    <article>${photo('ridge-inspect','Ground-level observation before any roof access.',{ratio:'4/3'})}<h3>Low-slope assessment</h3><p>A small low-slope area, such as a porch or addition, may need a membrane conversation and sometimes a specialist. The page records the question instead of forcing a shingle answer.</p></article>
  </div>
</section>
<section class="wrap split">
  <div>${junctionDiagram}</div>
  <div class="reading">
    <h2>What we inspect</h2>
    <p>The visit looks at the covering, the penetrations and flashing, the way water leaves the edge, any visible concern with the deck, and the ventilation conditions that can be seen without destructive opening. Those five ideas match the home diagram, but here they sit at the junctions: a chimney, a pipe, a valley, an eave. A smooth field of shingles can hide a failed turn of metal two feet away.</p>
    <p>Observations are photographed and annotated in ordinary language. If a stain inside does not line up with a defect outside, the record says so. Concealed rot, wet insulation or a previous patch under the shingles cannot be confirmed until the roof is open, and the scope should say that plainly. Access is agreed before anyone climbs. This demonstration does not instruct a homeowner to walk a damaged roof.</p>
    <p>You should leave with three things: annotated observations, repair and replacement options written as alternatives, and an itemized scope that includes exclusions. The scope is not a bid from this website and it is not a coverage decision.</p>
    <ul><li>Annotated observations of what was visible.</li><li>Repair and replacement options, kept distinct.</li><li>An itemized scope and a list of exclusions.</li></ul>
  </div>
</section>
<section class="wrap">
  <h2>Two Cedar Bend records</h2>
  <div class="pair">
    ${compare('ridge-cedar-before','ridge-cedar-elevation','Project A. The same front elevation before and after the shingle-renewal study.')}
    <div>${photo('ridge-flashing','Project B. Flashing at the chimney also used on the masonry page.')}<p>The second record is side by side evidence of the chimney metal, not a second slider. It is the same chimney identity as the masonry pair.</p><a href="@masonry">See the masonry side of this chimney</a></div>
  </div>
</section>
<section class="wrap">
  <h2>Coverings, without a lifespan contest</h2>
  <table>
    <thead><tr><th></th><th>Architectural shingles</th><th>Standing-seam metal</th><th>Low-slope system</th></tr></thead>
    <tbody>
      <tr><th>Where it fits</th><td data-label="Architectural shingles">Sloped house roofs with a suitable deck and edge.</td><td data-label="Standing-seam metal">Slopes and details that match the panel system being considered.</td><td data-label="Low-slope system">Low pitches where shingles are the wrong question.</td></tr>
      <tr><th>What you see</th><td data-label="Architectural shingles">A textured field, with metal only at edges and penetrations.</td><td data-label="Standing-seam metal">Long panels and raised seams. Fasteners may be concealed.</td><td data-label="Low-slope system">A continuous membrane, often out of easy view.</td></tr>
      <tr><th>Ask the installer</th><td data-label="Architectural shingles">How are valleys, chimneys and ventilation handled, and what is excluded?</td><td data-label="Standing-seam metal">Which profile, how does it meet walls, and who is qualified to install it?</td><td data-label="Low-slope system">What does the system require at drains and walls, and is a specialist needed?</td></tr>
    </tbody>
  </table>
  <p>No ranking of years is offered here. Manufacturer instructions and the actual roof govern.</p>
</section>
<section class="wrap reading">
  <h2>Warranty and care</h2>
  <p>Workmanship expectations and manufacturer terms are different. The documents you actually receive govern both. This demonstration does not invent a term of years, a transfer promise, or a manufacturer logo.</p>
  <ul><li>Keep gutters and valleys clear enough to see the edge.</li><li>Note new ceiling stains with the date, from a safe place.</li><li>Ask for a handover photo of flashing that was in the scope.</li></ul>
  <p>Further reading: <a href="@guide-roof-cost">Understanding a roof estimate</a>, <a href="@guide-repair">Repair or replacement</a>, <a href="@guide-duration">Planning for roof work</a>.</p>
</section>
<section class="wrap">
  <h2>People on this work</h2>
  <div class="pair">${profile('avery')}${profile('jordan')}</div>
  <p><a href="@about">About the team</a> · <a href="@contact" data-ridge-service="Roofing">Contact</a></p>
</section>
<section class="wrap">
  <h2>Related work</h2>
  <ul>
    <li><a href="@gutters">Gutters</a> carry water after it leaves the drip edge.</li>
    <li><a href="@masonry">Masonry</a> shares the chimney flashing on Cedar Bend.</li>
    <li><a href="@siding">Siding</a> meets the roof at rakes, walls and kickout points.</li>
    <li><a href="@windows">Windows</a> below a valley can show splash the roof is sending down.</li>
  </ul>
</section>`;

export const guttersHtml=`
<section class="wrap split">
  <div>
    <p class="crumbs"><a href="@services">Services</a> / Gutters</p>
    <h1>Give rain a route away from the house.</h1>
    <p>The east eave at Cedar Bend is large enough to see the gutter, the outlet and the ground together. A useful plan names the run, the downspout and the place water is allowed to finish. Color is the last decision, after the route works.</p>
    <p><a class="action" href="@contact" data-ridge-service="Gutters">Plan a gutter inspection</a></p>
  </div>
  ${photo('ridge-gutter-after','Eave, gutter and downspout in one view.',{eager:true,ratio:'16/10'})}
</section>
<section class="wrap"><h2>Four gutter tasks</h2><div class="subgrid">
  <article>${photo('ridge-gutter-after','A continuous run on a straight eave.',{ratio:'4/3'})}<h3>New seamless runs</h3><p>A new run is sized and sloped for the roof that drains to it. Seams are fewer than a sectional gutter, not magically absent at corners and outlets.</p></article>
  <article>${photo('ridge-gutter-before','A worn run on the same eave.',{ratio:'4/3'})}<h3>Replace damaged runs</h3><p>Sagging, open joints and pulled hangers are replacement questions when a patch would not hold the slope. The fascia underneath is part of the look.</p></article>
  <article>${photo('ridge-shingle-detail','The roof edge that feeds the gutter.',{ratio:'4/3'})}<h3>Guards for a condition</h3><p>A guard is chosen for the debris and the rainfall, then judged by whether the gutter can still be opened and cleaned. No guard is described as maintenance-free.</p></article>
  <article>${photo('ridge-cleanup','Ground at the base of a wall, where discharge has to be planned.',{ratio:'4/3'})}<h3>Downspout and discharge</h3><p>The outlet, the elbow and the final spill are one decision. Site slope, beds and walks decide whether an extension or a different outlet is the honest answer.</p></article>
</div></section>
<section class="wrap split"><div>${drainageDiagram}<p>Site conditions choose the last step. The drawing is not a drainage design for a specific lot.</p></div>
<div class="reading"><h2>What we inspect</h2>
<p>The visit looks for sagging, stripes of overflow, opened joints, soft or stained fascia, leaves packed at the outlet, and the place each downspout currently spills. A gutter can look new and still throw water at a foundation planting if the last elbow points the wrong way.</p>
<p>You receive a run and discharge sketch, material and finish choices, and a note about access and cleanup. Ladder position, plants and the occupied walk are written down because they change the day of the work. Hidden fascia rot is an allowance, not a surprise to be shrugged at later.</p>
<ul><li>A sketch of runs and where they discharge.</li><li>Material and finish choices with upkeep questions.</li><li>Access and cleanup written into the scope.</li></ul></div></section>
<section class="wrap"><h2>The same eave, twice</h2><div class="pair">${compare('ridge-gutter-before','ridge-gutter-after','Before and after on one eave. The limestone courses and the tree shadow stay.')}<div>${photo('ridge-gutter-after','The same downspout arrangement, seen as the finished route.',{position:'70% 40%'})}<p>The second view is the downspout on that eave, cropped toward the outlet rather than a different house.</p></div></div></section>
<section class="wrap"><h2>Open, guarded, or a larger run</h2>
<table><thead><tr><th></th><th>Open gutter</th><th>Guarded gutter</th><th>Larger capacity</th></tr></thead><tbody>
<tr><th>Upkeep</th><td data-label="Open gutter">You can see and lift debris. Cleaning is obvious and recurring.</td><td data-label="Guarded gutter">Some debris sheds; fine grit and ice still need a plan for opening the guard.</td><td data-label="Larger capacity">More water in the trough does not clean the outlet by itself.</td></tr>
<tr><th>Ask</th><td data-label="Open gutter">How often should this roof’s trees fill it?</td><td data-label="Guarded gutter">How is the guard removed without damaging the hanger?</td><td data-label="Larger capacity">Is the limit the gutter, the outlet, or the slope of the run?</td></tr>
</tbody></table></section>
<section class="wrap reading"><h2>Care from the ground</h2>
<p>Workmanship on the installation and any product guidance are separate. The paperwork governs. This demo states no term of years.</p>
<ul><li>Look from the ground after heavy rain and note overflow.</li><li>Do not climb to clear a guard; ask for access when height is involved.</li><li>Keep the discharge pointed away from the foundation bed.</li></ul>
<p>Related: <a href="@roofing">Roof edges</a> feed the gutter. <a href="@siding">Fascia and siding</a> are what a leaking trough stains. <a href="@windows">Windows</a> below an outlet can take the splash. <a href="@masonry">Masonry</a> at grade shows the same misdirected water.</p>
<div class="pair">${profile('taylor')}${profile('morgan')}</div></section>`;

export const sidingHtml=`
<section class="wrap">
  <p class="crumbs"><a href="@services">Services</a> / Siding</p>
  <h1>A renewed exterior, down to the details.</h1>
  <p class="lede">Oak Shade is a wide elevation, not another roof aerial. The benefit of the plan is a wall that names boards, trim and the openings together, with room for what may be found underneath.</p>
  <p><a class="action" href="@contact" data-ridge-service="Siding">Plan a siding inspection</a></p>
  ${photo('ridge-siding-after','Oak Shade elevation.',{eager:true,ratio:'21/9'})}
</section>
<section class="wrap"><h2>Four siding tasks</h2><div class="subgrid">
  <article>${photo('ridge-siding-before','Damaged boards on the same elevation.',{ratio:'4/3'})}<h3>Partial repair</h3><p>A few cracked or swollen boards can be replaced when the rest of the elevation is sound and a match is available. The scope draws the boundary.</p></article>
  <article>${photo('ridge-fiber-sample','Fiber-cement texture sample.',{ratio:'1/1'})}<h3>Fiber-cement cladding</h3><p>Fiber cement has a specific fastening, clearance and finish practice. The demonstration compares its character with other options; it does not treat one brand as accredited here.</p></article>
  <article>${photo('ridge-vinyl-sample','Vinyl texture sample.',{ratio:'1/1'})}<h3>Vinyl or engineered wood</h3><p>These options change movement, joints and how trim is built. Selection is an assessment of the wall, not a default upgrade.</p></article>
  <article>${photo('ridge-trim-corner','Trim, and the idea of soffit and fascia meeting the wall.',{ratio:'4/3'})}<h3>Trim, soffit, fascia</h3><p>The corner, the eave and the window casing are where cladding jobs look finished or unfinished. They are coordinated with gutters when the fascia is opened.</p></article>
</div></section>
<section class="wrap split"><div>${wallDiagram}</div><div class="reading"><h2>What we inspect</h2>
<p>The elevation is marked for damaged panels, stains that suggest a water path, trim that has opened, and the heads and sills of windows. A reclad can also find sheathing or flashing that was not visible. The scope should carry an allowance for that instead of a promise that the wall behind is dry.</p>
<p>Deliverables are an elevation scope, a material and finish schedule, and a protection and disposal plan. Plants, walks and the occupied rooms behind the wall are part of the plan because siding work is noisy and dusty at the openings.</p>
<p>The section drawing is a conversation piece about cladding, a drainage gap and trim. It is not a universal installation sheet and it is not a code detail.</p>
<ul><li>Elevation scope with the areas included.</li><li>Material and finish schedule.</li><li>Protection and disposal plan.</li></ul></div></section>
<section class="wrap"><h2>Same elevation, same corner</h2><div class="pair">${compare('ridge-siding-before','ridge-siding-after','Project A. One house, one camera, a cladding study.')}<div>${photo('ridge-trim-corner','Project B. The trim corner, framed tightly.')}<p>The corner is the detail that has to match the elevation, not a different building.</p></div></div>
<div data-ridge-swatch><h3>Finish samples</h3><p>These buttons change the sample, not the house photograph.</p><div class="swatches"><button type="button" data-swatch="Fiber cement" data-src="/theme-assets/${ridgeAsset('ridge-fiber-sample').sha256}/${ridgeAsset('ridge-fiber-sample').file}" data-alt="${ridgeAsset('ridge-fiber-sample').alt}" aria-pressed="true">Fiber cement</button><button type="button" data-swatch="Vinyl" data-src="/theme-assets/${ridgeAsset('ridge-vinyl-sample').sha256}/${ridgeAsset('ridge-vinyl-sample').file}" data-alt="${ridgeAsset('ridge-vinyl-sample').alt}" aria-pressed="false">Vinyl</button></div><figure><img data-swatch-sample src="/theme-assets/${ridgeAsset('ridge-fiber-sample').sha256}/${ridgeAsset('ridge-fiber-sample').file}" alt="${ridgeAsset('ridge-fiber-sample').alt}" width="800" height="800"><figcaption><span data-swatch-name>Fiber cement</span><small>Sample only. The elevation photograph stays the fiber-cement study.</small></figcaption></figure></div>
</section>
<section class="wrap"><h2>Materials side by side</h2>
<table><thead><tr><th></th><th>Fiber cement</th><th>Vinyl</th><th>Engineered wood</th></tr></thead><tbody>
<tr><th>Character</th><td data-label="Fiber cement">A painted, heavier lap with a dry texture.</td><td data-label="Vinyl">A lighter lap with a smoother face.</td><td data-label="Engineered wood">A wood-like face that depends on its finish and joints.</td></tr>
<tr><th>Upkeep</th><td data-label="Fiber cement">Finish care and clearance at grade matter.</td><td data-label="Vinyl">Joints and impact are the usual questions, not paint cycles.</td><td data-label="Engineered wood">Cut ends and moisture at trim need a manufacturer’s rule.</td></tr>
<tr><th>Ask</th><td data-label="Fiber cement">What fastening and clearance does this wall require?</td><td data-label="Vinyl">How does the trim get built so water leaves the opening?</td><td data-label="Engineered wood">Which exposure is this product actually for?</td></tr>
</tbody></table>
<p>Manufacturer requirements govern. This table is not a ranking.</p></section>
<section class="wrap reading"><h2>Warranty and care</h2><p>Installation workmanship and the product warranty are separate papers. The documents govern. No term of years is invented here.</p><ul><li>Keep soil and mulch off the bottom course.</li><li>Look at window heads after wind-driven rain.</li><li>Repaint or recaulk only in line with the product guidance you were given.</li></ul>
<p>Coordinate <a href="@windows">windows</a> and <a href="@gutters">gutters</a> when the trim and fascia are already open. <a href="@roofing">Roofing</a> meets the wall at the rake. <a href="@masonry">Masonry</a> abutting the cladding needs its own joint.</p>
<div class="pair">${profile('taylor')}${profile('jordan')}</div><p><a href="@about">About</a> · <a href="@contact" data-ridge-service="Siding">Contact</a></p></section>`;

export const windowsHtml=`
<section class="wrap split">
  <div><p class="crumbs"><a href="@services">Services</a> / Windows</p><h1>Better openings for everyday living.</h1>
  <p>The south double-hung is shown from the yard and from the room. The benefit is a schedule that talks about view, how the sash moves, whether the room needs ventilation, and how the opening is finished. It does not promise a lower energy bill.</p>
  <p><a class="action" href="@contact" data-ridge-service="Windows">Plan a window inspection</a></p></div>
  <div class="pair">${photo('ridge-window-out','Outside the south window.',{eager:true})}${photo('ridge-window-in','Inside the same window type.',{eager:true})}</div>
</section>
<section class="wrap"><h2>Four window tasks</h2><div class="subgrid">
<article>${photo('ridge-window-out','An operating double-hung.',{ratio:'4/3'})}<h3>Operating replacement</h3><p>Double-hung and similar operating units are replaced when the sash, balance or frame no longer does its job. The room’s need to ventilate stays in the brief.</p></article>
<article>${photo('ridge-window-in','A fixed view through clear glass.',{ratio:'4/3'})}<h3>Fixed and picture units</h3><p>A picture window holds a view and does not open. It is the right question for a wall that wants glass more than airflow, and a poor question for a room that needs a vent.</p></article>
<article>${photo('ridge-window-before','A weathered frame before the study.',{ratio:'4/3'})}<h3>Glazing and frame choices</h3><p>Frame material, glass layers and coatings are separate from the way the window operates. Performance labels are read from the unit, not invented on this page.</p></article>
<article>${photo('ridge-trim-corner','Trim that has to meet the new unit.',{ratio:'4/3'})}<h3>Opening assessment</h3><p>Measurement, the condition of the rough opening, and the interior finish are planned before a unit is ordered. A pretty sash in the wrong opening is still the wrong sash.</p></article>
</div></section>
<section class="wrap split"><div>${windowOps}</div><div class="reading"><h2>What we inspect</h2>
<p>The visit checks whether the window operates, what the frame is doing, whether the seal has failed in insulated glass, and whether the sill or the corners show moisture. Openings are measured. The U.S. Department of Energy’s window guidance distinguishes the frame, the glazing and the operation from the ratings that describe performance. Those ratings are properties of a specified unit. They are not a savings percentage for a particular house, and this page does not offer one.</p>
<p>You receive a room-by-room schedule, the operation and material choices, and an installation and finishing scope. Interior stools, casing and the exterior trim are named so the wall and the window do not get planned by different people who never meet.</p>
<ul><li>Room-by-room schedule.</li><li>Operation and material choices.</li><li>Installation and finishing scope.</li></ul>
<p>Source note: Energy Saver, window types and technologies, energy.gov. Used for the distinction among frame, glazing, operation and ratings.</p></div></section>
<section class="wrap"><h2>One opening, two sides</h2><div class="pair">${compare('ridge-window-before','ridge-window-out','Exterior of the same opening, weathered frame and the replacement study.')}<div>${photo('ridge-window-in','Interior finish of the double-hung study.')}<p>The interior photograph is the same window type, shown from the room rather than as a second unrelated house.</p></div></div></section>
<section class="wrap"><h2>How the three operations differ</h2>
<table><thead><tr><th></th><th>Double-hung</th><th>Casement</th><th>Picture</th></tr></thead><tbody>
<tr><th>Operation</th><td data-label="Double-hung">Sashes travel up and down.</td><td data-label="Casement">The sash swings outward on a side hinge.</td><td data-label="Picture">The glass does not open.</td></tr>
<tr><th>Ventilation</th><td data-label="Double-hung">A portion of the height can open.</td><td data-label="Casement">The opening can catch a breeze when the swing is clear.</td><td data-label="Picture">None. Pair it with an operating unit if the room needs air.</td></tr>
<tr><th>Cleaning and fit</th><td data-label="Double-hung">Ask how the sash is reached and tilted.</td><td data-label="Casement">Ask about the crank, the screen and the swing over a walk.</td><td data-label="Picture">Ask how the exterior face is cleaned without a sash to open.</td></tr>
</tbody></table></section>
<section class="wrap reading"><h2>Care</h2><p>Hardware, weep holes and the manufacturer’s care note are the practical follow-up. Workmanship and the product warranty remain separate documents. No savings figure and no term of years is stated.</p>
<ul><li>Keep tracks clear and locks aligned.</li><li>Do not paint shut a weep or a sash that is meant to move.</li><li>Bring the unit’s guidance to any later hardware question.</li></ul>
<p><a href="@siding">Siding and trim</a> wrap the opening. <a href="@gutters">Gutters</a> decide whether water is thrown at the head. <a href="@roofing">Roofing</a> above a window can feed that splash. <a href="@masonry">Masonry</a> jambs need their own seal.</p>
<div class="pair">${profile('morgan')}${profile('taylor')}</div></section>`;

export const masonryHtml=`
<section class="wrap split">
  <div><p class="crumbs"><a href="@services">Services</a> / Masonry</p><h1>Repair the joints. Respect the original work.</h1>
  <p>Cedar Bend’s chimney is the portrait. The brick pier is the joint study. The benefit of a careful scope is a repair that matches what is there, and a clear stop when the question belongs to a chimney specialist rather than an exterior crew.</p>
  <p><a class="action" href="@contact" data-ridge-service="Masonry">Plan a masonry inspection</a></p></div>
  <div>${photo('ridge-chimney','Chimney portrait at Cedar Bend.',{eager:true,ratio:'3/4'})}${photo('ridge-mortar','Mortar close-up from the brick-pier study.',{ratio:'16/8'})}</div>
</section>
<section class="wrap"><h2>Four masonry tasks</h2><div class="subgrid">
<article>${photo('ridge-chimney','Chimney exterior.',{ratio:'4/3'})}<h3>Chimney exterior</h3><p>The outside of the chimney, the cap and the line where it meets the roof can be assessed as exterior work. The flue and any combustion appliance are not assumed to be part of that look.</p></article>
<article>${photo('ridge-mortar-before','Open joints before repointing study.',{ratio:'4/3'})}<h3>Mortar joints</h3><p>Repointing removes failed mortar and places compatible new mortar. It is not a coat of surface slurry, and it is not a reason to replace every brick that still holds.</p></article>
<article>${photo('ridge-flashing','Flashing at the chimney, shared with roofing.',{ratio:'4/3'})}<h3>Crown, cap, flashing</h3><p>A cracked crown or a cap that sheds the wrong way belongs with the metal that turns onto the roof. Roofing and masonry meet in this one detail.</p></article>
<article>${photo('ridge-mortar','Sound joints used as the finished study.',{ratio:'4/3'})}<h3>Brick and stone repair</h3><p>Decorative cracks, spalls and a few failed units can be repaired when a match is realistic. A larger rebuild is a different level of intervention, not a button on this page.</p></article>
</div></section>
<section class="wrap reading"><h2>What we inspect</h2>
<p>The visit records mortar that has recessed or crumbled, cracks through units or joints, the condition of the crown and cap, the flashing where the chimney meets the roof, and staining that shows a water path. Those are exterior facts. They do not tell you whether a flue liner is sound or whether an appliance is safe to use.</p>
<p>If the question is structural, or it concerns the combustion system, the demonstration says so and points to a qualified chimney specialist. Ridgeline does not claim a sweep certification, an engineering license, or the right to clear a fireplace for use.</p>
<p>Deliverables are annotated findings, a material-match approach, and a scope that includes referral boundaries. You should be able to see what the exterior crew would touch and what it would not.</p>
<ul><li>Annotated findings.</li><li>A material-match approach.</li><li>Scope and referral boundaries.</li></ul>
<aside class="panel"><h3>Specialist referral</h3><p>Relining, smoke spillage, or a chimney that may be moving are outside this exterior demonstration. Ask a qualified chimney specialist before treating those as a masonry patch.</p></aside>
</section>
<section class="wrap"><h2>Shared chimney, one mortar frame</h2><div class="pair"><div>${photo('ridge-chimney','Project A. The Cedar Bend chimney, the same identity as the roofing flashing record.')}<p><a href="@roofing">Roofing project B uses this chimney.</a></p></div>${compare('ridge-mortar-before','ridge-mortar','Project B. One brick area, eroded joints and the repointing study.')}</div></section>
<section class="wrap"><h2>Levels of intervention</h2>
<table><thead><tr><th></th><th>Repointing</th><th>Unit replacement</th><th>Rebuild assessment</th></tr></thead><tbody>
<tr><th>What changes</th><td data-label="Repointing">Failed mortar in defined joints.</td><td data-label="Unit replacement">A cracked or spalled brick or stone, where a match exists.</td><td data-label="Rebuild assessment">Enough of the assembly that a patch would not be honest.</td></tr>
<tr><th>What it is not</th><td data-label="Repointing">A coating or a color wash.</td><td data-label="Unit replacement">A reason to rebuild the chimney.</td><td data-label="Rebuild assessment">A conclusion you should reach from a snapshot.</td></tr>
</tbody></table>
<p>This is not a self-diagnosis tool. The visit decides which level is even plausible.</p></section>
<section class="wrap reading"><h2>Care</h2><p>New mortar and any cap or flashing workmanship follow the scope you were given. Product guidance, if a manufactured cap is used, is a separate document. No term of years is stated.</p>
<ul><li>Watch for fresh staining after the first hard rain.</li><li>Do not seal masonry in a way that traps water unless a specifier said to.</li><li>Keep the roof metal at the chimney in the same conversation as the joints.</li></ul>
<p><a href="@roofing">Roofing</a> owns the field around the flashing. <a href="@gutters">Drainage</a> at grade keeps splash off the base. <a href="@siding">The wall envelope</a> has to meet the masonry without a shelf for water. <a href="@windows">Windows</a> in a masonry opening share the joint question.</p>
<div class="pair">${profile('avery')}${profile('taylor')}</div></section>`;

