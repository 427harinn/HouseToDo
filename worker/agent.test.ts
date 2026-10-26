import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";
import { getLocalDate } from "./lib/date-time";

const envFor = (): Env =>
  ({
    DB: new MemoryD1() as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: "https://example.test"
  }) as unknown as Env;
const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
const register = async (env: Env, email: string) => {
  const response = await createApp().fetch(
    post("/api/auth/register", {
      email,
      password: "very-long-password",
      displayName: "Agent test"
    }),
    env
  );
  return response.headers.get("set-cookie") ?? "";
};
const data = async <T>(response: Response): Promise<T> => {
  const value: unknown = await response.json();
  return (value as { data: T }).data;
};

describe("Agent API", () => {
  it("authenticates with a secret bearer token without changing browser cookie or origin protection", async () => {
    const app = createApp();
    const env = envFor();
    const cookie = await register(env, "agent-owner@example.com");
    await app.fetch(post("/api/households", { name: "Agent home" }, cookie), env);
    env.AGENT_API_TOKEN = "test-agent-secret-token";
    env.AGENT_API_USER_ID = (
      await data<{ user: { id: string } }>(
        await app.fetch(
          new Request("https://example.test/api/auth/me", { headers: { cookie } }),
          env
        )
      )
    ).user.id;
    for (const authorization of [
      null,
      "Basic test-agent-secret-token",
      "Bearer wrong-token"
    ]) {
      const headers: Record<string, string> = authorization ? { authorization } : {};
      expect(
        (
          await app.fetch(
            new Request("https://example.test/api/agent/shopping", { headers }),
            env
          )
        ).status
      ).toBe(401);
    }
    const authorized = await app.fetch(
      new Request("https://example.test/api/agent/shopping", {
        headers: { authorization: "Bearer test-agent-secret-token" }
      }),
      env
    );
    expect(authorized.status).toBe(200);
    const text = await authorized.text();
    expect(text).not.toContain("test-agent-secret-token");
    const browserMissingCookie = await app.fetch(
      new Request("https://example.test/api/shopping/items"),
      env
    );
    expect(browserMissingCookie.status).toBe(401);
    const browserMissingOrigin = await app.fetch(
      new Request("https://example.test/api/shopping/items", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "x" })
      }),
      env
    );
    expect(browserMissingOrigin.status).toBe(403);
  });

  it("reads dates, creates and completes tasks, and enforces the configured household", async () => {
    const app = createApp();
    const env = envFor();
    const cookie = await register(env, "agent-tasks@example.com");
    await app.fetch(post("/api/households", { name: "Tasks" }, cookie), env);
    const me = await data<{ user: { id: string } }>(
      await app.fetch(
        new Request("https://example.test/api/auth/me", { headers: { cookie } }),
        env
      )
    );
    env.AGENT_API_TOKEN = "test-agent-secret-token";
    env.AGENT_API_USER_ID = me.user.id;
    const headers = { authorization: "Bearer test-agent-secret-token" };
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    const created = await app.fetch(
      new Request("https://example.test/api/agent/tasks", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ title: "Agent task", date: today, time: "19:00" })
      }),
      env
    );
    expect(created.status).toBe(201);
    const taskId = (
      await data<{ task: { id: string; title: string; scheduledTime: string } }>(
        created
      )
    ).task.id;
    const todayResult = await data<{ tasks: Array<{ id: string }> }>(
      await app.fetch(
        new Request("https://example.test/api/agent/tasks/today", { headers }),
        env
      )
    );
    expect(todayResult.tasks.some((task) => task.id === taskId)).toBe(true);
    const dateResult = await app.fetch(
      new Request(`https://example.test/api/agent/tasks?date=${today}`, { headers }),
      env
    );
    expect(dateResult.status).toBe(200);
    const dateData = await data<{ tasks: Array<{ id: string }> }>(dateResult);
    expect(dateData.tasks.map((task) => task.id)).toContain(taskId);
    const complete = await app.fetch(
      new Request(`https://example.test/api/agent/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ targetDate: today })
      }),
      env
    );
    expect(complete.status).toBe(200);

    const otherCookie = await register(env, "agent-other@example.com");
    await app.fetch(post("/api/households", { name: "Other" }, otherCookie), env);
    const other = await app.fetch(
      post(`/api/tasks/${taskId}/complete`, { targetDate: today }, otherCookie),
      env
    );
    expect(other.status).toBe(404);
    const otherUser = await data<{ user: { id: string } }>(
      await app.fetch(
        new Request("https://example.test/api/auth/me", {
          headers: { cookie: otherCookie }
        }),
        env
      )
    );
    env.AGENT_API_USER_ID = otherUser.user.id;
    const agentOtherHousehold = await app.fetch(
      new Request(`https://example.test/api/agent/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ targetDate: today })
      }),
      env
    );
    expect(agentOtherHousehold.status).toBe(404);
  });

  it("creates, lists, and purchases shopping items with household isolation", async () => {
    const app = createApp();
    const env = envFor();
    const cookie = await register(env, "agent-shopping@example.com");
    await app.fetch(post("/api/households", { name: "Shopping" }, cookie), env);
    const me = await data<{ user: { id: string } }>(
      await app.fetch(
        new Request("https://example.test/api/auth/me", { headers: { cookie } }),
        env
      )
    );
    env.AGENT_API_TOKEN = "test-agent-secret-token";
    env.AGENT_API_USER_ID = me.user.id;
    const headers = { authorization: "Bearer test-agent-secret-token" };
    const created = await app.fetch(
      new Request("https://example.test/api/agent/shopping", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          name: "牛乳",
          quantity: "1本",
          note: null,
          plannedPurchaseDate: null
        })
      }),
      env
    );
    expect(created.status).toBe(201);
    const itemId = (await data<{ item: { id: string } }>(created)).item.id;
    const list = await data<{ pending: Array<{ id: string }>; purchased: unknown[] }>(
      await app.fetch(
        new Request("https://example.test/api/agent/shopping", { headers }),
        env
      )
    );
    expect(list.pending.some((item) => item.id === itemId)).toBe(true);
    const purchased = await app.fetch(
      new Request(`https://example.test/api/agent/shopping/${itemId}/purchase`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}"
      }),
      env
    );
    expect(purchased.status).toBe(200);
    const otherCookie = await register(env, "agent-shopping-other@example.com");
    await app.fetch(
      post("/api/households", { name: "Other shopping" }, otherCookie),
      env
    );
    env.AGENT_API_USER_ID = (
      await data<{ user: { id: string } }>(
        await app.fetch(
          new Request("https://example.test/api/auth/me", {
            headers: { cookie: otherCookie }
          }),
          env
        )
      )
    ).user.id;
    const forbidden = await app.fetch(
      new Request(`https://example.test/api/agent/shopping/${itemId}/purchase`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}"
      }),
      env
    );
    expect(forbidden.status).toBe(404);
  });
});
