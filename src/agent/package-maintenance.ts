import {readFileSync,realpathSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {checkPackageUpdates,planPackageUpdates} from '@tryvitris/website-admin-harness/maintenance';
import {readSiteManagerConfig,siteManagerStatus} from './site-manager.ts';
import {save,within} from './artifacts.ts';
export interface AdminMaintenanceBinding {version:1;directory:string;installationId:string;siteId:string;adminOrigin:string}
function actualAdmin(root:string,directory:string,binding?:AdminMaintenanceBinding){
 const admin=realpathSync(resolve(root,directory)),manifest=JSON.parse(readFileSync(join(admin,'admin.config.json'),'utf8')),launch=JSON.parse(readFileSync(join(root,'launch.json'),'utf8')),connection=launch.admin;
 if(!connection||!manifest.installationId||!manifest.site?.id||!manifest.site?.origin||!manifest.adminOrigin||connection.installationId!==manifest.installationId||connection.siteId!==manifest.site.id||connection.url!==manifest.adminOrigin||launch.publicOrigin!==manifest.site.origin||connection.tenantId!==undefined&&connection.tenantId!==manifest.backend?.tenantId||connection.siteOrigin!==undefined&&connection.siteOrigin!==manifest.site.origin)throw Error('The separate admin manifest does not match this website connection.');
 const value:AdminMaintenanceBinding={version:1,directory:relative(root,admin).replaceAll('\\','/'),installationId:manifest.installationId,siteId:manifest.site.id,adminOrigin:manifest.adminOrigin};
 if(binding&&JSON.stringify(value)!==JSON.stringify(binding))throw Error('The recorded admin identity or canonical directory changed.');
 return {admin,binding:value};
}
/** Runs inside the existing care lease. No install, push, deployment or scheduler API. */
export async function checkSitePackageUpdates(site:string,options:{adminDirectory?:string;bind?:boolean;fetcher?:typeof fetch}={}){
 const root=realpathSync(resolve(site));siteManagerStatus(root);const config=readSiteManagerConfig(root);
 let selected:ReturnType<typeof actualAdmin>|undefined;
 if(options.bind&&!options.adminDirectory)throw Error('Binding requires an explicit --admin-dir.');
 if(options.adminDirectory)selected=actualAdmin(root,options.adminDirectory);
 else if(config.updates?.admin){try{selected=actualAdmin(root,config.updates.admin.directory,config.updates.admin);}catch{ /* Report unknown, never fall back to installer dependencies. */ }}
 if(options.bind){config.updates={version:1,policy:'prepare-and-test',admin:selected!.binding};save(within(root,'site-manager.json'),config);}
 const website=await checkPackageUpdates(root,{fetcher:options.fetcher});
 const admin=selected?await checkPackageUpdates(selected.admin,{fetcher:options.fetcher}):null;
 return {schemaVersion:1,checkedAt:website.checkedAt,policy:'prepare-and-test',website:{report:website,plan:planPackageUpdates(website)},admin:admin?{status:'checked',report:admin,plan:planPackageUpdates(admin)}:{status:config.updates?.admin?'unavailable-or-identity-changed':'not-bound',report:null,plan:null},deployment:'follow-existing-permissions',scheduleActivated:false};
}
