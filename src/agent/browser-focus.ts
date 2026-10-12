import type { Page } from "playwright";

/** Hit-test the visible part of a focused target, including a tall skip-link main. */
export async function checkFocusOcclusion(page: Page): Promise<string[]> {
  return page.evaluate(`(async () => {
    const targets=[...document.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')].filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=="hidden" && !e.disabled && !e.matches("a.skip-link") && !e.closest("[inert]"));
    const issues=[];
    for(const e of targets.slice(0,80)) {
      e.focus();e.scrollIntoView({block:"nearest",behavior:"instant"});
      await new Promise(r=>requestAnimationFrame(()=>r()));
      const r=e.getBoundingClientRect();if(r.width<2||r.height<2)continue;
      const left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
      const label=e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+(e.getAttribute("href")?'[href="'+e.getAttribute("href")+'"]':"");
      if(right<=left||bottom<=top){issues.push(label+" (no visible viewport intersection after focus)");continue;}
      const hidden=[.2,.5,.8].every(f=>{
        const hit=document.elementFromPoint(left+(right-left)*f,top+(bottom-top)*f);
        if(!hit)return true;
        if(hit===e||e.contains(hit))return false;
        let p=hit;
        while(p&&p!==e){const pos=getComputedStyle(p).position;if(pos==="fixed"||pos==="sticky")return true;p=p.parentElement;}
        return false;
      });
      if(hidden)issues.push(label);
    }
    scrollTo({top:0,left:0,behavior:"instant"});return issues;
  })()`);
}
