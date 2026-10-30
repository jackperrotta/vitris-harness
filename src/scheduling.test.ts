import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSite} from './build/index.ts';
import {schedulingConnection} from './scheduling/config.ts';
const connection={version:1 as const,enabled:true,apiOrigin:'https://admin.example.test',siteId:'site',installationId:'installation',route:'/book'};
const input={site:{name:'Booking Test Business'},pages:[{path:'/',file:'index.html',title:'Home',body:'<main><h1>Home</h1><a href="/book">Book now</a></main>'}],catalog:{},theme:{},publicOrigin:'https://example.test'};
test('booking is opt-in, has one standard route, and ships no booking assets on ordinary sites',async()=>{
 const plain=await mkdtemp(join(tmpdir(),'booking-plain-'));await buildSite({...input,outDir:plain});assert.ok(!(await readdir(plain)).includes('book'));assert.ok(!(await readFile(join(plain,'index.html'),'utf8')).includes('data-vitris-booking-config'));
 const booked=await mkdtemp(join(tmpdir(),'booking-component-'));await buildSite({...input,scheduling:connection,outDir:booked});const html=await readFile(join(booked,'book/index.html'),'utf8');assert.match(html,/data-vitris-booking/);assert.match(html,/data-vitris-booking-config/);assert.match(html,/Booking requires JavaScript/);assert.match(html,/https:\/\/admin.example.test/);assert.ok(!(await readFile(join(booked,'index.html'),'utf8')).includes('data-vitris-booking-config'));const script=html.match(/<script src="([^"]+)" defer><\/script>/)?.[1];assert.ok(script);assert.match(await readFile(join(booked,script),'utf8'),/initializeBooking|Booking progress/);
});
test('booking connection rejects secrets, insecure origins and route collisions while preserving authored pages',async()=>{
 assert.throws(()=>schedulingConnection({...connection,token:'secret'}),/fields/);assert.throws(()=>schedulingConnection({...connection,apiOrigin:'http://remote.example'}),/HTTPS/);assert.throws(()=>schedulingConnection({...connection,apiOrigin:'https://admin.example.test/path'}),/HTTPS/);assert.throws(()=>schedulingConnection({...connection,route:'/api/book'}),/route/);
 const outDir=await mkdtemp(join(tmpdir(),'booking-reject-'));await assert.rejects(buildSite({...input,scheduling:connection,outDir,pages:[...input.pages,{path:'/book',file:'book.html',title:'Existing',body:'<main>Existing authored route</main>'}]}),/already exists/);
 const body='<main><h1>Schedule a visit</h1><div data-vitris-booking></div><p>Authored surrounding copy.</p></main>';
 await buildSite({...input,scheduling:connection,outDir,pages:[...input.pages,{path:'/book',file:'book.html',title:'Book',body}]});const html=await readFile(join(outDir,'book/index.html'),'utf8');assert.match(html,/Authored surrounding copy/);assert.match(html,/Schedule a visit/);
 await assert.rejects(buildSite({...input,scheduling:connection,outDir,publicOrigin:undefined}),/exact origin/);
});

test('customer management removes capabilities before other scripts and excludes telemetry from its private route',async()=>{
 const outDir=await mkdtemp(join(tmpdir(),'booking-management-'));await buildSite({...input,scheduling:connection,outDir,backendOrigin:'https://forms.example.test',webAnalyticsToken:'a'.repeat(32)});const html=await readFile(join(outDir,'book/manage/index.html'),'utf8');assert.match(html,/data-vitris-customer-management/);assert.match(html,/content="noindex"/);assert.match(html,/name="referrer" content="no-referrer"/);assert.ok(!html.includes('beacon.js'));assert.ok(!html.includes('static.cloudflareinsights.com'));const script=html.match(/data-vitris-customer-config>[^<]*<\/script><script src="([^"]+)"/);assert.ok(script);const program=await readFile(join(outDir,script[1]!),'utf8');assert.ok(program.indexOf('history.replaceState')<program.indexOf('const begin'));assert.ok(program.includes('View appointment'));assert.ok(!program.includes('localStorage'));assert.ok(!program.includes('sessionStorage'));
 const original={path:'/book/manage',file:'manage.html',title:'Manage',indexing:'index' as const,body:'<main><div data-vitris-customer-management></div></main>'};await buildSite({...input,scheduling:connection,outDir,pages:[...input.pages,original]});assert.equal(original.indexing,'index');
});
