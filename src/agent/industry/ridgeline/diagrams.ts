const label=(x:number,y:number,n:string,text:string)=>`<g><circle cx="${x}" cy="${y}" r="14" fill="#8C3E16"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="#FFF8F2" font-size="14">${n}</text><text x="${x+22}" y="${y+5}" fill="#182C26" font-size="16">${text}</text></g>`;

export const roofSystem=`<svg viewBox="0 0 960 460" role="img" aria-labelledby="roof-system-title roof-system-desc"><title id="roof-system-title">Roof as a system</title><desc id="roof-system-desc">A cutaway of one residential slope showing deck, protective layers, edge drainage, the roof covering, and ventilation and flashing.</desc>
<rect width="960" height="460" fill="#E7EDE0"/>
<path d="M70 300 L470 120 L890 300" fill="#F4F1E8" stroke="#182C26" stroke-width="3"/>
<path d="M120 286 L470 150 L820 286 L780 310 L470 190 L160 310 Z" fill="#C4B49A"/>
<path d="M150 292 L470 175 L790 292" fill="none" stroke="#8C3E16" stroke-width="8"/>
<path d="M160 300 L470 188 L780 300 L760 318 L470 210 L180 318 Z" fill="#6E6254"/>
<rect x="150" y="318" width="640" height="18" fill="#314940"/>
<path d="M760 300 v70 h-28 v-48" fill="none" stroke="#8C3E16" stroke-width="8"/>
<rect x="430" y="168" width="70" height="36" fill="#D7D1C4" stroke="#182C26"/>
${label(180,380,'1','Deck')}
${label(400,400,'2','Protective layers')}
${label(690,390,'3','Edge drainage')}
${label(250,70,'4','Roof covering')}
${label(620,70,'5','Ventilation and flashing')}
</svg>`;

export const junctionDiagram=`<svg viewBox="0 0 760 360" role="img" aria-labelledby="junction-title junction-desc"><title id="junction-title">Where the roof meets other parts</title><desc id="junction-desc">The same five-part vocabulary, drawn at a chimney and an eave instead of as a whole-roof poster.</desc>
<rect width="760" height="360" fill="#F4F1E8"/>
<path d="M40 250 H420 L520 160 H720" fill="none" stroke="#182C26" stroke-width="8"/>
<rect x="470" y="70" width="90" height="120" fill="#D9D2C3" stroke="#182C26"/>
<path d="M455 175 h120 l-14 22 h-92 z" fill="#8C3E16"/>
<text x="40" y="40" fill="#182C26" font-size="18">1 Deck under the slope</text>
<text x="40" y="70" fill="#182C26" font-size="18">2 Protective layers stop where metal begins</text>
<text x="40" y="100" fill="#182C26" font-size="18">3 Edge drainage continues past the wall</text>
<text x="40" y="130" fill="#182C26" font-size="18">4 Covering laps over the flashing</text>
<text x="40" y="160" fill="#182C26" font-size="18">5 Flashing turns up the chimney</text>
</svg>`;

export const drainageDiagram=`<svg viewBox="0 0 860 280" role="img" aria-labelledby="drain-title drain-desc"><title id="drain-title">A route for rain</title><desc id="drain-desc">Water moves from the roof edge into a gutter, down a downspout, and to a discharge point that depends on the site.</desc>
<rect width="860" height="280" fill="#E7EDE0"/>
<path d="M40 80 H250" stroke="#182C26" stroke-width="10"/>
<path d="M250 80 H520" stroke="#8C3E16" stroke-width="14"/>
<path d="M520 80 V190" stroke="#8C3E16" stroke-width="12"/>
<path d="M520 190 H760" stroke="#314940" stroke-width="8" stroke-dasharray="8 6"/>
<text x="40" y="60" fill="#182C26" font-size="16">Roof edge</text>
<text x="300" y="60" fill="#182C26" font-size="16">Gutter</text>
<text x="540" y="140" fill="#182C26" font-size="16">Downspout</text>
<text x="560" y="230" fill="#182C26" font-size="16">Discharge, chosen for the site</text>
</svg>`;

export const wallDiagram=`<svg viewBox="0 0 640 360" role="img" aria-labelledby="wall-title wall-desc"><title id="wall-title">Wall and opening interface</title><desc id="wall-desc">A simple section showing cladding, a drainage plane, trim, and the window opening. It is not a universal installation drawing.</desc>
<rect width="640" height="360" fill="#F4F1E8"/>
<rect x="80" y="40" width="70" height="280" fill="#C9BBA4" stroke="#182C26"/>
<rect x="150" y="40" width="28" height="280" fill="#8C3E16"/>
<rect x="178" y="40" width="90" height="280" fill="#D5D8CC" stroke="#182C26"/>
<rect x="300" y="90" width="180" height="140" fill="#E7EDE0" stroke="#182C26" stroke-width="6"/>
<text x="80" y="350" fill="#182C26" font-size="15">Sheathing</text>
<text x="300" y="70" fill="#182C26" font-size="16">Opening and trim</text>
<text x="178" y="350" fill="#182C26" font-size="15">Cladding</text>
</svg>`;

