import {identityRoles} from './theme-identity.ts';
import {suite} from './theme-suites.ts';
/** Canonical suite roles. Local relationships remain in the selected authored CSS record. */
export function suiteIdentityRoles(id:string){
 const r=identityRoles(id),s=suite(id),root=s.css.match(new RegExp('\\.suite-'+id+'\\s*\\{([^}]+)\\}'))?.[1]||'';
 const value=(key:string)=>root.match(new RegExp('(?:^|;)\\s*'+key+':([^;]+)'))?.[1]?.trim();
 const display=[...s.css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].find(m=>m[1]!.includes('h1')&&/(?:^|;)font-size:/.test(m[2]!))?.[2]?.match(/(?:^|;)font-size:([^;]+)/)?.[1];
 const planes:Record<string,string>={'modular-mosaic':'18px','organic-studio':'4px','soft-modern':'30px','luminous-digital':'14px','open-door-care':'20px'};
 const tokens={...r.tokens,colorBg:value('background')||r.tokens.colorBg,colorText:value('color')||r.tokens.colorText,typeStep5:display?.replace(/!important/g,'')||r.tokens.typeStep5,radiusLg:planes[id]||r.tokens.radiusLg};
 const mobile:Record<string,string>={poster:'64px','kinetic-type':'72px','hard-edge':'64px','club-timetable':'66px','botanical':'57px','art-deco':'44px'};
 tokens.colorMuted=tokens.colorText;tokens.colorBorder=tokens.colorText;return {...r,tokens,mobileDisplay:mobile[id]||r.mobileDisplay,geometry:{...r.geometry,primaryPlane:tokens.radiusLg,exceptions:'Preserve the selected authored five-page layout rules, including image arches, paper tags, scene fields and responsive local geometry; none defines a universal control radius.'},spacing:`Starting section cadence ${tokens.sectionY}. Use the selected authored page rules for actual density, reading intervals, local gutters and mobile stacking.`,surfaceIntent:r.surfaceIntent+' The five-page suite records current body and local surface roles.',accentIntent:'The exact customer color marks the suite navigation threshold and current-page key, then the direction’s service, record, diagram or enquiry roles. Use its contrast-safe companion for filled actions.',accentSelector:'.suite-head',accentProperty:'border-top-color',accentCss:'.suite-head{border-top:7px solid var(--brand-original)}'};
}
