import {createHash,createHmac} from 'node:crypto';
import {readFileSync,createReadStream,statSync} from 'node:fs';
import {loadDevVars} from './r2.ts';
export const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
loadDevVars(process.cwd());
const keyId=process.env.CF_ACCESS_KEY_ID,secret=process.env.CF_SECRET_ACCESS_KEY,endpoint=process.env.CF_S3_API_ENDPOINT;
const bucket=process.env.VITRIS_TEMPLATE_BUCKET||'vitris-assets';
const hmac=(key:Uint8Array|string,value:string)=>createHmac('sha256',key).update(value).digest();
export async function r2Request(method:string,key:string,body?:Uint8Array,mime?:string,extra:Record<string,string>={}){
 if(!keyId||!secret||!endpoint)throw Error('R2 S3 credentials are missing');
 if(!key.startsWith('templates/')||key.includes('..'))throw Error('Publication outside template namespace');
 if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))throw Error('Invalid template bucket name');
 const url=new URL(endpoint.replace(/\/$/,'')+'/'+bucket+'/'+key.split('/').map(encodeURIComponent).join('/'));
 const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),payload=body?sha(body):sha(''),scope=day+'/auto/s3/aws4_request';
 const headers:Record<string,string>={'host':url.host,'x-amz-content-sha256':payload,'x-amz-date':date,...(mime?{'content-type':mime}:{}),...extra};
 const names=Object.keys(headers).sort(),signed=names.join(';'),canonical=[method,url.pathname,'',names.map(n=>n+':'+headers[n]+'\n').join(''),signed,payload].join('\n');
 const signing=hmac(hmac(hmac(hmac('AWS4'+secret,day),'auto'),'s3'),'aws4_request');
 headers.authorization=`AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signed}, Signature=${createHmac('sha256',signing).update('AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+sha(canonical)).digest('hex')}`;
 return fetch(url,{method,headers,...(body?{body:body as BodyInit}:{}),signal:AbortSignal.timeout(180000)});
}
export async function putVerified(key:string,body:Uint8Array,mime:string){
 const hash=sha(body);for(let attempt=0;attempt<3;attempt++){
  try{const prior=await r2Request('GET',key);if(prior.ok&&sha(new Uint8Array(await prior.arrayBuffer()))===hash)return {key,sha256:hash,bytes:body.length};
   if(prior.status!==404&& !prior.ok)throw Error(`R2 read ${prior.status}: ${key}`);
   if(prior.ok)throw Error('Immutable object conflict: '+key);
   const written=await r2Request('PUT',key,body,mime);if(!written.ok)throw Error(`R2 write ${written.status}: ${key}`);
   const read=await r2Request('GET',key);if(!read.ok||sha(new Uint8Array(await read.arrayBuffer()))!==hash)throw Error('Remote integrity failure: '+key);
   return {key,sha256:hash,bytes:body.length};
  }catch(error){if(attempt===2)throw error;}
 }throw Error('Unreachable');
}
export async function putMutable(key:string,body:Uint8Array,mime:string){const result=await r2Request('PUT',key,body,mime);if(!result.ok)throw Error('R2 catalog publication failed: '+result.status);const check=await r2Request('GET',key);if(!check.ok||sha(new Uint8Array(await check.arrayBuffer()))!==sha(body))throw Error('Catalog verification failed');}
