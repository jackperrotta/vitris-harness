import type {VisualTheme} from '../../theme-library.ts';
import type {IndustrySite} from '../types.ts';
import {asset,ALL_THEME_ASSETS} from '../../theme-assets.ts';
import {MANIFEST_VERSION} from '../../theme-page-manifest.ts';
import {authoredLayoutRoles} from '../../theme-layout-roles.ts';
import {INDUSTRY_SCRIPT} from '../interactions.ts';
import {INDUSTRY_BASE_CSS,SEVEN_LOCKUP_CSS} from '../render-style.ts';
import {RIDGE_SCRIPT} from './script.ts';
export const RIDGELINE_RELEASE='2026-10-09.3';

export function ridgelineTheme(spec:IndustrySite,digest:(value:unknown)=>string):VisualTheme{
  const home=spec.pages.find(page=>page.compareRole==='home')!;
  const css=INDUSTRY_BASE_CSS+spec.css+SEVEN_LOCKUP_CSS;
  const chrome=spec.pages.map(page=>spec.renderBody({page,pages:spec.pages,href:id=>'@'+id,logoHtml:'[LOGO]',brandName:'[BRAND]',main:'[PAGE CONTENT]',returnUrl:'/'}));
  const media=ALL_THEME_ASSETS.filter(item=>spec.pages.some(page=>page.html.includes('/theme-assets/'+item.sha256+'/'+item.file))||spec.fonts.includes(item.id));
  const fonts=spec.fonts.map(id=>asset(id));
  const identity=[MANIFEST_VERSION,spec.pages,chrome,css,spec.tokens,INDUSTRY_SCRIPT,RIDGE_SCRIPT,media.map(item=>[item.id,item.sha256,item.bytes]),fonts];
  return {
    id:spec.id,release:RIDGELINE_RELEASE,name:spec.name,family:spec.family,description:spec.summary,tokens:spec.tokens,
    semantic:{
      bodySize:'18px',mobileDisplay:'40px to 52px',readingMeasure:'68ch',spacing:spec.tokens.sectionY||'4.5rem',
      geometry:{controls:spec.tokens.radiusPill,inputs:'12px',primaryPlane:spec.tokens.radiusLg,exceptions:spec.geometry},
      surfaceIntent:spec.summary,
      accentIntent:'Keep the exact customer color on the site-header key. Use a contrast-safe companion on filled actions. Copper decorative marks stay local and do not recolor every surface.',
      accentSelector:'.site-head',accentProperty:'box-shadow',
      authoredLayout:authoredLayoutRoles(spec.id,{css,pages:Object.fromEntries(spec.pages.map(page=>[page.pageId,page.html])),scoped:true})
    },
    principles:[...spec.principles,'Typography: Source Sans 3 roman, semibold and italic; no synthetic italic.'],
    image:spec.image,geometry:spec.geometry,responsive:spec.responsive,
    sources:['docs/plans/apex-inspired-template-plan-2026-10-09.md','https://www.tdi.texas.gov/tips/replacing-your-roof.html','https://www.tdi.texas.gov/consumer/claimtips.html','https://www.energy.gov/energysaver/window-types-and-technologies'],
    neighbors:[],
    motion:'Static reading first. Comparison, calendar and menu motion are user-operated. Reduced motion removes transitions and keeps every stage readable.',
    freedoms:'Transfer the photographic, documentary grammar: type, warm material palette, project evidence and decision tools. Author the customer’s own routes, facts, people and media. Do not copy this nineteen-page fictional sitemap.',
    brandRule:'Keep original logo bytes and aspect ratio. Customer color marks the header key. Filled actions use a contrast-safe companion.',
    license:'Original Vitris copy, SVG diagrams and interactions. Generated demonstration photographs and fictional portraits. Source Sans 3 under the SIL Open Font License. No publisher template code, photographs or logos.',
    specimens:{main:digest([identity,home.pageId]),interior:digest(identity)},
    assetIdentity:digest(media.map(item=>[item.id,item.sha256])),
    fontAssets:fonts.map(item=>({family:item.family!,file:item.file,sha256:item.sha256,weights:item.weights!,licenseFile:item.licenseFile!}))
  };
}
