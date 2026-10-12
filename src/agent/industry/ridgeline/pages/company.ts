import {photo} from '../photo.ts';
import {glossaryDiagram,areaMap} from '../diagrams.ts';
import {BUSINESS,TEAM,STORIES,SERVICES,TIMELINES,TOWNS} from '../facts.ts';

const opt=(items:readonly string[],placeholder:string)=>`<option value="">${placeholder}</option>`+items.map(item=>`<option value="${item}">${item}</option>`).join('');

const faq:[string,string,string,string][]=[
 ['estimates','fee','Does an inspection have a fee?','This demonstration does not charge a fee and cannot tell you what a real company charges. A working business has to say whether the visit is complimentary, credited toward work, or billed, and what you receive in writing afterward. In the example, the output is annotated observations, options, and a scope with exclusions. Confirm the actual arrangement before anyone comes to a real house.'],
 ['estimates','cost','What affects roof cost?','Scope, material, access and concealed conditions move the work more than a single slogan about price. A steep slope, a chimney, a tight driveway or a deck that has to be repaired after tear-off are different jobs. This site does not publish a local price band. <a href="@guide-roof-cost">The estimate guide</a> shows the questions a scope should answer.'],
 ['estimates','payment','Are payment options available?','Any deposit, progress payment or financing would come from the actual provider’s terms. This demo does not offer a loan, an APR, or an approval. Ask who you pay, when, and what happens if concealed work changes the scope. Do not treat a website form as a credit application.'],
 ['estimates','attend','Do I need to attend?','Someone needs to provide access and a way to ask questions. You can meet at the start, join by a preferred phone or email, or walk the findings at the end. Exterior observation is not the same as inviting a crew through the house. Say which rooms, pets and gates are in play before the visit.'],
 ['during','stay','Can we stay home?','Often yes, with a plan for noise, the driveway, and where people and pets move. Roof tear-off is loud. Window or siding work opens the wall for a time. The planning article is the longer version. If a day is unsafe to occupy a particular room, that belongs in the scope, not in a guess from this page.'],
 ['during','duration','How long will work take?','It follows the written scope, the weather, and what the deck or sheathing looks like once open. A repair of one flashing is not a re-roof. The coordinator in this example updates the record when a date moves. <a href="@guide-duration">Read the planning guide</a>. No duration on this site is a promise.'],
 ['during','rain','What if it rains?','Open roofs and open walls are protected in the way the day’s conditions allow, and work is rescheduled when protection would not be honest. A light shower and a storm are not the same decision. Ask, before the job, who watches the forecast and how you will hear about a pause.'],
 ['during','fasten','How are materials fastened?','The system being installed and the manufacturer’s instructions govern fasteners, spacing and edges. There is no universal nail count on this website. If a specification and a field habit disagree, the written scope and the product instructions are the conversation, not a rule of thumb from a neighbor’s roof.'],
 ['during','debris','Who handles debris?','The scope should say how plants and walks are protected, how debris is collected, and that a cleanup walkthrough happens before the crew leaves. Nails in the drive are part of that walk, not a favor. If haul-away is excluded, the document should say where the material will sit.'],
 ['understanding','uneven','Why does a roof look uneven?','Waves can come from the deck, from piled underlayment, from a vent or cricket, or from wear. A photograph cannot sort those causes. An inspection looks at the attic side where it is safe and at the slope itself. Do not treat a telephoto picture as a diagnosis.'],
 ['understanding','nails','Are fastener tips visible from below a problem?','Sometimes the points of fasteners can be seen from an attic, and sometimes that is how the specified assembly looks. It depends on the deck, the fastener and the system. It is a reason to ask, not a reason to panic or to ignore it. A professional has to see the assembly.'],
 ['understanding','underlayment','What is underlayment for?','Underlayment is a protective layer between the deck and the finished covering. It is not the roof you live under by itself, and it does not forgive missing flashing. Its type and where it is required belong in the specification. Torn or missing pieces are an observation, not a complete verdict on the roof.'],
 ['understanding','vent','How is ventilation assessed?','The visit looks at the whole assembly that can be seen: intake at the eaves, exhaust at the ridge or other outlets, and blocked baffles. A single vent cap is not an assessment. This page does not prescribe a ratio. Building conditions and the applicable instructions do that work.'],
 ['storms','claim','Can you help with claim documentation?','The example contractor can organize photographs and a repair scope. The insurer decides what the policy pays. Ridgeline is not a public adjuster and does not negotiate the claim. <a href="@guide-insurance">The insurance article</a> separates the owner, the insurer and the contractor.'],
 ['storms','leak','What about an active leak?','Stop using a room if water and electricity meet, catch what you safely can, and ask a professional about temporary protection. This website cannot send a crew. Keep receipts and photos. Tell the insurer promptly if a policy requires notice. Do not climb a wet roof to find the source.'],
 ['storms','hail','How do I recognize hail damage?','From the ground you may see bruises in soft metal, granule piles, or a pattern of marks. Those clues do not prove what a policy will pay, and some marks have other causes. <a href="@guide-hail">After a hailstorm</a> is a recording guide, not a permission slip to get on the roof.'],
 ['warranty','cover','What does a warranty cover?','A product warranty and a workmanship warranty answer different failures. One may follow the manufacturer’s registration and exclusions. The other follows the installer’s written promise, if one exists. The documents you are given govern. This demo does not supply either document.'],
 ['warranty','transfer','Does it transfer?','Transfer depends on the actual written terms. Some product warranties move to a later owner with conditions, and some do not. Nothing here is a blanket promise that a future buyer inherits coverage. Ask for the clause before you rely on it in a sale.'],
 ['warranty','concern','How do I raise a concern?','Write the date, the room or the slope, and what you saw. Add photographs if you can take them safely from the ground or from inside. Contact the coordinator named on the job and ask for an assessment. Keep the scope nearby so the question is tied to what was actually agreed.']
];

