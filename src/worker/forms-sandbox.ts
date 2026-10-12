/** Isolated test deployment of the shared forms handlers; no customer surfaces. */
import type { Env } from './env.ts';
import { handleFormSubmission, handleFormsAdmin } from './forms.ts';
import { processFormOutbox } from './form-outbox.ts';

export default {
  async fetch(request:Request, env:Env):Promise<Response> {
    if(env.FORMS_SANDBOX!=='1')return new Response('Sandbox configuration required',{status:503});
    const path=new URL(request.url).pathname;
    try {
      if(path==='/api/leads')return await handleFormSubmission(env,request);
      // The sandbox has no user/session login or production bindings. Only
      // tenant-scoped setup bearer credentials reach shared admin handlers.
      if(path.startsWith('/api/forms/') && request.headers.get('authorization')?.startsWith('Bearer '))return await handleFormsAdmin(env,request);
      if(path==='/health')return Response.json({service:'vitris-forms',sandbox:true,customerNotifications:false});
      return new Response('Not found',{status:404});
    } catch {
      // Do not expose submission bodies or database/provider diagnostics.
      return Response.json({ok:false,error:'service_unavailable'},{status:503});
    }
  },
  async scheduled(_event:ScheduledEvent,env:Env):Promise<void> {
    if(env.FORMS_SANDBOX==='1')await processFormOutbox(env);
  },
};
