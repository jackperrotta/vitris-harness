export const RIDGE_CSS=`
.ridge{--paper:#F4F1E8;--ink:#182C26;--moss:#E3E8DA;--copper:#8C3E16;--copper-soft:#BA642F;--limestone:#E7E1D4;--line:#C9C2B2;color:var(--ink);background:var(--paper);font-family:"Source Sans 3",var(--font-body),Arial,sans-serif;font-size:18px;line-height:1.65}
.ridge h1,.ridge h2,.ridge h3,.ridge .wordmark{font-family:"Source Sans 3",var(--font-display),Arial,sans-serif;font-weight:650;letter-spacing:-.03em;line-height:1.05}
.ridge h1{font-size:clamp(40px,6vw,92px);max-width:14ch;margin:0 0 16px}
.ridge h2{font-size:clamp(32px,3.4vw,52px);margin:0 0 12px}
.ridge h3{font-size:26px;margin:0 0 8px}
.ridge p{margin:0 0 14px}
.ridge em{font-style:italic}
.ridge a{color:inherit}
.ridge .wrap{width:min(1180px,calc(100% - 40px));margin-inline:auto}
.ridge .eyebrow{font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;margin:0 0 10px}
.ridge .lede{font-size:21px;max-width:62ch}
.ridge .action,.ridge button.action{min-height:48px;padding:12px 18px;border-radius:999px;background:var(--color-accent);color:var(--color-accent-text);text-decoration:none;border:0;display:inline-flex;align-items:center;justify-content:center;font-weight:650}
.ridge .textish{min-height:48px;display:inline-flex;align-items:center;text-underline-offset:4px}
.ridge .site-head{min-height:64px;height:72px;display:flex;align-items:center;gap:16px;padding:0 22px;background:var(--paper);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.ridge .brandlock{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0;white-space:nowrap}
.ridge .wordmark{font-size:22px;margin:0}
.ridge .desk-nav{display:flex;gap:8px;align-items:center;margin-left:auto}
.ridge .desk-nav a,.ridge summary{min-height:44px;display:inline-flex;align-items:center;padding:0 8px;text-decoration:none}
.ridge a[aria-current=page],.ridge summary[aria-current=page]{box-shadow:inset 0 -3px 0 var(--brand-original)}
.ridge .services-disclosure{position:relative}
.ridge .services-disclosure summary{cursor:pointer;list-style:none}
.ridge .services-disclosure summary::-webkit-details-marker{display:none}
.ridge .services-panel{position:absolute;top:100%;left:0;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:10px;min-width:220px;display:grid;box-shadow:0 12px 30px #182C2618}
.ridge .services-panel a{padding:8px 10px;border-radius:10px}
.ridge .menu-open,.ridge .nav-fallback{display:none}
.ridge .hero{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:32px;align-items:end;padding:28px 0 10px}
.ridge .hero h1{max-width:11ch}
.ridge .visit-card,.ridge .panel,.ridge .doc{background:var(--moss);border-radius:28px;padding:18px}
.ridge .visit-card label,.ridge form label{display:grid;gap:6px;font-weight:650;margin:0 0 12px}
.ridge input,.ridge select,.ridge textarea{min-height:48px;border:1px solid var(--ink);border-radius:12px;background:#fff;color:var(--ink);padding:10px 12px;width:100%}
.ridge textarea{min-height:120px}
.ridge .photo{margin:0}
.ridge .photo img{width:100%;height:auto;object-fit:cover;border-radius:18px;display:block;background:#ddd}
.ridge figcaption{font-size:14px;padding-top:8px;max-width:68ch}
.ridge figcaption small{display:block;opacity:.8}
.ridge .note{margin-top:-28px;margin-left:16px;position:relative;background:var(--paper);border-radius:16px;padding:12px 14px;max-width:280px;border:1px solid var(--line)}
.ridge section{padding:42px 0}
.ridge .system{display:grid;grid-template-columns:1.4fr .8fr;gap:28px;align-items:center}
.ridge .system svg,.ridge .doc svg,.ridge .map svg{width:100%;height:auto;border-radius:18px}
.ridge .rail-head,.ridge .split,.ridge .two,.ridge .pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.ridge .rail-track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,32%);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
.ridge .rail-track article{scroll-snap-align:start;background:var(--limestone);border-radius:22px;padding:12px}
.ridge .controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ridge .ghost{min-height:44px;border-radius:999px;border:1px solid currentColor;background:transparent;padding:8px 14px}
.ridge .evidence{display:grid;grid-template-columns:1.3fr .7fr .7fr;gap:12px}
.ridge .evidence .stack{display:grid;gap:12px}
.ridge .stage-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.ridge .stage-tabs button[aria-selected=true]{background:var(--ink);color:var(--paper)}
.ridge .ba-stage{position:relative;border-radius:22px;overflow:hidden}
.ridge .ba-stage img{width:100%;height:auto;display:block;border-radius:0}
.ridge .ba-top{position:absolute;inset:0 auto 0 0;overflow:hidden;width:50%;border-right:3px solid #fff}
.ridge .ba-top img{position:absolute;left:0;top:0;height:100%;max-width:none;width:var(--ba-w,100%);object-fit:cover}
.ridge .ba input[type=range]{width:100%;margin-top:8px}
.ridge .ba-picks{display:flex;gap:8px;flex-wrap:wrap}
.ridge .stories{display:grid;grid-template-columns:220px 1fr;gap:18px}
.ridge table{width:100%;border-collapse:collapse}
.ridge th,.ridge td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid var(--line)}
.ridge details{border-top:1px solid var(--line);padding:8px 0}
.ridge summary{cursor:pointer;font-weight:650}
.ridge .planner{display:grid;grid-template-columns:1fr 1.1fr .9fr;gap:16px}
.ridge .cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.ridge .cal button{min-height:44px;border:0;background:transparent;border-radius:10px}
.ridge .cal button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.ridge .cal button:disabled{opacity:.35}
.ridge .cal .hold{background:#E7D3C4}
.ridge .foot-sheet{display:grid;grid-template-columns:1.2fr repeat(4,1fr);gap:10px}
.ridge .closing{font-size:clamp(40px,7vw,96px);line-height:.95;margin:20px 0}
.ridge footer{background:var(--ink);color:var(--paper);padding:36px 0 28px}
.ridge footer a{color:inherit}
.ridge .foot-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.ridge .foot-nav a{display:flex;align-items:center;min-height:44px;padding:4px 0}
.ridge .foot-nav h2{font-size:18px;margin:0 0 8px}
.ridge .subgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ridge .subgrid article,.ridge .card{background:var(--limestone);border-radius:20px;padding:12px}
.ridge .service-row{display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:center;padding:28px 0;border-top:1px solid var(--line)}
.ridge .service-row.flip{grid-template-columns:.9fr 1.1fr}
.ridge .service-row.flip .copy{order:2}
.ridge .band{background:var(--moss);border-radius:28px;padding:20px}
.ridge .reading{max-width:68ch}
.ridge .article-layout{display:grid;grid-template-columns:minmax(0,68ch) 280px;gap:32px;align-items:start}
.ridge .side{position:sticky;top:88px}
.ridge .crumbs{font-size:15px;margin-bottom:8px}
.ridge .team{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ridge .swatches{display:flex;gap:8px;flex-wrap:wrap}
.ridge .swatches button[aria-pressed=true]{outline:3px solid var(--ink)}
.ridge .contact-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:24px}
body[data-page-id="contact"]{background:#14241f}
body[data-page-id="contact"] .demo-shell{background:#0e1a16;color:#F4F1E8}
body[data-page-id="contact"] .ridge{background:#14241f;color:#F4F1E8}
body[data-page-id="contact"] .ridge .site-head,body[data-page-id="contact"] .ridge .visit-card,body[data-page-id="contact"] .ridge .panel{background:#1B312B;color:#F4F1E8}
body[data-page-id="contact"] .ridge input,body[data-page-id="contact"] .ridge select,body[data-page-id="contact"] .ridge textarea{background:#F4F1E8;color:#182C26}
.ridge .error{border-left:4px solid #8C3E16;padding:12px;background:#fff;color:#182C26}
.ridge [aria-invalid=true]{outline:3px solid #8C3E16}
.ridge dialog{border:0;border-radius:20px;max-width:min(920px,94vw);background:var(--paper);color:var(--ink);padding:18px}
.ridge dialog::backdrop{background:#182C26aa}
.ridge .index{display:flex;gap:8px;flex-wrap:wrap}
.ridge .journal{display:grid;grid-template-columns:1.3fr .7fr;gap:16px}
.ridge .journal-rest{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.ridge .check{display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start;font-weight:450}
.ridge .demo-inline{font-size:14px}
@media(max-width:900px){
 .ridge .hero,.ridge .system,.ridge .rail-head,.ridge .split,.ridge .two,.ridge .pair,.ridge .stories,.ridge .planner,.ridge .article-layout,.ridge .contact-grid,.ridge .service-row,.ridge .service-row.flip,.ridge .journal,.ridge .team{grid-template-columns:1fr}
 .ridge .service-row.flip .copy{order:0}
 .ridge .evidence{grid-template-columns:1fr}
 .ridge .foot-sheet{grid-template-columns:1fr 1fr 1fr}
 .ridge .foot-sheet .extra{display:none}
 .ridge .foot-nav,.ridge .subgrid,.ridge .journal-rest{grid-template-columns:1fr 1fr}
 .ridge .side{position:static}
 .ridge .desk-nav,.ridge .site-head .plan{display:none}
 .ridge .menu-open{display:inline-flex;margin-left:auto}
 .ridge .nav-fallback{display:block;margin-left:auto}
 .ridge.js .nav-fallback{display:none}
 .ridge .site-head{min-height:68px;padding:6px 14px}
 .ridge .stage-panel{display:block !important}
 .ridge .stage-tabs{display:none}
 .ridge table,.ridge tbody,.ridge tr,.ridge td,.ridge th{display:block}
 .ridge thead{display:none}
 .ridge td:before{content:attr(data-label);display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
}
@media(max-width:390px){.ridge .wrap{width:min(1180px,calc(100% - 28px))}.ridge h1{font-size:40px}}
@media(prefers-reduced-motion:reduce){.ridge *{scroll-behavior:auto !important;transition:none !important}}
@media print{
 .ridge .site-head,.ridge footer,.demo-shell{display:none !important}
 .ridge .print-sheet{display:block !important}
}
`;