const gloss:[string,string][]=[
 ['Decking','The board or sheathing that the rest of the roof is built on. If the deck is soft or delaminated, a new covering alone does not fix the structure under it.'],
 ['Underlayment','A protective layer on the deck, beneath the finished covering. It has a job and a limit. It is not a substitute for flashing at chimneys, walls and pipes.'],
 ['Flashing','Metal or membrane shaped to turn water away where the roof meets a wall, chimney or other interruption. The shape and the laps matter more than a bead of sealant.'],
 ['Drip edge','Metal at the eaves and rakes that helps water leave the edge instead of curling back onto the wood. It works with the gutter. It does not replace one.'],
 ['Valley','The inside corner where two slopes meet and a lot of water concentrates. The method used there should be in the specification, not left as a field habit.'],
 ['Pipe boot','The fitting that seals around a plumbing vent or similar pipe. A split or dried boot is a common, local leak point and a different scope from a whole-roof renewal.'],
 ['Ridge vent','An exhaust opening along the ridge, useful only if the rest of the path, including intake, can actually move air. A cap by itself is not a ventilation design.'],
 ['Soffit','The underside of the eave. Intake air often enters here, which is why painting it shut or packing it with insulation is a question for the whole assembly.'],
 ['Fascia','The board at the face of the eave, behind the gutter. A tired gutter often shares its story with a stained or soft fascia.']
];

