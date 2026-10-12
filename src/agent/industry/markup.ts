export const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function navLinks(ids:string[],pages:{pageId:string;label:string;role:string}[],current:string,href:(id:string)=>string,label='Main'):string{
  const links=ids.map(id=>{const page=pages.find(p=>p.pageId===id);if(!page)throw Error('Missing nav page '+id);const currentAttr=id===current?' aria-current="page"':'';return `<a href="${esc(href(id))}" data-page-id="${id}" data-page-role="${page.role}"${currentAttr}>${esc(page.label)}</a>`;}).join('');
  return `<nav aria-label="${label}">${links}</nav>`;
}

export function footLinks(pages:{pageId:string;label:string;role:string;group:string}[],current:string,href:(id:string)=>string):string{
  const groups=[...new Set(pages.map(p=>p.group))];
  return groups.map(group=>{const links=pages.filter(p=>p.group===group).map(p=>`<a href="${esc(href(p.pageId))}" data-page-id="${p.pageId}" data-page-role="${p.role}"${p.pageId===current?' aria-current="page"':''}>${esc(p.label)}</a>`).join('');return `<div><h2>${esc(group)}</h2>${links}</div>`;}).join('');
}

export function wizard(confirm:string,panels:string[]):string{
  const sections=panels.map((html,i)=>`<section data-panel="${i===panels.length-1?'done':i===panels.length-2?'review':String(i+1)}"${i?' hidden':''}>${html}</section>`).join('');
  return `<form data-wizard data-confirm="${esc(confirm)}" novalidate><p data-step-live role="status"></p>${sections}<p data-errors role="alert" tabindex="-1" hidden></p><div class="wizard-actions"><button type="button" data-back>Back</button><button type="button" data-edit>Edit answers</button><button type="button" data-next>Continue</button><button type="button" data-reset>Reset</button></div></form>`;
}

export function download(id:string,filename:string,label:string,text:string):string{
  return `<script type="text/plain" id="${id}">${esc(text)}</script><button type="button" data-download="${id}" data-filename="${esc(filename)}">${esc(label)}</button><pre id="${id}-view" hidden></pre>`;
}