export const windowOps=`<svg viewBox="0 0 840 280" role="img" aria-labelledby="win-title win-desc"><title id="win-title">Three ways a window operates</title><desc id="win-desc">Double-hung sashes move up and down. A casement swings outward. A picture window is fixed.</desc>
<rect width="840" height="280" fill="#E7EDE0"/>
<g><rect x="40" y="40" width="200" height="180" fill="#F4F1E8" stroke="#182C26" stroke-width="4"/><path d="M40 130 H240" stroke="#182C26" stroke-width="4"/><text x="40" y="250" fill="#182C26" font-size="16">Double-hung</text></g>
<g><rect x="320" y="40" width="200" height="180" fill="#F4F1E8" stroke="#182C26" stroke-width="4"/><path d="M330 50 L500 130 L330 210" fill="none" stroke="#8C3E16" stroke-width="4"/><text x="320" y="250" fill="#182C26" font-size="16">Casement</text></g>
<g><rect x="600" y="40" width="200" height="180" fill="#D7E0EA" stroke="#182C26" stroke-width="4"/><text x="600" y="250" fill="#182C26" font-size="16">Picture</text></g>
</svg>`;

export const glossaryDiagram=`<svg viewBox="0 0 980 520" role="img" aria-labelledby="gloss-title gloss-desc"><title id="gloss-title">Nine roof terms on one slope</title><desc id="gloss-desc">Decking, underlayment, flashing, drip edge, valley, pipe boot, ridge vent, soffit and fascia, each marked once.</desc>
<rect width="980" height="520" fill="#E7EDE0"/>
<path d="M80 360 L360 140 L700 300 L860 250" fill="#F4F1E8" stroke="#182C26" stroke-width="3"/>
<path d="M120 340 L360 175 L640 292" fill="none" stroke="#8C3E16" stroke-width="6"/>
<rect x="300" y="250" width="120" height="16" fill="#314940"/>
<rect x="500" y="210" width="36" height="48" fill="#D9D2C3" stroke="#182C26"/>
<circle cx="430" cy="230" r="16" fill="#8C3E16"/>
<text x="40" y="40" fill="#182C26" font-size="16">1 Decking  2 Underlayment  3 Flashing  4 Drip edge  5 Valley</text>
<text x="40" y="68" fill="#182C26" font-size="16">6 Pipe boot  7 Ridge vent  8 Soffit  9 Fascia</text>
<path d="M360 140 v-30" stroke="#182C26"/><text x="300" y="100" fill="#182C26" font-size="14">7 Ridge vent</text>
<text x="80" y="400" fill="#182C26" font-size="14">1–2 Layers in the slope</text>
<text x="360" y="430" fill="#182C26" font-size="14">5 Valley between slopes</text>
<text x="700" y="400" fill="#182C26" font-size="14">8 Soffit under the eave · 9 Fascia at the face · 4 Drip edge</text>
<text x="430" y="210" fill="#FFF8F2" font-size="12" text-anchor="middle">6</text>
<text x="500" y="200" fill="#182C26" font-size="14">3 Flashing</text>
</svg>`;

export const rolesDiagram=`<svg viewBox="0 0 900 220" role="img" aria-labelledby="roles-title roles-desc"><title id="roles-title">Three roles around a roof claim</title><desc id="roles-desc">The owner holds the policy. The insurer decides coverage. The contractor can document observations and a repair scope.</desc>
<rect width="900" height="220" fill="#F4F1E8"/>
<g><rect x="20" y="30" width="270" height="160" fill="#E7EDE0" stroke="#182C26"/><text x="40" y="70" fill="#182C26" font-size="20">Owner</text><text x="40" y="110" fill="#182C26" font-size="15">Policy, notice, deductible</text></g>
<g><rect x="315" y="30" width="270" height="160" fill="#E7EDE0" stroke="#182C26"/><text x="335" y="70" fill="#182C26" font-size="20">Insurer</text><text x="335" y="110" fill="#182C26" font-size="15">Coverage decision</text></g>
<g><rect x="610" y="30" width="270" height="160" fill="#E7EDE0" stroke="#8C3E16"/><text x="630" y="70" fill="#182C26" font-size="20">Contractor</text><text x="630" y="110" fill="#182C26" font-size="15">Observations and scope</text></g>
</svg>`;

export const scheduleDiagram=`<svg viewBox="0 0 920 160" role="img" aria-labelledby="sched-title sched-desc"><title id="sched-title">Five planning stages</title><desc id="sched-desc">Scope, access, protection, installation checks, and handover. Weather and discoveries can change the sequence.</desc>
${['Scope','Access','Protection','Install','Handover'].map((name,i)=>`<g><rect x="${20+i*180}" y="30" width="160" height="90" fill="${i%2?'#E7EDE0':'#F4F1E8'}" stroke="#182C26"/><text x="${36+i*180}" y="82" fill="#182C26" font-size="18">${i+1} ${name}</text></g>`).join('')}
</svg>`;

export const areaMap=`<svg viewBox="0 0 640 420" role="img" aria-labelledby="area-title area-desc"><title id="area-title">Example Hill Country towns</title><desc id="area-desc">Six illustrative town names. This drawing is not a coverage map and does not promise a response time.</desc>
<rect width="640" height="420" fill="#1B312B"/>
<text x="32" y="48" fill="#F4F1E8" font-size="18">Illustrative list only</text>
${[['Dripping Springs',80,120],['Wimberley',250,160],['Blanco',120,240],['Johnson City',300,250],['Fredericksburg',180,330],['Kerrville',400,140]].map(([name,x,y])=>`<g><circle cx="${x}" cy="${y}" r="8" fill="#E0A06A"/><text x="${Number(x)+16}" y="${Number(y)+5}" fill="#F4F1E8" font-size="16">${name}</text></g>`).join('')}
</svg>`;
