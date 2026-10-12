import type {ThemeTokens} from '../types.ts';
import {asset} from './theme-assets.ts';
export type IdentityRoles={tokens:ThemeTokens;bodySize:string;mobileDisplay:string;readingMeasure:string;spacing:string;geometry:{controls:string;inputs:string;primaryPlane:string;exceptions:string};surfaceIntent:string;accentIntent:string;accentSelector:string;accentProperty:string;accentCss:string};
// Authored semantic roles taken from the compositions, not a uniqueness generator.
// The primary plane is separate from controls and image-mask exceptions.
const rows:Record<string,[string,string,string,string,string,string,string,string,string,string,string,string,string,string]>={
 'swiss-index':['#f4f4ed','#252c28','#ffffff','#e7e8df','#204b69','inter','inter','clamp(64px,7.8vw,126px)','55px','38ch','4rem','0','0','Register fields; thin rules and an enlarged sentence.'],
 'rail-atlas':['#e9e8df','#30382f','#f6f4eb','#dfe3d6','#94512d','inter','sourceserif4','58px','41px','49ch','4.5rem','0','0','Continuous open field with a persistent chapter margin.'],
 'technical-manual':['#edeedd','#27362c','#ffffff','#e3e5d5','#ba3d24','inter','inter','60px','40px','52ch','3rem','0','0','Dense figure plates, mono keys and flat printed sheets.'],
 'utility-directory':['#ffffff','#172923','#eef3ed','#e0e7e2','#225c91','atkinsonhyperlegiblenext','atkinsonhyperlegiblenext','67px','42px','62ch','3.5rem','0','0','High-contrast reading ground, familiar underlined task links.'],
 'literary-essay':['#f6f1e8','#383329','#fffaf2','#e5ded1','#8a392e','sourceserif4','sourceserif4','74px','45px','64ch','5rem','0','0','A sustained serif letter; broad pauses and one contextual inset.'],
 'newspaper':['#f4f1e9','#25251f','#fffdf7','#e7e2d6','#9c302b','inter','sourceserif4','clamp(50px,6vw,88px)','46px','49ch','3rem','0','0','Unequal columns and editorial hierarchy, ink-like rules.'],
 'annotated-journal':['#f3eee2','#34352b','#e7e4d7','#fffbf2','#8a4932','sourceserif4','sourceserif4','80px','49px','57ch','4rem','0','0','Parallel reading and evidence, narrow annotation scale.'],
 'quiet-folio':['#fafaf6','#30322c','#eeeae0','#ffffff','#795642','inter','inter','47px','38px','48ch','6rem','0','0','Exact object perimeters and unequal quiet intervals.'],
 'cinematic-panorama':['#eeeae1','#252c29','#222c27','#e2e0d6','#aa4828','inter','sourceserif4','clamp(70px,7vw,110px)','64px','48ch','6rem','0','0','Broad scenes alternate with sustained reading; local dark scene captions.'],
 'contact-sheet':['#f2f2eb','#28332b','#ffffff','#e7e7df','#365e91','inter','inter','72px','49px','53ch','4rem','0','0','Close caption matrix with major anchors and unboxed scope.'],
 'architectural-frame':['#eeede5','#303931','#f9f7ee','#dedfd6','#8c4a30','inter','sourceserif4','82px','49px','50ch','4.5rem','0','0','Ruled whole/plan/detail alignments and keyed frames.'],
 'immersive-exhibition':['#e7e7dc','#26342d','#f1eee3','#ccd3c5','#964630','inter','sourceserif4','80px','49px','48ch','6rem','0','0','Serial light/dark rooms; dark chapter is a deliberate local exception.'],
 'poster':['#fff8ed','#231b31','#ff643b','#ffdc43','#27359a','inter','oswald','clamp(140px,20vw,300px)','145px','46ch','3.5rem','0','0','One saturated type cover gives way to a quiet programme.'],
 'hard-edge':['#e9e8df','#1c211c','#f1f0e7','#d2d5c9','#a53421','inter','oswald','clamp(80px,10vw,160px)','70px','50ch','3rem','0','0','Heavy boundaries and abrupt scale keep assertion throughout.'],
 'modular-mosaic':['#e8e8dd','#263b2b','#f6f4e9','#d8dccb','#8d3a2d','inter','inter','74px','54px','42ch','3rem','0','0','Dense shared-edge modules with heterogeneous roles.'],
 'kinetic-type':['#19142f','#faf7ff','#3e2266','#d7fb55','#bdff53','inter','oswald','clamp(110px,16vw,250px)','110px','49ch','4rem','0','0','Three flat type states with high-contrast quiet passages; complete while static.'],
 'organic-studio':['#f4b9a4','#45251f','#fff1df','#d76645','#8b302a','atkinsonhyperlegiblenext','fraunces','clamp(70px,7.5vw,115px)','64px','49ch','5.5rem','8px','35px','Offset warm fields linked by one continuous contour.'],
 'paper-workshop':['#d9d6c9','#39392e','#f7f3e6','#c9d0b5','#9d432a','inter','fraunces','82px','52px','52ch','4.5rem','0','0','Role-based paper planes, restrained texture and folded samples.'],
 'botanical':['#edf2fa','#243957','#ffffff','#cddce9','#475887','inter','cormorantgaramond','118px','85px','51ch','6rem','0','0','Cool open specimen fields and fine observational lines.'],
 'playful-shapes':['#fff5c9','#242450','#ffb8cf','#7656de','#244dbe','atkinsonhyperlegiblenext','fraunces','86px','54px','40ch','4.5rem','8px','0','Discrete punchy shapes in open space; clear conventional controls.'],
 'formal-heritage':['#e6e8f0','#252842','#ffffff','#c8cfdf','#703a4b','inter','cormorantgaramond','98px','61px','57ch','5rem','0','0','Cool ceremonial symmetry, fine paired frames and left-aligned practical prose.'],
 'art-deco':['#e8e9df','#22342f','#ffffff','#dce2d8','#98602c','inter','limelight','clamp(75px,9vw,145px)','54px','50ch','4rem','0','0','Stepped frames and alternating tall/broad relationships on a light field.'],
 'soft-modern':['#e8edf3','#293a4a','#ffffff','#d7e2ec','#386087','atkinsonhyperlegiblenext','atkinsonhyperlegiblenext','73px','48px','50ch','5rem','28px','80px','Regular opaque blue-gray planes, generous curves and human-scale explanation.'],
 'luminous-digital':['#101c25','#e9f1ef','#203743','#172c37','#8ddcd0','inter','inter','79px','49px','50ch','4.5rem','0','0','Opaque dark reading ground and illuminated explanatory layers.'],
 'dispatch-board':['#ffffff','#15283e','#eef1f3','#15283e','#d54c19','ibmplexsans','barlowcondensed','clamp(66px,7vw,110px)','54px','48ch','3.5rem','0','0','Dense asymmetrical service lanes and a job ticket.'],
 'signwritten':['#f8e9b7','#4c1324','#6c1c2c','#fffbeb','#8b2439','inter','fraunces','clamp(70px,9vw,140px)','66px','46ch','3.5rem','0','0','Painted sign, straight tariff board and strong horizontal stripes.'],
 'fresh-routine':['#fff07a','#1e3153','#ffffff','#b3ddf2','#2557bb','atkinsonhyperlegiblenext','bricolagegrotesque','clamp(60px,6vw,92px)','49px','48ch','4.5rem','12px','0','Bright illustrated task fields meet open flat checklists.'],
 'open-door-care':['#ffffff','#18354b','#e4f2fa','#f5faff','#245b9c','atkinsonhyperlegiblenext','atkinsonhyperlegiblenext','clamp(48px,5vw,74px)','44px','56ch','5.5rem','6px','32px','Human introduction and a bright first-visit itinerary.'],
 'portrait-practice':['#f7f3fb','#39243f','#ffffff','#e7dced','#793a82','inter','sourceserif4','clamp(52px,5vw,80px)','46px','62ch','4.5rem','0','0','Off-center attributed portrait and closely set responsibility ledger.'],
 'project-evidence':['#f3f5f5','#293338','#ffffff','#dde4e5','#ac5c00','inter','ibmplexsans','clamp(48px,5vw,76px)','43px','55ch','4.5rem','0','0','Joined proposed-state spread, attached captions and a project log.'],
 'route-radius':['#efecfa','#22283f','#ffffff','#ded8ef','#3f48cf','inter','inter','clamp(56px,5.6vw,86px)','48px','50ch','4rem','0','0','Open schematic map followed by a compact route itinerary.'],
 'club-timetable':['#291c27','#fff8f4','#462631','#351f2c','#daef6a','inter','oswald','clamp(96px,12vw,184px)','82px','50ch','3.5rem','0','0','Hard track rules, dense weekly programme and a broad training scene.'],
 'treatment-menu':['#302036','#fff4f4','#fae9e9','#4c304b','#a55772','inter','cormorantgaramond','clamp(60px,6vw,94px)','58px','51ch','5rem','0','0','Dark book surround, opaque rose reading sheets and airy service rows.'],
 'field-season':['#f4f4e8','#173d33','#e3e9df','#b8d5d8','#9d462d','atkinsonhyperlegiblenext','robotoslab','clamp(54px,5.5vw,84px)','48px','53ch','4rem','0','0','Robust seasonal bands, annotated property zones and attached work notes.']
};
const accentRoles:Record<string,[string,string,string,string]>={
 'swiss-index':['.swiss-top','border-bottom-color','A register rule and enlarged decision phrase.','.swiss-top{border-bottom:5px solid var(--brand-original)}'],
 'rail-atlas':['.atlas-rail','border-left-color','The chapter rail marks where context stays.','.atlas-rail{border-left:6px solid var(--brand-original)}'],
 'technical-manual':['.manual-head','border-bottom-color','The keyed manual heading separates figure from procedure.','.manual-head{border-bottom:6px solid var(--brand-original)}'],
 newspaper:['.news-brand','border-bottom-color','An edition rule anchors the masthead and notices.','.news-brand{border-bottom:7px solid var(--brand-original)}'],
 'cinematic-panorama':['.cinema-nav','border-bottom-color','A navigation rule frames the encounter without tinting the scene.','.cinema-nav{border-bottom:6px solid var(--brand-original)}'],
 'architectural-frame':['.frame-head','border-bottom-color','The representation key is a precise frame rule.','.frame-head{border-bottom:6px solid var(--brand-original)}'],
 'quiet-folio':['.folio-head','border-bottom-color','One fine commissioning/index rule against quiet object fields.','.folio-head{border-bottom:5px solid var(--brand-original)}'],
 'contact-sheet':['.sheet-head','border-bottom-color','A collection register key separates studies from scope.','.sheet-head{border-bottom:6px solid var(--brand-original)}'],
 'immersive-exhibition':['.exhibit-head','border-bottom-color','The chapter navigation carries an accent key between rooms.','.exhibit-head{border-bottom:6px solid var(--brand-original)}'],
 'paper-workshop':['.paper-head','border-bottom-color','A restrained worktable registration edge.','.paper-head{border-bottom:6px solid var(--brand-original)}'],
 'luminous-digital':['.digital-head','border-bottom-color','A narrow illuminated service key, with accent around the workflow.','.digital-head{border-bottom:5px solid var(--brand-original)}.digital-system,.digital-onboarding-diagram{box-shadow:0 0 32px color-mix(in srgb,var(--brand-original) 25%,transparent)}']
};
const headers:Record<string,string>={'utility-directory':'.directory-head','literary-essay':'.essay-head','annotated-journal':'.journal-head',poster:'.poster-head','hard-edge':'.edge-nav','modular-mosaic':'.mosaic-head','kinetic-type':'.kinetic-head','organic-studio':'.organic-nav',botanical:'.botanical-head','playful-shapes':'.shapes-head','formal-heritage':'.heritage-head','art-deco':'.deco-nav','soft-modern':'.soft-head','dispatch-board':'.dispatch-head',signwritten:'.sign-head','fresh-routine':'.fresh-head','open-door-care':'.care-head','portrait-practice':'.practice-head','project-evidence':'.evidence-head','route-radius':'.route-head','club-timetable':'.club-head','treatment-menu':'.treatment-head','field-season':'.season-head'};
const font=(id:string)=>'"'+asset(id).family+'", '+asset(id).fallback;
export function identityRoles(id:string):IdentityRoles{
 const row=rows[id];if(!row)throw Error('Missing canonical identity '+id);
 const [bg,text,surface,surface2,accent,body,display,size,mobile,measure,rhythm,radius,plane,intent]=row;
 const [selector,property,accentIntent,accentCss]=accentRoles[id]||[headers[id]!,'border-bottom-color','The section/navigation key and service action carry the customer accent.',`${headers[id]}{border-bottom:5px solid var(--brand-original)}`];
 return {tokens:{colorBg:bg,colorText:text,colorMuted:text,colorSurface:surface,colorSurface2:surface2,colorBorder:text,colorAccent:accent,colorAccentText:'#ffffff',colorFocus:accent,fontBody:font(body),fontDisplay:font(display),radius,radiusLg:plane,radiusPill:radius,maxWidth:id==='literary-essay'?'70rem':id==='quiet-folio'?'82rem':'84rem',typeStep0:'.75rem',typeStep1:id==='open-door-care'?'1.1875rem':id==='dispatch-board'?'1.125rem':'1.0625rem',typeStep2:id==='literary-essay'?'1.375rem':'1.25rem',typeStep3:id==='technical-manual'?'1.5rem':'1.75rem',typeStep4:id==='poster'?'2rem':id==='soft-modern'?'2.9375rem':'2.5rem',typeStep5:size,sectionY:rhythm},bodySize:id==='open-door-care'?'19px':id==='dispatch-board'?'18px':'17px',mobileDisplay:mobile,readingMeasure:measure,spacing:`Customer-page starting cadence ${rhythm}; dense labels remain adjacent to their evidence. The shared authoredLayout main/interior rules give actual local spacing and responsive exceptions; do not flatten them into one interval.`,geometry:{controls:radius,inputs:id==='soft-modern'?'28px':id==='open-door-care'?'6px':id==='fresh-routine'?'12px':'0',primaryPlane:plane,exceptions:id==='organic-studio'?'Irregular 45%/55% masks and a continuous drawn contour; these are not control corners.':id==='playful-shapes'?'Circle, arch and step each have a role; media windows do not set every surface radius.':id==='soft-modern'?'Main primary plane80px desktop/40px mobile; interior summary70px/40px; secondary planes55px/35px; tactile image70px/40px.':id==='route-radius'?'Round map nodes; square route manifest.':id==='open-door-care'?'32px image thresholds; modest6px controls.':'Compositional drawings, local chapter fields and display-line breaks remain local, not global tokens.'},surfaceIntent:intent,accentIntent,accentSelector:selector,accentProperty:property,accentCss};
}
export function identityCss(id:string,tokens:ThemeTokens):string{
 const r=identityRoles(id),vars=Object.entries(tokens).map(([k,v])=>'--'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+':'+v).join(';');
 return `body{${vars};--reading-measure:${r.readingMeasure};--accent:${tokens.colorAccent};--on-accent:${tokens.colorAccentText};background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);font-size:${r.bodySize}}h1{font-family:var(--font-display)}body>main h1{font-size:var(--type-step5)}.enquiry textarea{border-radius:${r.geometry.inputs}}${r.accentCss}@media(max-width:700px){body>main h1{font-size:${r.mobileDisplay}}}`;
}

/** Bind genuine surface roles without changing authored local color distribution. */
export function identityCompositionCss(id:string,css:string):string{
 const r=identityRoles(id),colors:Record<string,string>={};
 for(const [value,key] of [[r.tokens.colorBg,'color-bg'],[r.tokens.colorText,'color-text'],[r.tokens.colorSurface,'color-surface'],[r.tokens.colorSurface2,'color-surface2']] as const)if(!colors[value.toLowerCase()])colors[value.toLowerCase()]=key;
 return css.replace(/#[a-f0-9]{6}(?![a-f0-9])/gi,value=>colors[value.toLowerCase()]?'var(--'+colors[value.toLowerCase()]+')':value);
}
