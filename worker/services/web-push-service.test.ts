import { describe, expect, it, vi } from "vitest";
import { bytesToBase64Url } from "../lib/crypto";
import { WebPushService } from "./web-push-service";

type Row = {
  id: string;
  user_id: string;
  household_id: string;
  endpoint: string;
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  user_agent_summary: null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  disabled_at: string | null;
  enabled: number;
};

const createFixture = async (rows = 1) => {
  const userKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const userPublic = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey("raw", userKey.publicKey))
  );
  const vapid = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const publicKey = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey))
  );
  const records: Row[] = Array.from({ length: rows }, (_, index) => ({
    id: `sub-${index}`,
    user_id: index === 0 ? "user-1" : "user-2",
    household_id: "house-1",
    endpoint: `https://push.example.test/${index}`,
    endpoint_hash: `hash-${index}`,
    p256dh: userPublic,
    auth: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    user_agent_summary: null,
    created_at: "now",
    updated_at: "now",
    last_seen_at: "now",
    disabled_at: null,
    enabled: 1
  }));
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            all: () =>
              Promise.resolve({
                results: sql.includes("FROM push_subscriptions")
                  ? records.filter(
                      (row) =>
                        row.user_id === values[0] &&
                        row.household_id === values[1] &&
                        row.enabled === 1 &&
                        row.disabled_at === null
                    )
                  : []
              }),
            run: () => {
              const row = records.find(
                (item) => item.id === values[sql.includes("enabled = 0") ? 3 : 2]
              );
              if (row && sql.includes("enabled = 0")) {
                row.enabled = 0;
                row.disabled_at = String(values[0]);
              }
              return Promise.resolve({ meta: { changes: row ? 1 : 0 } });
            }
          };
        }
      };
    }
  } as unknown as D1Database;
  return {
    db,
    records,
    env: {
      WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: JSON.stringify(privateJwk),
      WEB_PUSH_SUBJECT: "mailto:test@example.com"
    }
  };
};

describe("WebPushService", () => {
  it.each([201, 202, 204])("counts %s as success", async (status) => {
    const fixture = await createFixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(
      new WebPushService(fixture.db, fetcher).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toEqual({ sent: 1, failed: 0 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      new TextDecoder().decode(
        (fetcher.mock.calls[0][1] as RequestInit).body as Uint8Array
      )
    ).not.toContain("テスト通知が届きました");
  });

  it.each([404, 410])("disables stale subscription on %s", async (status) => {
    const fixture = await createFixture();
    await expect(
      new WebPushService(
        fixture.db,
        vi.fn().mockResolvedValue(new Response(null, { status }))
      ).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toEqual({ sent: 0, failed: 1 });
    expect(fixture.records[0].disabled_at).not.toBeNull();
  });

  it.each([403, 429, 500])("returns generic failure for %s", async (status) => {
    const fixture = await createFixture();
    await expect(
      new WebPushService(
        fixture.db,
        vi.fn().mockResolvedValue(new Response(null, { status }))
      ).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toEqual({ sent: 0, failed: 1 });
  });

  it("returns generic failure for network errors and isolates the user", async () => {
    const fixture = await createFixture(2);
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      new WebPushService(fixture.db, fetcher).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toEqual({ sent: 0, failed: 1 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed when VAPID secrets are missing", async () => {
    const fixture = await createFixture();
    await expect(
      new WebPushService(fixture.db, vi.fn()).sendTest("user-1", "house-1", {})
    ).rejects.toThrow("push-config-missing");
  });
});
