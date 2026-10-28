import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {RequestListener,ServerResponse} from 'node:http';
import {chromium} from 'playwright';
import {save} from './agent/artifacts.ts';
import {startLegacyPickerServer} from './test/legacy-picker-fixtures.ts';

test('slow gallery thumbnails leave connections available for live preview images',{timeout:60000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'vitris-thumbnail-scheduling-'));
 cpSync(resolve('agent'),join(root,'agent'),{recursive:true});mkdirSync(join(root,'onboarding'));
 save(join(root,'launch.json'),{slug:'thumbnail-scheduling',name:'Thumbnail scheduling test',themeSelection:{version:1,enabled:true}});
 save(join(root,'onboarding/brief.json'),{business:{name:'Thumbnail scheduling test'},images:[]});
 const {server,url}=await startLegacyPickerServer({sites:[{root,test:true}],port:0});
 const listeners=server.listeners('request') as RequestListener[],pending=new Set<ServerResponse>();let peak=0;
 server.removeAllListeners('request');
 server.on('request',(req,res)=>{
  if(req.url?.startsWith('/thumbnail/')){pending.add(res);peak=Math.max(peak,pending.size);res.once('close',()=>pending.delete(res));return;}
  for(const listener of listeners)listener.call(server,req,res);
 });
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Explore Treatment Menu',exact:true}).click();
  await page.locator('#detailpage').selectOption('service-detail');
  await page.locator('#canvas[data-ready="true"]').waitFor({timeout:20000});
  const images=await page.frameLocator('#canvas iframe').locator('img').evaluateAll(es=>es.map(e=>(e as any).naturalWidth));
  assert.ok(images.length>0&&images.every(width=>width>0));
  assert.ok(peak>0&&peak<=2,`Expected at most two background thumbnail requests; saw ${peak}`);
 }finally{await browser.close();for(const res of pending){res.writeHead(503);res.end();}await new Promise<void>(r=>server.close(()=>r()));}
});
