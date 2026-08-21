import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";
import { UserAvatarService } from "./services/user-avatar-service";

const envFor = (db = new MemoryD1()) =>
  ({
    DB: db as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: "https://example.test"
  }) as unknown as Env;

const json = (path: string, method: string, body: unknown, cookie = "") =>
  new Request(`https://example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });

const register = async (env: Env, email: string) => {
  const response = await createApp().fetch(
    json("/api/auth/register", "POST", {
      email,
      password: "very-long-password",
      displayName: "Avatar User"
    }),
    env
  );
  return response.headers.get("set-cookie") ?? "";
};

const webp = (size = 17) => {
  const bytes = new Uint8Array(size);
  bytes.set([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80]);
  return bytes;
};

describe("profile image API", () => {
  it("uploads, returns the avatar URL, replaces, removes, and rejects invalid uploads", async () => {
    const app = createApp();
    const env = envFor();
    const cookie = await register(env, "avatar@example.com");
    await app.fetch(
      json("/api/households", "POST", { name: "Avatar House" }, cookie),
      env
    );
    const [userId] = Array.from((env.DB as unknown as MemoryD1).users.keys());
    if (!userId) throw new Error("test user was not created");
    const service = new UserAvatarService(env.DB, env.ATTACHMENTS, env);
    await service.upload(userId, {
      body: webp().buffer,
      contentType: "image/webp",
      width: 80,
      height: 80
    });
    const me = await app.fetch(
      new Request("https://example.test/api/auth/me", { headers: { cookie } }),
      env
    );
    const meBody: { data: { user: { avatarUrl: string | null } } } = await me.json();
    expect(meBody.data.user.avatarUrl).toContain("/api/users/");
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(1);

    await service.upload(userId, {
      body: webp(18).buffer,
      contentType: "image/webp",
      width: 80,
      height: 80
    });
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(1);
    await expect(
      service.upload(userId, {
        body: webp().buffer,
        contentType: "image/png",
        width: 80,
        height: 80
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.upload(userId, {
        body: new Uint8Array(1024 * 1024 + 1).buffer,
        contentType: "image/webp",
        width: 80,
        height: 80
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const removed = await app.fetch(
      json("/api/account/avatar", "DELETE", {}, cookie),
      env
    );
    expect(removed.status).toBe(200);
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(0);
    await expect(
      (
        await app.fetch(
          new Request("https://example.test/api/auth/me", { headers: { cookie } }),
          env
        )
      ).text()
    ).resolves.toContain('"avatarUrl":null');
  }, 15000);

  it("requires authentication", async () => {
    const env = envFor();
    expect(
      (
        await createApp().fetch(
          new Request("https://example.test/api/account/avatar", {
            method: "DELETE",
            headers: {
              origin: "https://example.test",
              "content-type": "application/json"
            },
            body: "{}"
          }),
          env
        )
      ).status
    ).toBe(401);
    expect(
      (
        await createApp().fetch(
          new Request("https://example.test/api/account/avatar"),
          env
        )
      ).status
    ).toBe(401);
  });
});
