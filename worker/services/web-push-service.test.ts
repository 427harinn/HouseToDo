import { describe, expect, it, vi } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "../lib/crypto";
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
  const env: {
    APP_ENV?: string;
    WEB_PUSH_VAPID_PUBLIC_KEY: string;
    WEB_PUSH_VAPID_PRIVATE_KEY: string;
    WEB_PUSH_SUBJECT: string;
  } = {
    APP_ENV: undefined,
    WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
    WEB_PUSH_VAPID_PRIVATE_KEY: JSON.stringify(privateJwk),
    WEB_PUSH_SUBJECT: "mailto:test@example.com"
  };
  return {
    db,
    records,
    env
  };
};

const authorizationForCall = (fetcher: ReturnType<typeof vi.fn>, index: number): string => {
  const init = fetcher.mock.calls[index]?.[1] as RequestInit | undefined;
  const authorization = new Headers(init?.headers).get("Authorization");
  if (!authorization) throw new Error("Authorization header was not sent");
  return authorization;
};

const tokenFromAuthorization = (authorization: string): string => {
  const token = authorization.match(/^vapid t=([^, ]+)/)?.[1];
  if (!token) throw new Error("VAPID token was not found");
  return token;
};

const claimsFromAuthorization = (authorization: string): Record<string, unknown> => {
  const body = tokenFromAuthorization(authorization).split(".")[1];
  if (!body) throw new Error("VAPID claims were not found");
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as Record<
    string,
    unknown
  >;
};

