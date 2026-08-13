import { createApp } from "./app";
import { runOrphanR2Cleanup } from "./services/orphan-r2-cleanup-service";
import { runExpiredImageReservationCleanup } from "./services/expired-image-reservation-cleanup-service";
import type { Env } from "./types/env";
import { runNotificationScheduler } from "./services/notification-scheduler-service";
const app = createApp();

export default {
  fetch: (request: Request, env: Env) => app.fetch(request, env),
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const startedAt = new Date().toISOString();
    ctx.waitUntil((async () => {
      let reservationResult;
      try {
        reservationResult = await runExpiredImageReservationCleanup(env);
      } catch (error) {
        console.error(JSON.stringify({ event: "expired_image_reservation_cleanup_failed", errorName: error instanceof Error ? error.name : "UnknownError" }));
        reservationResult = { scanned: 0, released: 0, r2Deleted: 0, queuedForCleanup: 0, failed: 1, householdsRepaired: 0 };
      }
      let result;
      try {
        result = await runOrphanR2Cleanup(env);
      } catch (error) {
        console.error(JSON.stringify({ event: "orphan_r2_cleanup_failed", errorName: error instanceof Error ? error.name : "UnknownError" }));
        result = { scanned: 0, deleted: 0, skippedReferenced: 0, missingObjects: 0, retried: 0, abandoned: 0, failed: 1, usageRecalculated: 0 };
      }
      const finishedAt = new Date().toISOString();
      console.log(JSON.stringify({ event: "image_cleanup_cycle", startedAt, finishedAt, expiredReservations: reservationResult, orphanCleanup: result, durationMs: Date.parse(finishedAt) - Date.parse(startedAt) }));
      try {
        await runNotificationScheduler(env, new Date(controller.scheduledTime));
      } catch (error) {
        console.error(JSON.stringify({ event: "notification_scheduler_failed", errorName: error instanceof Error ? error.name : "UnknownError" }));
      }
    })());
  }
};
