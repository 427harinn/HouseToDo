import { createApp } from "./app";
import { runOrphanR2Cleanup } from "./services/orphan-r2-cleanup-service";
import type { Env } from "./types/env";
const app = createApp();

export default {
  fetch: (request: Request, env: Env) => app.fetch(request, env),
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const startedAt = new Date().toISOString();
    ctx.waitUntil((async () => {
      const result = await runOrphanR2Cleanup(env);
      const finishedAt = new Date().toISOString();
      console.log(JSON.stringify({ event: "orphan_r2_cleanup", startedAt, finishedAt, ...result, durationMs: Date.parse(finishedAt) - Date.parse(startedAt) }));
    })());
  }
};
