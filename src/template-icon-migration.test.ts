import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {migrateHtml} from '../scripts/lib/template-icon-migration.ts';

test('template migration replaces semantic pictograms and CSS states without changing arithmetic or text examples',()=>{
 const input=`<!doctype html><html><head><style>.faq:after{content:'+'}.faq[open]:after{content:'−'}.next:after{content:'\\2192'}</style></head><body><button id="menu">☰</button><a href="tel:5551234">◷ Call</a><span class="stars">★★★★★</span><p>2 × 3, 2× faster, −12, ∞ and 10+ years.</p><kbd>⌘ K</kbd><pre>→ code sample</pre><textarea>✓ example</textarea></body></html>`;
 const result=migrateHtml(input);
 assert.match(result.html,/id="menu" aria-label="Menu"/);
 assert.match(result.html,/data-vitris-icon="menu"/);
 assert.match(result.html,/data-vitris-icon="phone"/);
 assert.equal((result.html.match(/data-vitris-icon="star"/g)??[]).length,5);
 assert.equal((result.html.match(/data-vitris-icon="star" data-icon-variant="solid"/g)??[]).length,5,'Filled rating stars must retain their filled appearance');
 assert.equal(result.cssIcons,3);
 assert.match(result.html,/mask:url\("data:image\/svg\+xml/);
 assert.ok(result.html.includes('2 × 3, 2× faster, −12, ∞ and 10+ years.'));
 assert.ok(result.html.includes('<kbd>⌘ K</kbd><pre>→ code sample</pre><textarea>✓ example</textarea>'));
 assert.equal(migrateHtml(result.html).html,result.html,'Migration must be idempotent');
});

test('dynamic menu, pause and disclosure states insert actual SVG and preserve interpolated text values',()=>{
 const code=`const menu={};let open=true;menu.textContent=open?'×':'☰';const pause={};pause.textContent=false?'▶':'Ⅱ';const disclosure={};disclosure.textContent=true?'Read more +':'Read less −';const quantity=2;const price=10;const cart=\`<p>\${quantity} × \${price}</p><button>Next →</button>\`;globalThis.result={menu,pause,disclosure,cart};`;
 const html=migrateHtml('<html><head></head><body><script>'+code+'</script></body></html>').html;
 const updated=html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
 const context:any={};runInNewContext(updated,context);
 assert.match(context.result.menu.innerHTML,/data-vitris-icon="close"/);
 assert.match(context.result.pause.innerHTML,/data-vitris-icon="pause"/);
 assert.match(context.result.disclosure.innerHTML,/Read more <svg/);
 assert.ok(context.result.cart.includes('<p>2 × 10</p>'));
 assert.match(context.result.cart,/data-vitris-icon="arrow-right"/);
 assert.doesNotMatch(context.result.cart,/data-vitris-icon="close"/);
});

test('mixed portrait captions preserve their names and inherit ink through actual HTML',()=>{
 const result=migrateHtml(`<html><head><style>.portrait-btn:after{content:'Meet '+attr(data-first)+' ↗';position:absolute;opacity:0;color:white}.portrait-btn:hover:after{opacity:1}</style></head><body><button class="portrait-btn" data-first="Alex"><img alt="Alex"></button></body></html>`);
 assert.match(result.html,/class="vitris-portrait-caption">Meet Alex <svg/);
 assert.match(result.html,/\.portrait-btn:hover>\.vitris-portrait-caption\{opacity:1\}/);
 assert.doesNotMatch(result.html,/↗|attr\(data-first\)/);
});

test('noscript fallback markup remains HTML while its pictogram becomes SVG',()=>{
 const html='<noscript><a href="/contact">Email us ↗</a></noscript>';
 const result=migrateHtml(html,{fragment:true,addStyle:false});
 assert.match(result.html,/<noscript><a href="\/contact">Email us <svg/);
 assert.doesNotMatch(result.html,/&lt;a|&lt;svg/);
});

test('interpolated text assignments remain text for explicit DOM migration',()=>{
 const html='<script>count.textContent = `Items ${n} ↗`;</script>';
 const result=migrateHtml(html,{fragment:true,addStyle:false});
 assert.equal(result.html,html);
 assert.equal(result.scriptIcons,0);
 assert.equal(result.preserved,1);
});
