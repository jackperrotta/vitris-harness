import {photo,compare} from '../photo.ts';
import {roofSystem} from '../diagrams.ts';
import {SERVICES,TIMELINES,TOWNS,STORIES,TEAM} from '../facts.ts';

const opt=(items:readonly string[])=>items.map(item=>`<option value="${item}">${item}</option>`).join('');
const fields=`<label>Service <select data-ridge-field="service" name="service">${opt(SERVICES)}</select></label><label>Timing <select data-ridge-field="timeline" name="timeline">${opt(TIMELINES)}</select></label><label>Town <select data-ridge-field="town" name="town">${opt(TOWNS)}</select></label>`;

const stages:[string,string,string,string][]=[
 ['inspect','Inspect and document','We look from the ground and from agreed safe access, then photograph the conditions that drive the conversation. You should leave knowing what was visible and what could not be confirmed without opening a roof or wall.','ridge-inspect'],
 ['scope','Write the scope','The next record names the work, the options, and the exclusions. A homeowner should be able to see repair, replacement and maintenance as different documents, not one blended price.','ridge-scope'],
 ['schedule','Schedule and materials','Dates, delivery and the material specification are written before tear-off. Weather and concealed conditions can still change the day; the coordinator records the change instead of treating the first date as a promise.','ridge-home-prep'],
 ['install','Protect and install','Openings, plantings and occupied rooms are protected to the scope. Installation follows the system being installed, not a universal fastener count. The lead checks the sequence while the work is open.','ridge-install'],
 ['handover','Inspect, clean, hand over','The last visit walks the cleanup, the photos and the care notes. You receive what was done, what was excluded, and how to raise a later concern. This demonstration does not start a warranty term.','ridge-cleanup']
];