export const aboutHtml=`
<section class="wrap split">
  <div class="panel"><p class="eyebrow">About · illustrative company</p><h1>Accountable for the whole exterior.</h1><p>Ridgeline Exterior Co. is a fictional studio used to show how a roof, a wall and an opening can be explained together. The standard in this demo is a written scope, a named coordinator and a documented handover. It is not a history, a license, or a count of real customers.</p></div>
  ${photo('ridge-cedar-aerial','Hill Country light on the demonstration house.',{eager:true,ratio:'16/9'})}
</section>
<section class="wrap subgrid">
  <article><h2>Written scope</h2><p>You receive observations, options and exclusions in words a homeowner can reread. A conversation in the driveway is not the record.</p></article>
  <article><h2>Named coordinator</h2><p>${TEAM[1]!.name} is the example contact for dates and changes. The role is illustrative. There is no promised response time.</p></article>
  <article><h2>Documented handover</h2><p>Photos, care notes and a walkthrough close the demonstration job. They are not a warranty certificate.</p></article>
</section>
<section class="wrap">
  <h2>Three ways the work is judged</h2>
  <div class="subgrid">
    <article>${photo('ridge-scope','Explaining a scope before recommending more work.',{ratio:'4/3'})}<h3>Explain before recommending</h3><p>Avery’s example is to show the south slope and the chimney as separate lines. A recommendation that skips the evidence is just a preference. The homeowner should be able to point at a photo and a sentence that belong together.</p></article>
    <article>${photo('ridge-home-prep','Furniture covered before work in an occupied room.',{ratio:'4/3'})}<h3>Protect the occupied home</h3><p>Jordan’s example sequence starts with tarps, plants and a clear drive before the first bundle hits the roof. An occupied house is not a vacant lot. Pets, naps and a kitchen that still has to function are part of the plan.</p></article>
    <article>${photo('ridge-trim-corner','A trim corner treated as finish work.',{ratio:'4/3'})}<h3>Finish the details</h3><p>Taylor’s example is the corner where siding, a window and the eave meet. A straight field of new material still fails if the joint sheds water into the wall. Details are the job, not a punch-list afterthought.</p></article>
  </div>
</section>
<section class="wrap">
  <h2>How the team works</h2>
  <div class="subgrid">
    <article>${photo('ridge-scope','Office preparation of the scope.',{ratio:'4/3'})}<h3>Office preparation</h3><p>Questions, photos the owner already has, and the service they asked about are gathered before the visit so the time on site is specific.</p></article>
    <article>${photo('ridge-inspect','Site assessment from the ground.',{ratio:'4/3'})}<h3>Site assessment</h3><p>Access, slopes and visible conditions are recorded. Unknowns are labeled as unknowns.</p></article>
    <article>${photo('ridge-install','Coordinated installation with harnesses.',{ratio:'4/3'})}<h3>Coordinated work</h3><p>The lead follows the scope and stops when a concealed condition changes it.</p></article>
    <article>${photo('ridge-cleanup','Follow-up and cleanup.',{ratio:'4/3'})}<h3>Follow-up</h3><p>The coordinator closes the notes: what was done, what was excluded, and how to raise a concern.</p></article>
  </div>
</section>
<section class="wrap reading"><h2>A note from the owner role</h2><p class="demo-inline">Illustrative note, not an interview with a real founder.</p>
<p>I would rather talk someone out of a full replacement when a flashing repair is the honest scope than win a larger job that the evidence does not support. Uncertainty belongs in the document. If we could not see the deck, we say we could not see the deck. If a chimney flue is outside our work, we say that before anyone treats a mortar joint as a safety clearance.</p>
<p>The fictional company is a way to practice that habit in public. It has no trading history to lean on, and it should not borrow one. Choose the work that fits the house in front of you, and leave room in the schedule for the day the house disagrees with the first look.</p></section>
<section class="wrap"><h2>The four people</h2><div class="team">${TEAM.map(member=>`<article>${photo(member.photo,member.name+', generated fictional portrait.',{ratio:'3/4'})}<h3>${member.name}</h3><p>${member.role}</p><p>${member.copy}</p></article>`).join('')}</div></section>
<section class="wrap"><h2>Quality evidence, not awards</h2><div class="subgrid">
  <article class="doc"><h3>Sample scope</h3><p>Cedar Bend south slope. Include: shingle field, drip edge, chimney flashing. Exclude: interior paint, gutter replacement unless listed. Allowance: deck repair if opened. No price. Not a contract.</p></article>
  <article>${photo('ridge-flashing','Annotated idea: stain beside chimney flashing.')}<h3>Annotated photo</h3><p>One marked condition, with a sentence. Not a certificate.</p></article>
  <article class="doc"><h3>Handover checklist</h3><ul><li>Photos of completed details</li><li>Debris walk</li><li>Exclusions reread</li><li>Care note</li><li>Who to contact</li></ul></article>
</div></section>
<section class="wrap subgrid">
  <article>${photo('ridge-inspect','Arrival.',{ratio:'4/3'})}<h3>Arrival</h3><p>You hear who is coming and which gate or drive they will use. The example does not promise a minute.</p></article>
  <article>${photo('ridge-home-prep','Protection.',{ratio:'4/3'})}<h3>Property protection</h3><p>Beds, vehicles and openings named in the scope are covered or kept clear.</p></article>
  <article>${photo('ridge-install','Checks.',{ratio:'4/3'})}<h3>Workmanship checks</h3><p>The lead looks at the work while it is open, against the specification, not against a slogan.</p></article>
  <article>${photo('ridge-cleanup','Cleanup.',{ratio:'4/3'})}<h3>Cleanup and follow-up</h3><p>A walk for nails and scraps, then a note of anything still open.</p></article>
</section>
<section class="wrap" data-ridge-stories><h2>The same scenarios as the home page</h2><div class="stories"><div>${STORIES.map((story,i)=>`<button type="button" class="ghost" data-story="${story.id}" aria-pressed="${i===0}">${story.service}</button>`).join('')}</div><div>${STORIES.map((story,i)=>`<blockquote data-story-panel="${story.id}" ${i?'hidden':''}><p>${story.quote}</p><footer>${story.name} · ${story.context}</footer></blockquote>`).join('')}</div></div></section>
<section class="wrap reading"><h2>Material stewardship</h2><p>Repair where a repair is honest. Specify materials with their actual upkeep. Plan disposal before tear-off so debris has a destination. Coordinate with the people already involved, including a designer or a specialist, instead of inventing a donation total or a carbon figure this company has not measured.</p><p><a class="action" href="@contact">Plan an inspection</a></p></section>`;

