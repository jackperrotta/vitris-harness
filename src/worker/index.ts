import type { Env } from "./env.ts";
import { rollupAll } from "./cron.ts";
import { handleInboundEmail } from "./email.ts";
import { route } from "./router.ts";
import { ensureSeed } from "./seed.ts";
import { hasSafeSessionSecret } from "./env.ts";
import { processFormOutbox } from './form-outbox.ts';

export { SiteUpdateWorkflow } from "./workflows/site-update.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (!hasSafeSessionSecret(env, request)) {
        return new Response("Worker session secret is not configured", { status: 503 });
      }
      await ensureSeed(env, request);
      return await route(env, request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Server error";
      return new Response(message, { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === '0 6 * * *') await rollupAll(env);
    await processFormOutbox(env);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    try {
      await ensureSeed(env);
      await handleInboundEmail(message, env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "email handler error";
      console.error(msg);
      message.setReject(msg.slice(0, 200));
    }
  },
};
