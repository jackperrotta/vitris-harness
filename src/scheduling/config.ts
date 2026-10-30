import {escapeHtml} from '../html.ts';
export interface SchedulingConnection {version:1;enabled:boolean;apiOrigin:string;siteId:string;installationId:string;route:string}
export function schedulingConnection(value:unknown):SchedulingConnection|undefined{
 if(value===undefined)return;
 if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Invalid scheduling connection');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['version','enabled','apiOrigin','siteId','installationId','route'].includes(k)) || v.version!==1 || typeof v.enabled!=='boolean')throw Error('Invalid scheduling connection fields');
 const id=(x:unknown)=>typeof x==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
 if(!id(v.siteId)||!id(v.installationId))throw Error('Scheduling requires the exact public site and installation identity');
 const apiOrigin=bookingOrigin(v.apiOrigin),route=v.route??'/book';
 if(typeof route!=='string'||!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(route)||['/api','/assets','/media'].some(p=>route===p||route.startsWith(p+'/')))throw Error('Invalid booking route');
 return {version:1,enabled:v.enabled,apiOrigin,siteId:v.siteId as string,installationId:v.installationId as string,route};
}
export function bookingOrigin(value:unknown):string{
 if(typeof value!=='string')throw Error('Scheduling requires an exact origin');
 const url=new URL(value),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.origin!==value || url.username||url.password||url.protocol!=='https:' && !(local&&url.protocol==='http:'))throw Error('Scheduling requires HTTPS or an explicit loopback origin');
 return value;
}
export function bookingPage(name:string){return `<header class="vb-site-header"><a href="/">${escapeHtml(name)}</a></header><main class="vb-page"><p class="vb-eyebrow">APPOINTMENTS</p><h1>Book an appointment</h1><p>Choose a service and a time that works for you.</p><div data-vitris-booking></div></main>`;}
