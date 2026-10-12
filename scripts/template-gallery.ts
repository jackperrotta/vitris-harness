import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultTemplateArtifact,writeCloudTemplateArtifact} from './template-cloud-artifact.ts';

export async function startTemplateGallery(port=4390) {
 writeCloudTemplateArtifact();
 const server=createServer(async(request,response)=>{
  const url=new URL(request.url||'/','http://127.0.0.1');
  if(url.pathname!=='/'||!['GET','HEAD'].includes(request.method||'')){response.writeHead(404).end();return;}
  try{const html=await readFile(defaultTemplateArtifact);response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:html);}catch{response.writeHead(500).end('Template artifact unavailable');}
 });
 await new Promise<void>((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
 const address=server.address();return {server,url:'http://127.0.0.1:'+(typeof address==='object'&&address?address.port:port)+'/'};
}
if(process.argv[1]?.endsWith('template-gallery.ts')&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const index=process.argv.indexOf('--port'),port=index>=0?Number(process.argv[index+1]):4390;if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid gallery port');console.log('Default Cloudflare template gallery: '+(await startTemplateGallery(port)).url);}