describe("WebPushService", () => {
  it("generates a fresh JWT per send while preserving VAPID claims", async () => {
    const fixture = await createFixture(2);
    fixture.records[1].user_id = "user-1";
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    await expect(
      new WebPushService(fixture.db, fetcher).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({ sent: 2, failed: 0 });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const authorizations = [
      authorizationForCall(fetcher, 0),
      authorizationForCall(fetcher, 1)
    ];
    expect(tokenFromAuthorization(authorizations[1])).not.toBe(
      tokenFromAuthorization(authorizations[0])
    );
    for (const authorization of authorizations) {
      const claims = claimsFromAuthorization(authorization);
      expect(claims).toMatchObject({
        aud: "https://push.example.test",
        sub: "mailto:test@example.com"
      });
      expect(Number(claims.exp)).toBeGreaterThan(Date.now() / 1000);
    }
  });

  it("keeps operational failure logs free of task, subscription, and key material", async () => {
    const fixture = await createFixture();
    fixture.env.APP_ENV = "production";
    fixture.env.WEB_PUSH_VAPID_PRIVATE_KEY = "not-a-private-key";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      new WebPushService(fixture.db, vi.fn()).sendPayload(
        "user-1",
        "house-1",
        { title: "private task title" },
        fixture.env
      )
    ).resolves.toMatchObject({ sent: 0, failed: 1 });

    const logText = [...log.mock.calls, ...error.mock.calls]
      .map(([line]) => String(line))
      .join("\n");
    expect(logText).toContain('"result":"signing_error"');
    expect(logText).not.toContain("https://push.example.test/");
    expect(logText).not.toContain(fixture.records[0].p256dh);
    expect(logText).not.toContain(fixture.records[0].auth);
    expect(logText).not.toContain("not-a-private-key");
    expect(logText).not.toContain("private task title");
    log.mockRestore();
    error.mockRestore();
  });

  it("detaches the injected fetcher for the production sender without changing the Web Push request", async () => {
    const fixture = await createFixture();
    const receivers: unknown[] = [];
    const receiverSensitiveFetcher: typeof fetch = vi.fn(function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ) {
      receivers.push(this);
      if (this !== undefined) throw new TypeError("unexpected receiver");
      expect(input).toBe("https://push.example.test/0");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toEqual(expect.any(String));
      expect(headers.get("Content-Encoding")).toBe("aes128gcm");
      expect(headers.get("TTL")).toBe("60");
      expect(headers.get("Content-Type")).toBe("application/octet-stream");
      expect(init?.body).toBeInstanceOf(Uint8Array);
      return Promise.resolve(new Response(null, { status: 201 }));
    });

    await expect(
      new WebPushService(fixture.db, receiverSensitiveFetcher).sendTest(
        "user-1",
        "house-1",
        fixture.env
      )
    ).resolves.toMatchObject({ sent: 1, failed: 0 });

    expect(receiverSensitiveFetcher).toHaveBeenCalledOnce();
    expect(receivers).toEqual([undefined]);
  });

  it.each([200, 201, 202, 204])("counts %s as success", async (status) => {
    const fixture = await createFixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(
      new WebPushService(fixture.db, fetcher).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({ sent: 1, failed: 0 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      new TextDecoder().decode(
        (fetcher.mock.calls[0][1] as RequestInit).body as Uint8Array
      )
    ).not.toContain("テスト通知が届きました");
  });

  it.each([404, 410])("disables stale subscription on %s", async (status) => {
    const fixture = await createFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      new WebPushService(
        fixture.db,
        vi.fn().mockResolvedValue(new Response(null, { status }))
      ).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      failure: {
        stage: "push_service",
        errorCategory: "push_service_stale",
        upstreamStatus: status
      }
    });
    expect(fixture.records[0].disabled_at).not.toBeNull();
    expect(log.mock.calls.map(([line]) => String(line)).join("\n")).toContain(
      `"event":"web_push_subscription_disabled","pushService":"other","httpStatus":${status}`
    );
    log.mockRestore();
  });

  it.each([
    [401, "push_service_auth_failed"],
    [403, "push_service_auth_failed"],
    [429, "push_service_rate_limited"],
    [500, "push_service_server_error"],
    [503, "push_service_server_error"],
    [400, "push_service_client_error"]
  ] as const)("classifies upstream %s", async (status, errorCategory) => {
    const fixture = await createFixture();
    await expect(
      new WebPushService(
        fixture.db,
        vi.fn().mockResolvedValue(new Response(null, { status }))
      ).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      failure: { stage: "push_service", errorCategory, upstreamStatus: status }
    });
  });

  it("logs Apple service classification and status without response body details", async () => {
    const fixture = await createFixture();
    fixture.env.APP_ENV = "production";
    fixture.records[0].endpoint = "https://web.push.apple.com/";
    const rawBody = JSON.stringify({ reason: "BadJwtToken", detail: "private-response-detail" });
    const rawChallenge = 'Bearer realm="secret-realm", error="invalid_token"';
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      new WebPushService(
        fixture.db,
        vi.fn().mockResolvedValue(
          new Response(rawBody, {
            status: 403,
            headers: {
              "WWW-Authenticate": rawChallenge,
              "Retry-After": "15"
            }
          })
        )
      ).sendPayload("user-1", "house-1", { title: "private task title" }, fixture.env)
    ).resolves.toMatchObject({ sent: 0, failed: 1 });

    const logs = [...log.mock.calls, ...error.mock.calls]
      .map(([line]) => String(line))
      .join("\n");
    expect(logs).toContain('"event":"web_push_send_result"');
    expect(logs).toContain('"pushService":"apple"');
    expect(logs).toContain('"upstreamStatus":403');
    expect(logs).toContain('"result":"auth_error"');
    expect(logs).not.toContain(rawBody);
    expect(logs).not.toContain(rawChallenge);
    expect(logs).not.toContain("private-response-detail");
    expect(logs).not.toContain(fixture.records[0].endpoint);
    expect(logs).not.toContain(fixture.records[0].p256dh);
    expect(logs).not.toContain(fixture.records[0].auth);
    expect(logs).not.toContain(fixture.env.WEB_PUSH_VAPID_PUBLIC_KEY);
    expect(logs).not.toContain(fixture.env.WEB_PUSH_VAPID_PRIVATE_KEY);
    expect(logs).not.toContain("BadJwtToken");
    expect(logs).not.toContain("private task title");
    expect(logs).not.toContain("vapid t=");
    log.mockRestore();
    error.mockRestore();
  });

  it("classifies network errors without exposing the endpoint or error details", async () => {
    const fixture = await createFixture(2);
    fixture.env.APP_ENV = "staging";
    const unsafeMessage =
      "fetch failed for https://push.example.test/private-token?auth=secret";
    const fetcher = vi.fn().mockRejectedValue(new TypeError(unsafeMessage));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      new WebPushService(fixture.db, fetcher).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      failure: {
        stage: "network",
        errorCategory: "network_failed",
        upstreamStatus: null,
        requestPhase: "fetch_call",
        errorName: "TypeError",
        causeCode: null,
        pushService: "other"
      }
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const logText = JSON.stringify(log.mock.calls);
    expect(logText).not.toContain(unsafeMessage);
    expect(logText).not.toContain("private-token");
    expect(logText).not.toContain("secret");
    expect(logText).not.toContain("stack");
    const safeFailureLog = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(safeFailureLog).toMatchObject({
      event: "web_push_send_result",
      result: "network_error",
      errorCategory: "network_failed",
      upstreamStatus: null,
      pushService: "other"
    });
    log.mockRestore();
  });

  it("uses safe defaults for unknown thrown values", async () => {
    const fixture = await createFixture();
    fixture.env.APP_ENV = "staging";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      new WebPushService(
        fixture.db,
        vi.fn().mockRejectedValue({ message: "secret" })
      ).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      failure: {
        stage: "network",
        errorCategory: "network_failed",
        requestPhase: "fetch_call",
        errorName: "UnknownError",
        causeCode: null,
        pushService: "other"
      }
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    log.mockRestore();
  });

  it("fails closed when VAPID secrets are missing", async () => {
    const fixture = await createFixture();
    await expect(
      new WebPushService(fixture.db, vi.fn()).sendTest("user-1", "house-1", {})
    ).rejects.toThrow("push-config-missing");
  });

  it("classifies invalid subscription payload encryption", async () => {
    const fixture = await createFixture();
    fixture.records[0].p256dh = "invalid";
    await expect(
      new WebPushService(fixture.db, vi.fn()).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      failure: { stage: "encryption", errorCategory: "invalid_subscription" }
    });
  });

  it("classifies invalid VAPID key import", async () => {
    const fixture = await createFixture();
    fixture.env.WEB_PUSH_VAPID_PRIVATE_KEY = "not-json";
    await expect(
      new WebPushService(fixture.db, vi.fn()).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      failure: { stage: "vapid", errorCategory: "vapid_key_import_failed" }
    });
  });

  it("classifies VAPID signing failure", async () => {
    const fixture = await createFixture();
    const originalSign = crypto.subtle.sign.bind(crypto.subtle);
    const signSpy = vi
      .spyOn(crypto.subtle, "sign")
      .mockImplementation(async (algorithm, key, data) => {
        if (typeof algorithm !== "string" && algorithm.name === "ECDSA") {
          throw new Error("sign-failed");
        }
        return originalSign(algorithm, key, data);
      });
    await expect(
      new WebPushService(fixture.db, vi.fn()).sendTest("user-1", "house-1", fixture.env)
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      failure: { stage: "vapid", errorCategory: "vapid_sign_failed" }
    });
    signSpy.mockRestore();
  });
});