export const homeHtml=`
<section class="wrap hero">
  <div>
    <p class="eyebrow">Ridgeline Exterior Co. · example Hill Country</p>
    <h1>Know what your exterior needs.</h1>
    <p class="lede">An inspection should name the roof, the water path and the walls as one assembly. This demonstration shows how a written scope separates repair, replacement and ordinary care.</p>
    <p class="actions"><a class="action" href="@contact" data-ridge-continue>Plan an inspection</a> <a class="textish" href="#evidence">See the project evidence</a></p>
    <p class="demo-inline">${TEAM[0]!.name} estimates. ${TEAM[1]!.name} coordinates. Nothing on this page is a booked visit.</p>
  </div>
  <div>
    ${photo('ridge-cedar-aerial','Cedar Bend, the demonstration ranch. Aerial view of the shingle roof and limestone walls.',{eager:true,ratio:'16/10'})}
    <aside class="note"><strong>Cedar Bend</strong><p>Architectural shingles, two chimneys, live-oak shade. Generated project, not a finished job.</p></aside>
    <form class="visit-card" data-ridge-visit>${fields}<a class="action" href="@contact" data-ridge-continue>Use these choices</a></form>
  </div>
</section>
<section class="wrap system" id="system">
  <div>${roofSystem}<p class="demo-inline">Original diagram. The five labels match the glossary later in the site.</p></div>
  <div>
    <p class="eyebrow">The roof as a system</p>
    <h2>Interfaces decide more than the field of shingles.</h2>
    <p>The deck carries the assembly. Protective layers are not the finished roof. Edge drainage, the covering, and the flashing or ventilation details have to agree with one another.</p>
    <p>A stain at a chimney, a drip at an eave, or a warm room under a closed attic can come from a meeting of parts. The diagram is a vocabulary, not a certification and not a construction detail for every house.</p>
    <ol>
      <li>Deck: the board or sheathing the rest of the roof sits on.</li>
      <li>Protective layers: underlayment and related sheets, with limits.</li>
      <li>Edge drainage: drip edge, gutter and where water is sent.</li>
      <li>Covering: shingles, metal or a low-slope membrane, as specified.</li>
      <li>Ventilation and flashing: the details that keep water and heat in the right places.</li>
    </ol>
  </div>
</section>
<section class="wrap" data-ridge-rail>
  <div class="rail-head"><div><p class="eyebrow">Five exteriors</p><h2>Start with the part that is failing.</h2></div><div class="controls"><button type="button" class="ghost" data-rail-prev>Previous</button><button type="button" class="ghost" data-rail-next>Next</button><p data-rail-status>Showing service 1 of 5</p></div></div>
  <div class="rail-track">
    <article>${photo('ridge-shingle-detail','Architectural shingles and step flashing.')}<h3>Roofing</h3><p>Granule loss, a lifted flashing or a soft deck are different problems. The roof page separates leak repair from a full renewal.</p><a href="@roofing">Read roofing</a></article>
    <article>${photo('ridge-gutter-after','A new gutter and downspout on limestone.')}<h3>Gutters</h3><p>Overflow stripes and a downspout aimed at the foundation are drainage problems, even when the shingles still look even.</p><a href="@gutters">Read gutters</a></article>
    <article>${photo('ridge-siding-after','Finished fiber-cement elevation at Oak Shade.')}<h3>Siding</h3><p>Cracked boards and tired trim need an elevation scope. Material choice follows the wall, not a catalog swatch alone.</p><a href="@siding">Read siding</a></article>
    <article>${photo('ridge-window-out','Double-hung window in the limestone wall.')}<h3>Windows</h3><p>A stuck sash, failed seal or rotten frame changes light and water at the opening. Savings claims are not part of this demo.</p><a href="@windows">Read windows</a></article>
    <article>${photo('ridge-chimney','Chimney and roof meeting at Cedar Bend.')}<h3>Masonry</h3><p>Open mortar and tired chimney flashing share a wall of water. Structural or flue questions are referred onward.</p><a href="@masonry">Read masonry</a></article>
  </div>
</section>
<section class="wrap" id="evidence">
  <p class="eyebrow">Project evidence</p>
  <h2>Three records, not nine unrelated houses.</h2>
  <div class="evidence">
    <article>
      <button type="button" class="plain" data-ridge-project="cedar">${photo('ridge-cedar-elevation','Cedar Bend front elevation after the demonstration renewal.')}</button>
      <h3>Cedar Bend · roof</h3>
      <p>Problem: worn shingles and chimney flashing. Scope: a residential renewal study. Finished detail: aligned laps and metal at the chimney. Demonstration only.</p>
    </article>
    <div class="stack">
      <article><button type="button" data-ridge-project="eave">${photo('ridge-gutter-after','East eave after the gutter demonstration.',{ratio:'4/3'})}</button><h3>East eave</h3><p>Same wall, new gutter and a splash block.</p></article>
      <article><button type="button" data-ridge-project="oak">${photo('ridge-siding-after','Oak Shade fiber-cement elevation.',{ratio:'4/3'})}</button><h3>Oak Shade</h3><p>Same elevation, cladding and trim study.</p></article>
    </div>
    <div class="stack">
      <article><button type="button" data-ridge-project="window">${photo('ridge-window-out','South double-hung, exterior.',{ratio:'1/1'})}</button><h3>South window</h3><p>Outside and inside of one opening type.</p></article>
      <article><button type="button" data-ridge-project="chimney">${photo('ridge-mortar','Sound mortar used as the finished joint study.',{ratio:'1/1'})}</button><h3>Brick pier</h3><p>One framed mortar area, before and after.</p></article>
    </div>
  </div>
  <dialog data-ridge-dialog="cedar"><h2>Cedar Bend</h2>${photo('ridge-flashing','Flashing at the Cedar Bend chimney.')}<p>Scope: shingle field, penetrations and chimney metal. Related service: roofing. This panel is a demonstration record.</p><a href="@roofing">Open roofing</a><button type="button" data-ridge-close>Close</button></dialog>
  <dialog data-ridge-dialog="eave"><h2>Cedar Bend east eave</h2>${photo('ridge-gutter-before','The same eave before replacement.')}<p>Scope: gutter run, downspout and discharge. Related service: gutters.</p><a href="@gutters">Open gutters</a><button type="button" data-ridge-close>Close</button></dialog>
  <dialog data-ridge-dialog="oak"><h2>Oak Shade</h2>${photo('ridge-trim-corner','Trim corner on the siding study.')}<p>Scope: damaged boards and trim at one elevation. Related service: siding.</p><a href="@siding">Open siding</a><button type="button" data-ridge-close>Close</button></dialog>
  <dialog data-ridge-dialog="window"><h2>South window</h2>${photo('ridge-window-in','Interior of the double-hung study.')}<p>Scope: operation, frame and interior finish. Related service: windows.</p><a href="@windows">Open windows</a><button type="button" data-ridge-close>Close</button></dialog>
  <dialog data-ridge-dialog="chimney"><h2>Chimney and brick pier</h2>${photo('ridge-chimney','Cedar Bend chimney, shared with the roofing record.')}<p>Scope: visible mortar, cap and flashing. Related service: masonry. Flue lining is a specialist question.</p><a href="@masonry">Open masonry</a><button type="button" data-ridge-close>Close</button></dialog>
</section>
<section class="wrap" data-ridge-stages>
  <p class="eyebrow">Inspection to handover</p>
  <h2>Five stages you can read without a slideshow.</h2>
  <div class="stage-tabs" role="tablist">${stages.map(([id,title],index)=>`<button type="button" role="tab" data-stage="${id}" aria-selected="${index===0?'true':'false'}">${index+1}. ${title}</button>`).join('')}</div>
  ${stages.map(([id,title,copy,image])=>`<article class="stage-panel split" data-stage-panel="${id}"><div>${photo(image,title)}<h3>${title}</h3><p>${copy}</p><p>What you should have: a named contact, photos of the condition just discussed, and a note if something remains unknown.</p></div></article>`).join('')}
</section>
<section class="wrap">
  <p class="eyebrow">Before and after</p>
  <h2>Same house, same camera, a different surface.</h2>
  <p>These pairs are generated design demonstrations. They are not proof that a crew finished the work.</p>
  ${compare('ridge-cedar-before','ridge-cedar-elevation','Cedar Bend front elevation. Worn shingles on the left of the control, the renewal study on the right.')}
  <div class="pair">
    ${compare('ridge-gutter-before','ridge-gutter-after','East eave. The downspout and wall stay in the same place.')}
    ${compare('ridge-siding-before','ridge-siding-after','Oak Shade. The walk, gable and trees stay put.')}
  </div>
</section>
<section class="wrap" data-ridge-stories>
  <p class="eyebrow">Illustrative scenarios</p>
  <h2>What a clear record changed.</h2>
  <div class="stories">
    <div class="controls">${STORIES.map((story,index)=>`<button type="button" class="ghost" data-story="${story.id}" aria-pressed="${index===0?'true':'false'}">${story.name}</button>`).join('')}</div>
    <div>${STORIES.map((story,index)=>`<blockquote data-story-panel="${story.id}" ${index?'hidden':''}><p>${story.quote}</p><footer>${story.name} · ${story.context}. Not a verified review.</footer></blockquote>`).join('')}${photo('ridge-scope','A scope conversation used with these scenarios.')}</div>
  </div>
</section>
<section class="wrap">
  <p class="eyebrow">Choosing a scope</p>
  <h2>Repair, replacement, or planned care.</h2>
  <table>
    <thead><tr><th>Question</th><th>Targeted repair</th><th>Full replacement</th><th>Planned maintenance</th></tr></thead>
    <tbody>
      <tr><th data-label="Question">Purpose</th><td data-label="Targeted repair">Correct a defined defect.</td><td data-label="Full replacement">Renew a covering or cladding that is no longer serviceable as a system.</td><td data-label="Planned maintenance">Keep water paths and finishes observable.</td></tr>
      <tr><th data-label="Question">Evidence</th><td data-label="Targeted repair">Photos and notes of one area.</td><td data-label="Full replacement">Widespread wear, failed interfaces, or a specification that cannot be matched in pieces.</td><td data-label="Planned maintenance">A dated look at edges, joints and discharge.</td></tr>
      <tr><th data-label="Question">Disruption</th><td data-label="Targeted repair">Usually local access and a short protection plan.</td><td data-label="Full replacement">Tear-off or removal, deliveries and occupied-home planning.</td><td data-label="Planned maintenance">Little or no removal.</td></tr>
      <tr><th data-label="Question">Document</th><td data-label="Targeted repair">A limited scope and a list of exclusions.</td><td data-label="Full replacement">Materials, protection, disposal and allowances.</td><td data-label="Planned maintenance">What will be checked and what will not be repaired.</td></tr>
      <tr><th data-label="Question">Follow-up</th><td data-label="Targeted repair">Watch the repaired interface.</td><td data-label="Full replacement">Handover photos and care notes.</td><td data-label="Planned maintenance">A reminder of what the next visit should see.</td></tr>
    </tbody>
  </table>
  <p><a class="action" href="@contact" data-ridge-continue>Ask for an assessment</a> An assessment is not a diagnosis from a photograph.</p>
</section>
<section class="wrap">
  <p class="eyebrow">Quick answers</p>
  <h2>Six decisions people ask first.</h2>
  <details><summary>Does the inspection in this demo have a fee?</summary><p>This page cannot charge or waive a fee. A real company has to state whether the visit is paid, credited, or free, and what the written result includes. <a href="@faq">Read the estimate answers</a>.</p></details>
  <details><summary>How long does the work take?</summary><p>Duration follows the scope, the weather and what the deck or wall reveals. The planning article lists the stages without promising a single day. <a href="@guide-duration">Planning for roof work</a>.</p></details>
  <details><summary>Can you document storm damage for insurance?</summary><p>The demonstration can show how photos and a repair scope are organized. The insurer decides coverage. <a href="@guide-insurance">Roof damage and insurance</a>.</p></details>
  <details><summary>What does a warranty cover?</summary><p>Workmanship and product terms are different documents. This demo invents neither a year count nor a transfer rule. <a href="@faq">Warranty answers</a>.</p></details>
  <details><summary>What if water is coming in now?</summary><p>Active leaks need safe temporary protection and a professional visit. This website cannot dispatch anyone. <a href="@guide-hail">After a hailstorm</a>.</p></details>
  <details><summary>Who handles the cleanup?</summary><p>Protection, collection and a walkthrough belong in the written scope. Nails and debris are not an afterthought in the demonstration process. <a href="@faq">During-work answers</a>.</p></details>
</section>
<section class="wrap planner" data-ridge-cal>
  <div>
    <p class="eyebrow">Inspection planner</p>
    <h2>Choose a demonstration time.</h2>
    <p data-ridge-summary></p>
    ${fields}
    <p class="demo-inline">Towns are an illustrative Hill Country list. Choosing one does not reserve a crew.</p>
  </div>
  <div>
    <div class="controls"><button type="button" class="ghost" data-cal-prev>Previous month</button><h3 data-cal-title></h3><button type="button" class="ghost" data-cal-next>Next month</button></div>
    <div class="cal" data-cal-grid role="grid" aria-label="Inspection dates"></div>
    <p class="demo-inline">Past dates and Sundays are unavailable. The second Tuesday is a demonstration hold. Fridays open an empty-day message.</p>
  </div>
  <div>
    <button type="button" class="ghost" data-hour-toggle aria-pressed="true">Show 24-hour times</button>
    <div data-cal-slots></div>
    <a class="action" href="@contact" data-ridge-continue>Continue to the request</a>
  </div>
</section>
`;
