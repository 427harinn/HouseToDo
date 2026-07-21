import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { Env } from "./types/env";

type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type SessionRecord = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_used_at: string;
};

class MemoryPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: MemoryD1,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  first<T = unknown>(): Promise<T | null> {
    return Promise.resolve(this.db.first(this.sql, this.values) as T | null);
  }

  run(): Promise<D1Result> {
    return Promise.resolve(this.db.run(this.sql, this.values));
  }
}

class MemoryD1 {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();

  prepare(sql: string): D1PreparedStatement {
    return new MemoryPreparedStatement(this, sql) as unknown as D1PreparedStatement;
  }

  first(sql: string, values: unknown[]): UserRecord | SessionRecord | null {
    if (sql.includes("FROM users WHERE id")) {
      return this.users.get(String(values[0])) ?? null;
    }
    if (sql.includes("FROM users WHERE email")) {
      return Array.from(this.users.values()).find((user) => user.email === values[0]) ?? null;
    }
    if (sql.includes("FROM sessions WHERE token_hash")) {
      return (
        Array.from(this.sessions.values()).find(
          (session) => session.token_hash === values[0] && session.expires_at > String(values[1])
        ) ?? null
      );
    }
    return null;
  }

  run(sql: string, values: unknown[]): D1Result {
    if (sql.startsWith("INSERT INTO users")) {
      this.users.set(String(values[0]), {
        id: String(values[0]),
        email: String(values[1]),
        password_hash: String(values[2]),
        display_name: String(values[3]),
        created_at: String(values[4]),
        updated_at: String(values[5])
      });
    }
    if (sql.startsWith("INSERT INTO sessions")) {
      this.sessions.set(String(values[0]), {
        id: String(values[0]),
        user_id: String(values[1]),
        token_hash: String(values[2]),
        expires_at: String(values[3]),
        created_at: String(values[4]),
        last_used_at: String(values[5])
      });
    }
    if (sql.startsWith("DELETE FROM sessions WHERE token_hash")) {
      for (const [id, session] of this.sessions) {
        if (session.token_hash === values[0]) this.sessions.delete(id);
      }
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
}

const createTestEnv = (): Env =>
  ({
    DB: new MemoryD1() as unknown as D1Database,
    ATTACHMENTS: {},
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "development"
  }) as unknown as Env;

const postJson = (path: string, body: unknown, cookie?: string): Request =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });

describe("worker app auth API", () => {
  it("registers, reads the current user, and logs out", async () => {
    const app = createApp();
    const env = createTestEnv();
    const register = await app.fetch(
      postJson("/api/auth/register", {
        email: " User@Example.COM ",
        password: "very-long-password",
        displayName: "Codex Test"
      }),
      env
    );
    const cookie = register.headers.get("set-cookie");

    expect(register.status).toBe(201);
    expect(cookie).toContain("house_todo_session=");

    const me = await app.fetch(
      new Request("https://example.test/api/auth/me", {
        headers: { cookie: cookie ?? "" }
      }),
      env
    );
    await expect(me.json()).resolves.toMatchObject({
      ok: true,
      data: { user: { email: "user@example.com", displayName: "Codex Test" } }
    });

    const logout = await app.fetch(
      new Request("https://example.test/api/auth/logout", {
        method: "POST",
        headers: { cookie: cookie ?? "" }
      }),
      env
    );
    expect(logout.status).toBe(200);

    const afterLogout = await app.fetch(
      new Request("https://example.test/api/auth/me", {
        headers: { cookie: cookie ?? "" }
      }),
      env
    );
    expect(afterLogout.status).toBe(401);
  });

  it("rejects duplicate emails and wrong passwords", async () => {
    const app = createApp();
    const env = createTestEnv();
    const input = {
      email: "user@example.com",
      password: "very-long-password",
      displayName: "Codex Test"
    };

    expect((await app.fetch(postJson("/api/auth/register", input), env)).status).toBe(201);
    expect((await app.fetch(postJson("/api/auth/register", input), env)).status).toBe(409);
    expect(
      (
        await app.fetch(
          postJson("/api/auth/login", {
            email: "user@example.com",
            password: "wrong-password"
          }),
          env
        )
      ).status
    ).toBe(401);
  });
});
