import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { escapeHtml } from '../html.ts';
import { approvedOrigin, safeId, type FormField, type PublicForm } from './config.ts';
type Element = DefaultTreeAdapterMap['element'];
export type FormInventory = { index: number; eligible: boolean; fields: FormField[]; unsupported: string[] };
export function inspectForms(html: string): FormInventory[] {
  const inventory: FormInventory[] = [];
  const walk = (node: DefaultTreeAdapterMap['node'], visit: (el: Element)=>void) => {
    if ('tagName' in node) visit(node);
    if ('childNodes' in node) node.childNodes.forEach(n=>walk(n,visit));
  };
  walk(parseFragment(html), form => {
    if (form.tagName !== 'form') return;
    const fields: FormField[] = [], unsupported: string[] = [];
    let eligible = form.attrs.some(a=>a.name === 'data-lead-form');
    if (form.attrs.some(a=>['data-lead-custom','data-no-enhance'].includes(a.name))) unsupported.push('Custom submission handler needs explicit migration');
    walk(form, el => {
      const attr = (name:string)=>el.attrs.find(a=>a.name===name)?.value;
      if (attr('data-vitrisid') === 'emailSendButton') eligible = true;
      if (!['input','textarea','select'].includes(el.tagName)) return;
      const name = attr('name'), type = el.tagName === 'input' ? attr('type') || 'text' : el.tagName;
      if (['hidden','submit','button','reset'].includes(type)) {
        if (type === 'hidden' && name && !['vid','page_path','company_url','form_id','tenant_id','idempotency_key','cf-turnstile-response'].includes(name)) unsupported.push(`Unmapped hidden field: ${name}`);
        return;
      }
      if (!name || !safeId(name) || !['text','email','tel','textarea','select','checkbox','radio'].includes(type)) { unsupported.push(`Unsupported field: ${name || '(unnamed)'} (${type})`); return; }
      if (attr('multiple') !== undefined && type !== 'checkbox') unsupported.push(`Unsupported multiple field: ${name}`);
      const options: string[] = [];
      if (type === 'select') walk(el, opt => { if (opt.tagName === 'option') { const value = opt.attrs.find(a=>a.name==='value')?.value ?? opt.childNodes.filter(n=>'value' in n).map(n=>(n as DefaultTreeAdapterMap['textNode']).value).join(''); if (value) options.push(value); } });
      if (type === 'checkbox' || type === 'radio') options.push(attr('value') || 'on');
      const old = fields.find(f=>f.name===name);
      if (old) { if (old.type === type && ['checkbox','radio'].includes(type)) { old.options!.push(...options); old.required=old.required || attr('required') !== undefined; } else unsupported.push(`Duplicate field: ${name}`); return; }
      fields.push({name,type:type as FormField['type'],label:attr('aria-label') || name,required:attr('required') !== undefined,minLength:Number(attr('minlength') || 0),maxLength:Math.min(8000,Number(attr('maxlength') || (type==='textarea'?8000:255))),...(['select','checkbox','radio'].includes(type)?{options}:{}),...(['name','email','message','phone'].includes(name)?{map:name as FormField['map']}:['number','telephone','phone_number','phoneNumber'].includes(name)?{map:'phone' as const}:{})});
    });
    inventory.push({index:inventory.length,eligible,fields,unsupported});
  });
  return inventory;
}
export function connectForms(html: string, backend: string, pagePath: string, forms: PublicForm[]): string {
  const bindings = forms.filter(f=>f.pagePath===pagePath);
  if (!bindings.length) return html;
  approvedOrigin(backend);
  const inventory = inspectForms(html);
  const seen = new Set<number>();
  for (const f of bindings) {
    const index = f.index ?? 0, item = inventory[index];
    if (!safeId(f.id) || !safeId(f.action) || f.action.length > 32 || !/^[a-zA-Z0-9_-]{1,100}$/.test(f.sitekey) || !item || !item.eligible || item.unsupported.length || seen.has(index)) throw new Error(`Cannot connect ${pagePath} form ${index}: ${item?.unsupported.join(', ') || 'explicit contact-form marker and valid unique binding required'}`);
    seen.add(index);
  }
  const located:Element[]=[];
  const walk=(node:DefaultTreeAdapterMap['node'])=>{if('tagName' in node && node.tagName==='form')located.push(node);if('childNodes' in node)node.childNodes.forEach(walk);};
  walk(parseFragment(html,{sourceCodeLocationInfo:true}));
  const edits:{start:number;end:number;value:string}[]=[];
  for(const binding of bindings){
    const form=located[binding.index ?? 0]!, location=form.sourceCodeLocation;
    if(!location?.startTag || !location.endTag)throw new Error('Unclosed contact form requires source repair');
    const start=location.startTag.startOffset,end=location.endTag.endOffset;
    let open=html.slice(start,location.startTag.endOffset);
    const remove=new Set(['action','method','novalidate','data-preserve-forms','data-vitris-form','data-vitris-sitekey','data-vitris-action','data-vitris-enhanced','data-lead-form']);
    for(const [name,span] of Object.entries(location.attrs || {}).sort((a,b)=>b[1].startOffset-a[1].startOffset))if(remove.has(name))open=open.slice(0,span.startOffset-start)+open.slice(span.endOffset-start);
    let inner=html.slice(location.startTag.endOffset,location.endTag.startOffset);
    // Only known transport controls are replaced; authored business fields remain byte-for-byte.
    const inputs:Element[]=[];const collect=(node:DefaultTreeAdapterMap['node'])=>{if('tagName' in node && node.tagName==='input')inputs.push(node);if('childNodes' in node)node.childNodes.forEach(collect);};collect(form);
    for(const input of inputs.sort((a,b)=>(b.sourceCodeLocation?.startOffset || 0)-(a.sourceCodeLocation?.startOffset || 0))){const name=input.attrs.find(a=>a.name==='name')?.value;if(['form_id','idempotency_key','cf-turnstile-response'].includes(name || '') && input.sourceCodeLocation){const s=input.sourceCodeLocation.startOffset-location.startTag.endOffset,e=input.sourceCodeLocation.endOffset-location.startTag.endOffset;inner=inner.slice(0,s)+inner.slice(e);}}
    const has=(name:string)=>inputs.some(input=>input.attrs.some(a=>a.name==='name' && a.value===name));
    open=open.replace(/>$/,` method="post" action="${escapeHtml(backend)}/api/leads?form_id=${binding.id}" data-lead-form data-vitris-enhanced data-preserve-forms="live" data-vitris-form="${binding.id}" data-vitris-sitekey="${binding.sitekey}" data-vitris-action="${binding.action}">`);
    const value=`${open}<input type="hidden" name="form_id" value="${binding.id}">${has('page_path')?'':`<input type="hidden" name="page_path" value="${escapeHtml(pagePath)}">`}${has('company_url')?'':'<input type="hidden" name="company_url" value="">'}${inner}<noscript><p>This form needs JavaScript and a security check. Please use the listed contact details.</p></noscript>${html.slice(location.endTag.startOffset,end)}`;
    edits.push({start,end,value});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))html=html.slice(0,edit.start)+edit.value+html.slice(edit.end);
  return html;
}