export const faqHtml=`
<section class="wrap split">
  <div><p class="eyebrow">FAQ</p><h1>Useful answers, with the limits attached.</h1><p class="lede">Nineteen questions a homeowner actually asks. They describe this demonstration and the decisions a real visit still has to make.</p><p><a class="action" href="@contact">Plan an inspection</a></p></div>
  <nav class="index" aria-label="FAQ groups"><a href="#estimates">Estimates</a><a href="#during">During work</a><a href="#understanding">The roof</a><a href="#storms">Storms</a><a href="#warranty">Warranty</a></nav>
</section>
${['estimates','Estimates','during','During work','understanding','Understanding the roof','storms','Storms and records','warranty','Warranty and follow-up'].reduce((html,item,index,arr)=>{if(index%2)return html;const id=arr[index],title=arr[index+1];return html+`<section class="wrap reading" id="${id}"><h2>${title}</h2>${faq.filter(row=>row[0]===id).map(([,qid,q,a])=>`<details id="${qid}"><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;},'')}
<section class="wrap" data-ridge-stories><h2>Scenarios, not a rating</h2><div class="controls">${STORIES.map((story,i)=>`<button type="button" class="ghost" data-story="${story.id}" aria-pressed="${i===0}">${story.name}</button>`).join('')}</div>${STORIES.map((story,i)=>`<blockquote data-story-panel="${story.id}" ${i?'hidden':''}><p>${story.quote}</p><footer>${story.context}. Illustrative, not a verified review.</footer></blockquote>`).join('')}</section>
<section class="wrap"><h2>Nine terms, one slope</h2>${glossaryDiagram}<div class="subgrid">${gloss.map(([term,copy],i)=>`<article><h3>${i+1}. ${term}</h3><p>${copy}</p></article>`).join('')}</div></section>`;

export const contactHtml=`
<section class="wrap contact-grid">
  <div>
    <p class="eyebrow">Contact · demonstration</p>
    <h1>Plan the inspection. Nothing is sent.</h1>
    <p>${BUSINESS.status}</p>
    <p>${BUSINESS.hours}</p>
    <p>Phone ${BUSINESS.phone} is fictional. Email ${BUSINESS.email} is not a working inbox. Buttons here do not dial or mail.</p>
    <div class="map">${areaMap}</div>
    <ul>${TOWNS.filter(t=>!t.startsWith('Other')).map(t=>`<li>${t}</li>`).join('')}</ul>
    <p>Other / ask about location is a real choice in the form. The list is not coverage and not a drive-time promise.</p>
    <p>People: ${TEAM.map(m=>m.name+' ('+m.role+')').join('; ')}.</p>
  </div>
  <form class="panel" data-ridge-form novalidate>
    <div data-ridge-errors class="error" role="alert" tabindex="-1" hidden></div>
    <div data-ridge-fields>
      <p>Use fictional details. The next step is a review on this page.</p>
      <button type="button" class="ghost" data-ridge-sample>Use sample details</button>
      <div class="pair">
        <label for="first"><span>First name</span><input id="first" name="first" autocomplete="given-name" required></label>
        <label for="last"><span>Last name</span><input id="last" name="last" autocomplete="family-name" required></label>
      </div>
      <div class="pair">
        <label for="phone"><span>Phone</span><input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+1 512 555 0199"></label>
        <label for="email"><span>Email</span><input id="email" name="email" type="email" autocomplete="email" placeholder="name@example.com"></label>
      </div>
      <p class="demo-inline">Provide a phone number or an email. If you enter both, both are checked. Address and details are optional.</p>
      <label for="address"><span>Home address</span><input id="address" name="address" autocomplete="street-address"></label>
      <div class="pair">
        <label for="town"><span>Town</span><select id="town" name="town" data-ridge-field="town">${opt(TOWNS,'Choose a town')}</select></label>
        <label for="service"><span>Service</span><select id="service" name="service" data-ridge-field="service">${opt(SERVICES,'Choose a service')}</select></label>
      </div>
      <label for="timeline"><span>Timeline</span><select id="timeline" name="timeline" data-ridge-field="timeline">${opt(TIMELINES,'Choose a timeline')}</select></label>
      <label for="details"><span>Additional details</span><textarea id="details" name="details"></textarea></label>
      <p data-ridge-summary></p>
      <button type="button" class="action" data-ridge-review-go>Review inspection request</button>
    </div>
    <section data-ridge-review hidden>
      <h2 tabindex="-1">Review the request</h2>
      <div data-ridge-review-body></div>
      <button type="button" class="ghost" data-ridge-edit>Edit</button>
      <button type="button" class="ghost" data-ridge-reset>Reset</button>
      <button type="button" class="action" data-ridge-confirm>Confirm demo</button>
    </section>
    <section data-ridge-done hidden tabindex="-1">
      <h2>Nothing was booked or sent</h2>
      <p>This confirmation stays in the browser. No appointment was reserved, no email was delivered, and no crew was dispatched.</p>
      <button type="button" class="ghost" data-ridge-reset>Reset</button>
    </section>
  </form>
</section>`;

export const privacyHtml=`
<section class="wrap reading">
  <p class="crumbs"><a href="@home">Home</a> / Privacy</p>
  <h1>Privacy for this demonstration</h1>
  <p>Revised 9 October 2026. This page describes the Ridgeline demo inside the Vitris theme library. It is not a privacy policy for a real roofing company.</p>
  <h2>What the form does</h2>
  <p>The contact form keeps names, phone numbers, email addresses and notes in memory on the page. Review, edit and reset happen locally. Confirming the demo does not transmit the form. There is no lead endpoint and no mailto action.</p>
  <h2>What persists</h2>
  <p>Personal fields are not written to persistent storage by this direction. Visit choices such as service, town, date and time may be held in the gallery’s in-memory handoff so they survive moving from the planner to this form. Reset clears that visit handoff for this demo.</p>
  <h2>Theme selection is separate</h2>
  <p>If you are choosing a visual direction in the library, the harness can save that choice and your notes through its own selection flow. That record is not the inspection form, and this demo does not write a theme preference for you.</p>
  <h2>Assets and the network</h2>
  <p>Photographs, fonts and scripts for Ridgeline are local files served with the library. The pages do not embed a booking service. Other parts of the harness may make network calls for their own features; this policy does not claim the entire application is offline in every mode. The portable gallery packages assets so a saved file can render without fetching them again.</p>
  <h2>Reset</h2>
  <p>Reset on the contact form clears the fields and the carried visit. It does not delete a saved theme choice elsewhere in the library.</p>
  <p><a href="@contact">Contact</a> · <a href="@terms">Terms</a></p>
</section>`;

export const termsHtml=`
<section class="wrap reading">
  <p class="crumbs"><a href="@home">Home</a> / Terms</p>
  <h1>Terms for this demonstration</h1>
  <p>Revised 9 October 2026. ${BUSINESS.name} is fictional. These terms explain the demo. They are not a construction contract, an estimate, or a warranty.</p>
  <h2>No appointments, quotes, or coverage</h2>
  <p>Nothing you click books a visit, accepts a price, or starts insurance paperwork. Sample line items in the journal have no binding price. The phone number and email address do not connect to a business.</p>
  <h2>Illustrative media</h2>
  <p>Photographs are generated demonstrations. Portraits are fictional representations, not identified real employees. Before-and-after pairs show a designed change of surface. They are not evidence of completed customer work. Diagrams are teaching drawings, not engineering documents.</p>
  <h2>Outside reading</h2>
  <p>Articles may point to Texas Department of Insurance pages and a Department of Energy window page so you can read the source. Those links are research, not an endorsement, and they are not legal advice. Insurance explanations on this site do not promise claim approval or a waived deductible.</p>
  <h2>Use of the pages</h2>
  <p>You may explore the nineteen routes as a design reference. The fictional sitemap, people and project names are not a template a customer site must copy. A future site should be written from that business’s own facts.</p>
  <p><a href="@contact">Contact</a> · <a href="@privacy">Privacy</a></p>
</section>`;
