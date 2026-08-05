import { describe, expect, it, vi } from "vitest";
import worker from "./index";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";

describe("scheduled handler", () => {
  it("uses waitUntil and logs cleanup results while fetch remains available", async () => {
    const db = new MemoryD1();
    const env = { DB: db as unknown as D1Database, ATTACHMENTS: new MemoryR2(), ASSETS: { fetch: () => Promise.resolve(new Response("asset")) }, APP_ENV: "test" } as unknown as Env;
    let pending: Promise<unknown> | undefined;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const context = { waitUntil(promise: Promise<unknown>) { pending = promise; } } as unknown as ExecutionContext;
    worker.scheduled({ cron: "0 18 * * *", scheduledTime: Date.now(), type: "scheduled", noRetry: () => undefined } as unknown as ScheduledController, env, context);
    expect(pending).toBeDefined();
    await pending;
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"event":"image_cleanup_cycle"'));
    log.mockRestore();
    await expect(worker.fetch(new Request("https://example.test/api/health"), env)).resolves.toMatchObject({ status: 200 });
  });
});
