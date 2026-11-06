import {resolve} from 'node:path';
import {checkSitePackageUpdates} from '../agent/package-maintenance.ts';
import {save,within} from '../agent/artifacts.ts';
import {EXIT_CODES,type CommandResult} from './types.ts';
export async function packageMaintenanceCommand(options:{site?:string;adminDirectory?:string;bind?:boolean;out?:string;dryRun?:boolean}):Promise<CommandResult>{
 try{
  if(options.dryRun&&options.bind)throw Error('A dry run cannot bind an admin directory. Run the read-only check without --bind.');
  if(options.out&&options.out!=='agent/site-manager/package-updates.json')throw Error('Use --out agent/site-manager/package-updates.json for the maintenance evidence.');
  const root=resolve(options.site||'.'),data=await checkSitePackageUpdates(root,options);
  if(options.out&&!options.dryRun)save(within(root,options.out),data);
  return {ok:true,exitCode:EXIT_CODES.SUCCESS,data,summary:'Checked published package versions and prepared reviewable plans. No packages installed, deployment authorized or schedule activated.'};
 }catch(e){return {ok:false,exitCode:EXIT_CODES.CONFIG_OR_CLI_ERROR,error:e instanceof Error?e.message:'Package maintenance check failed'};}
}
