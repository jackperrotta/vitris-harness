import {createHash} from 'node:crypto';
import type {CompareRole} from '../../theme-page-manifest.ts';
import type {IndustryPage,IndustrySite,ChromeCtx} from '../types.ts';
import {footLinks} from '../markup.ts';
import {photo} from './photo.ts';
import {RIDGE_CSS} from './style.ts';
import {RIDGE_SCRIPT} from './script.ts';
import {homeHtml} from './pages/home.ts';
import {servicesHtml,roofingHtml,guttersHtml,sidingHtml,windowsHtml,masonryHtml} from './pages/services.ts';
import {aboutHtml,faqHtml,contactHtml,privacyHtml,termsHtml} from './pages/company.ts';
import {journalHtml,articleHtml} from './pages/journal.ts';
import {BUSINESS} from './facts.ts';

function page(pageId:string,path:string,label:string,compareRole:CompareRole|null,group:string,html:string,previewPriority:number):IndustryPage{
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  return {pageId,path,label,role:compareRole||'support',compareRole,group,html,featured:previewPriority<5,previewPriority,contentIdentity:hash(html),assetIdentity:hash([...html.matchAll(/\/theme-assets\/([a-f0-9]{64})\/([\w.-]+)/g)].map(match=>match[0]).sort().join('\n'))};
}

const pages:IndustryPage[]=[
  page('home','/','Home','home','Site',homeHtml,0),
  page('services','/services','Services','browse','Services',servicesHtml,1),
  page('roofing','/services/roofing','Roofing','detail','Services',roofingHtml,2),
  page('gutters','/services/gutters','Gutters','detail','Services',guttersHtml,6),
  page('siding','/services/siding','Siding','detail','Services',sidingHtml,7),
  page('windows','/services/windows','Windows','detail','Services',windowsHtml,8),
  page('masonry','/services/masonry','Masonry','detail','Services',masonryHtml,9),
  page('about','/about','About','trust','Company',aboutHtml,3),
  page('journal','/journal','Journal','browse','Journal',journalHtml,10),
  page('faq','/faq','FAQ','trust','Company',faqHtml,11),
  page('contact','/contact','Contact','conversion','Company',contactHtml,4),
  page('guide-roof-cost','/journal/understanding-a-roof-estimate','Understanding a roof estimate','detail','Journal',articleHtml('guide-roof-cost'),12),
  page('guide-hail','/journal/after-a-hailstorm','After a hailstorm','detail','Journal',articleHtml('guide-hail'),13),
  page('guide-insurance','/journal/roof-damage-and-insurance','Roof damage and insurance','detail','Journal',articleHtml('guide-insurance'),14),
  page('guide-repair','/journal/repair-or-replacement','Repair or replacement','detail','Journal',articleHtml('guide-repair'),15),
  page('guide-duration','/journal/planning-for-roof-work','Planning for roof work','detail','Journal',articleHtml('guide-duration'),16),
  page('guide-contractor','/journal/questions-for-your-contractor','Questions for your contractor','detail','Journal',articleHtml('guide-contractor'),17),
  page('privacy','/legal/privacy','Privacy',null,'Legal',privacyHtml,18),
  page('terms','/legal/terms','Terms',null,'Legal',termsHtml,19)
];

const serviceIds=['services','roofing','gutters','siding','windows','masonry'];

function renderBody(ctx:ChromeCtx){
  const href=ctx.href;
  const current=ctx.page.pageId;
  const link=(id:string,label:string)=>`<a href="${href(id)}" data-page-id="${id}"${id===current?' aria-current="page"':''}>${label}</a>`;
  const onService=serviceIds.includes(current);
  return `<div class="ridge s7">
  <header class="site-head">
    <a class="lockup brandlock" href="${href('home')}" data-page-id="home" aria-label="${ctx.brandName} home">${ctx.logoHtml}<strong class="wordmark">Ridgeline</strong></a>
    <nav class="desk-nav" aria-label="Main">
      <details class="services-disclosure" data-ridge-services>
        <summary ${onService?'aria-current="page"':''}>Services</summary>
        <div class="services-panel">${serviceIds.map(id=>link(id,pages.find(p=>p.pageId===id)!.label)).join('')}</div>
      </details>
      ${link('about','About')}${link('journal','Journal')}${link('faq','FAQ')}${link('contact','Contact')}
    </nav>
    <a class="action plan" href="${href('contact')}" data-page-id="contact" data-ridge-continue>Plan an inspection</a>
    <button type="button" class="ghost menu-open" data-ridge-menu aria-haspopup="dialog" aria-controls="ridge-menu">Menu</button>
    <details class="nav-fallback"><summary>Menu</summary><div class="services-panel">${pages.filter(p=>['Site','Services','Company','Journal','Legal'].includes(p.group)).map(p=>link(p.pageId,p.label)).join('')}</div></details>
  </header>
  <dialog id="ridge-menu" aria-label="Site menu">
    <button type="button" class="ghost" data-ridge-close>Close</button>
    <h2>Services</h2>
    ${serviceIds.map(id=>link(id,pages.find(p=>p.pageId===id)!.label)).join('')}
    <h2>Company</h2>
    ${['about','faq','contact'].map(id=>link(id,pages.find(p=>p.pageId===id)!.label)).join('')}
    <h2>Journal</h2>
    ${link('journal','Journal')}
    <p><a class="action" href="${href('contact')}" data-page-id="contact">Plan an inspection</a></p>
  </dialog>
  <main id="main">${ctx.main}</main>
  <footer>
    <div class="wrap">
      <div class="foot-sheet">
        ${photo('ridge-cedar-elevation','Cedar Bend elevation.',{eager:true})}
        ${photo('ridge-gutter-after','East eave gutter.',{eager:true})}
        ${photo('ridge-siding-after','Oak Shade siding.',{eager:true})}
        <div class="extra">${photo('ridge-window-out','South window.',{eager:true})}</div>
        <div class="extra">${photo('ridge-chimney','Cedar Bend chimney.',{eager:true})}</div>
      </div>
      <p class="closing">Bring the questions. Leave with a scope.</p>
      <p>An inspection is a record of what the exterior is doing. ${BUSINESS.status}</p>
      <p><a class="action" href="${href('contact')}" data-page-id="contact" data-ridge-continue>Plan an inspection</a></p>
      <p class="closing" aria-hidden="true">Ridgeline</p>
      <nav class="foot-nav" aria-label="Footer">${footLinks(ctx.pages,current,href)}</nav>
      <p>${BUSINESS.phone} · ${BUSINESS.email} · ${BUSINESS.hours}</p>
      <p><a href="${href('privacy')}" data-page-id="privacy">Privacy</a> · <a href="${href('terms')}" data-page-id="terms">Terms</a></p>
      ${ctx.returnUrl?`<p><a href="${ctx.returnUrl}" target="_top">Return to directions</a></p>`:''}
      <small class="demo-inline">Illustrative business. Generated photographs. Requests stay in this browser.</small>
    </div>
  </footer>
  </div>`;
}

export const RIDGELINE:IndustrySite={
  id:BUSINESS.id,
  name:'Ridgeline',
  business:BUSINESS.name,
  audience:'Homeowners comparing roof and exterior work',
  summary:'A warm photographic exterior-services direction with nineteen pages: seventeen substantive pages and two support pages. Project evidence, service decisions and a local inspection planner stay specific to the demonstration company.',
  industry:'Roofing & exteriors',
  family:'Spatial & Photographic',
  identities:['Warm','Direct','Rugged'],
  fonts:['sourcesans3','sourcesans3italic'],
  tokens:{
    colorBg:'#F4F1E8',colorText:'#182C26',colorMuted:'#243E36',colorAccent:'#7A3414',colorAccentText:'#FFF8F2',
    colorSurface:'#E3E8DA',colorSurface2:'#F7F4EC',colorBorder:'#182C26',colorFocus:'#7A3414',
    fontBody:'"Source Sans 3", Arial, sans-serif',fontDisplay:'"Source Sans 3", Arial, sans-serif',
    radius:'18px',radiusLg:'28px',radiusPill:'999px',maxWidth:'1180px',typeStep1:'1.125rem',typeStep5:'clamp(40px, 6vw, 92px)',sectionY:'4.5rem'
  },
  css:RIDGE_CSS,
  image:'Generated documentary photographs of one limestone ranch, a fiber-cement house, matched before-and-after pairs, and four fictional portraits. Diagrams are original SVG.',
  geometry:'Parchment fields, 28px primary planes, 18px photographs, capsule actions, and a dark contact workspace.',
  responsive:'Headers stay near 72px. Service previews become a labeled rail. Comparisons stack. The menu is a dialog. Calendar stages stack.',
  principles:[
    'Open on a specific house and a service choice, not a centered slogan.',
    'Keep roof, gutter, wall, window and masonry evidence distinct.',
    'Make repair, replacement and maintenance comparable without attacking unnamed competitors.',
    'Treat the inspection planner and contact review as a local demonstration that books nothing.'
  ],
  pages,
  script:RIDGE_SCRIPT,
  renderBody
};
