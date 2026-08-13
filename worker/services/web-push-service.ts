import { base64UrlToBytes, bytesToBase64Url } from "../lib/crypto";
import { nowIso } from "../lib/date";
import {
  PushSubscriptionRepository,
  type PushSubscriptionRecord
} from "../repositories/push-subscription-repository";

export type WebPushFailureStage =
  | "config"
  | "subscription"
  | "vapid"
  | "encryption"
  | "network"
  | "push_service";

export type WebPushErrorCategory =
  | "missing_config"
  | "invalid_subscription"
  | "vapid_key_import_failed"
  | "vapid_sign_failed"
  | "payload_encrypt_failed"
  | "network_failed"
  | "push_service_auth_failed"
  | "push_service_rate_limited"
  | "push_service_stale"
  | "push_service_server_error"
  | "push_service_client_error"
  | "subscription_state_update_failed"
  | "unknown";

export type WebPushRequestPhase = "request_build" | "fetch_call";

export type WebPushServiceKind = "apple" | "fcm" | "mozilla" | "unknown";

export type WebPushFailure = {
  stage: WebPushFailureStage;
  errorCategory: WebPushErrorCategory;
  upstreamStatus: number | null;
  requestPhase?: WebPushRequestPhase;
  errorName?: string;
  causeCode?: string | null;
  pushService?: WebPushServiceKind;
};

export type WebPushSendResult = {
  sent: number;
  failed: number;
  failure?: WebPushFailure;
};

export type WebPushAuthorizationProbeResult =
  | { index: number; ok: true; status: number }
  | ({ index: number; ok: false } & WebPushFailure);

const DUMMY_AUTHORIZATION = "Bearer probe";
const CUSTOM_HEADER_PROBE_VALUE = "probe";

type WebPushAttemptResult =
  | { status: "sent"; upstreamStatus: number }
  | { status: "stale" | "failed"; failure: WebPushFailure };

class ClassifiedWebPushError extends Error {
  constructor(readonly failure: WebPushFailure) {
    super("web-push-classified-failure");
    this.name = "ClassifiedWebPushError";
  }
}

const isDetailedEnvironment = (appEnv: string | undefined): boolean =>
  appEnv === "staging" || appEnv === "development" || appEnv === "test";

const logWebPushFailure = (
  appEnv: string | undefined,
  failure: WebPushFailure
): void => {
  if (!isDetailedEnvironment(appEnv)) return;
  console.error("web_push_send_failed", {
    stage: failure.stage,
    errorCategory: failure.errorCategory,
    upstreamStatus: failure.upstreamStatus,
    ...(failure.requestPhase ? { requestPhase: failure.requestPhase } : {}),
    ...(failure.errorName ? { errorName: failure.errorName } : {}),
    ...(failure.causeCode !== undefined ? { causeCode: failure.causeCode } : {}),
    ...(failure.pushService ? { pushService: failure.pushService } : {})
  });
};

const failure = (
  stage: WebPushFailureStage,
  errorCategory: WebPushErrorCategory,
  upstreamStatus: number | null = null,
  diagnostics: Pick<
    WebPushFailure,
    "requestPhase" | "errorName" | "causeCode" | "pushService"
  > = {}
): WebPushFailure => ({ stage, errorCategory, upstreamStatus, ...diagnostics });

const knownErrorNames = new Set([
  "AbortError",
  "Error",
  "NetworkError",
  "RangeError",
  "SyntaxError",
  "TypeError"
]);

const safeErrorName = (thrown: unknown): string => {
  if (!(thrown instanceof Error)) return "UnknownError";
  return knownErrorNames.has(thrown.name) ? thrown.name : "UnknownError";
};

const knownCauseCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ERR_NETWORK",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET"
]);

const safeCauseCode = (thrown: unknown): string | null => {
  if (!(thrown instanceof Error) || !thrown.cause || typeof thrown.cause !== "object") {
    return null;
  }
  const code = (thrown.cause as { code?: unknown }).code;
  return typeof code === "string" && knownCauseCodes.has(code) ? code : null;
};

const pushServiceFromEndpoint = (endpoint: string): WebPushServiceKind => {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    if (hostname === "web.push.apple.com" || hostname.endsWith(".push.apple.com")) {
      return "apple";
    }
    if (hostname === "fcm.googleapis.com" || hostname.endsWith(".fcm.googleapis.com")) {
      return "fcm";
    }
    if (hostname === "updates.push.services.mozilla.com" || hostname.endsWith(".mozilla.com")) {
      return "mozilla";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
};

const encoder = new TextEncoder();
const concat = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};
const info = (value: string) => concat(encoder.encode(value), new Uint8Array([0]));

const hmac = async (keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
};

const hkdfExpand = async (
  prk: Uint8Array,
  label: Uint8Array,
  length: number
): Promise<Uint8Array> => {
  let previous = new Uint8Array();
  const output = new Uint8Array(length);
  let offset = 0;
  for (let counter = 1; offset < length; counter += 1) {
    previous = await hmac(prk, concat(previous, label, new Uint8Array([counter])));
    const chunk = previous.subarray(0, Math.min(previous.length, length - offset));
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const encryptPayload = async (
  subscription: PushSubscriptionRecord,
  payload: string
): Promise<Uint8Array> => {
  const userPublicBytes = base64UrlToBytes(subscription.p256dh);
  if (userPublicBytes.length !== 65) throw new Error("invalid-p256dh");
  const auth = base64UrlToBytes(subscription.auth);
  if (auth.length !== 16) throw new Error("invalid-auth");
  const userPublic = await crypto.subtle.importKey(
    "raw",
    userPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const ephemeralPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey)
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: userPublic },
      ephemeral.privateKey,
      256
    )
  );
  const prk = await hmac(auth, shared);
  const ikm = await hkdfExpand(
    prk,
    concat(encoder.encode("WebPush: info\0"), userPublicBytes, ephemeralPublicBytes),
    32
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltPrk = await hmac(salt, ikm);
  const cek = await hkdfExpand(saltPrk, info("Content-Encoding: aes128gcm"), 16);
  const nonce = await hkdfExpand(saltPrk, info("Content-Encoding: nonce"), 12);
  const content = concat(encoder.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt"
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, content)
  );
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + ephemeralPublicBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = ephemeralPublicBytes.length;
  header.set(ephemeralPublicBytes, 21);
  return concat(header, ciphertext);
};

const parsePrivateJwk = (value: string): JsonWebKey => {
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as JsonWebKey).kty !== "EC" ||
    (parsed as JsonWebKey).crv !== "P-256" ||
    !(parsed as JsonWebKey).d ||
    !(parsed as JsonWebKey).x ||
    !(parsed as JsonWebKey).y
  )
    throw new Error("invalid-vapid-private-key");
  return parsed as JsonWebKey;
};

const createVapidAuthorization = async (
  endpoint: string,
  subject: string,
  privateKeyText: string,
  publicKey: string
): Promise<string> => {
  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      "jwk",
      parsePrivateJwk(privateKeyText),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch {
    throw new ClassifiedWebPushError(
      failure("vapid", "vapid_key_import_failed")
    );
  }
  const audience = new URL(endpoint).origin;
  const header = bytesToBase64Url(
    encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );
  const body = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 43_200,
        sub: subject
      })
    )
  );
  const input = encoder.encode(`${header}.${body}`);
  let signature: Uint8Array;
  try {
    signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        input
      )
    );
  } catch {
    throw new ClassifiedWebPushError(failure("vapid", "vapid_sign_failed"));
  }
  return `vapid t=${header}.${body}.${bytesToBase64Url(signature)}, k=${publicKey}`;
};

export class WebPushService {
  private readonly repository: PushSubscriptionRepository;
  constructor(
    private readonly db: D1Database,
    private readonly fetcher: typeof fetch = fetch
  ) {
    this.repository = new PushSubscriptionRepository(db);
  }

  async sendTest(
    userId: string,
    householdId: string,
    env: {
      APP_ENV?: string;
      WEB_PUSH_VAPID_PUBLIC_KEY?: string;
      WEB_PUSH_VAPID_PRIVATE_KEY?: string;
      WEB_PUSH_SUBJECT?: string;
    }
  ): Promise<WebPushSendResult> {
    const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = env.WEB_PUSH_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject || !/^(mailto:|https:)/.test(subject)) {
      logWebPushFailure(env.APP_ENV, failure("config", "missing_config"));
      throw new Error("push-config-missing");
    }
    const subscriptions = await this.repository.listActiveByUserHousehold(
      userId,
      householdId
    );
    let sent = 0;
    let failed = 0;
    let firstFailure: WebPushFailure | undefined;
    for (const subscription of subscriptions) {
      const result = await this.sendOne(
        subscription,
        {
          title: "HouseToDo",
          body: "テスト通知が届きました",
          icon: "/icons/house-todo-192.png",
          data: { url: "/" }
        },
        publicKey,
        privateKey,
        subject
      );
      if (result.status === "sent") {
        sent += 1;
      } else {
        failed += 1;
        firstFailure ??= result.failure;
        logWebPushFailure(env.APP_ENV, result.failure);
      }
    }
    return { sent, failed, ...(firstFailure ? { failure: firstFailure } : {}) };
  }

  async probeVapidAuthorization(
    userId: string,
    householdId: string,
    env: {
      WEB_PUSH_VAPID_PUBLIC_KEY?: string;
      WEB_PUSH_VAPID_PRIVATE_KEY?: string;
      WEB_PUSH_SUBJECT?: string;
    },
    isAllowedEndpoint: (endpoint: string) => boolean
  ): Promise<WebPushAuthorizationProbeResult[]> {
    const subscriptions = (await this.repository.listActiveByUserHousehold(userId, householdId))
      .filter((subscription) => isAllowedEndpoint(subscription.endpoint));
    const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = env.WEB_PUSH_SUBJECT?.trim();

    return Promise.all(
      subscriptions.map(async (subscription, index) => {
        const resultIndex = index + 1;
        if (!publicKey || !privateKey || !subject || !/^(mailto:|https:)/.test(subject)) {
          return {
            index: resultIndex,
            ok: false,
            ...failure("config", "missing_config")
          };
        }

        let authorization: string;
        try {
          authorization = await createVapidAuthorization(
            subscription.endpoint,
            subject,
            privateKey,
            publicKey
          );
        } catch (error) {
          const vapidFailure = error instanceof ClassifiedWebPushError
            ? error.failure
            : failure("vapid", "unknown");
          return { index: resultIndex, ok: false, ...vapidFailure };
        }

        try {
          const response = await this.fetcher(subscription.endpoint, {
            method: "POST",
            headers: { Authorization: authorization }
          });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          return { index: resultIndex, ok: true, status: response.status };
        } catch (error) {
          return {
            index: resultIndex,
            ok: false,
            ...failure("network", "network_failed", null, {
              requestPhase: "fetch_call",
              errorName: safeErrorName(error),
              causeCode: safeCauseCode(error),
              pushService: pushServiceFromEndpoint(subscription.endpoint)
            })
          };
        }
      })
    );
  }

  async probeDummyAuthorization(
    userId: string,
    householdId: string,
    isAllowedEndpoint: (endpoint: string) => boolean
  ): Promise<WebPushAuthorizationProbeResult[]> {
    const subscriptions = (await this.repository.listActiveByUserHousehold(userId, householdId))
      .filter((subscription) => isAllowedEndpoint(subscription.endpoint));

    return Promise.all(
      subscriptions.map(async (subscription, index) => {
        try {
          const response = await this.fetcher(subscription.endpoint, {
            method: "POST",
            headers: { Authorization: DUMMY_AUTHORIZATION }
          });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          return { index: index + 1, ok: true, status: response.status };
        } catch (error) {
          return {
            index: index + 1,
            ok: false,
            ...failure("network", "network_failed", null, {
              requestPhase: "fetch_call",
              errorName: safeErrorName(error),
              causeCode: safeCauseCode(error),
              pushService: pushServiceFromEndpoint(subscription.endpoint)
            })
          };
        }
      })
    );
  }

  async probeCustomHeader(
    userId: string,
    householdId: string,
    isAllowedEndpoint: (endpoint: string) => boolean
  ): Promise<WebPushAuthorizationProbeResult[]> {
    const subscriptions = (await this.repository.listActiveByUserHousehold(userId, householdId))
      .filter((subscription) => isAllowedEndpoint(subscription.endpoint));

    return Promise.all(
      subscriptions.map(async (subscription, index) => {
        try {
          const response = await this.fetcher(subscription.endpoint, {
            method: "POST",
            headers: { "X-HouseToDo-Probe": CUSTOM_HEADER_PROBE_VALUE }
          });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          return { index: index + 1, ok: true, status: response.status };
        } catch (error) {
          return {
            index: index + 1,
            ok: false,
            ...failure("network", "network_failed", null, {
              requestPhase: "fetch_call",
              errorName: safeErrorName(error),
              causeCode: safeCauseCode(error),
              pushService: pushServiceFromEndpoint(subscription.endpoint)
            })
          };
        }
      })
    );
  }

  async probeTtl(
    userId: string,
    householdId: string,
    isAllowedEndpoint: (endpoint: string) => boolean
  ): Promise<WebPushAuthorizationProbeResult[]> {
    const subscriptions = (await this.repository.listActiveByUserHousehold(userId, householdId))
      .filter((subscription) => isAllowedEndpoint(subscription.endpoint));

    return Promise.all(
      subscriptions.map(async (subscription, index) => {
        try {
          const response = await this.fetcher(subscription.endpoint, {
            method: "POST",
            headers: { TTL: "60" }
          });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          return { index: index + 1, ok: true, status: response.status };
        } catch (error) {
          return {
            index: index + 1,
            ok: false,
            ...failure("network", "network_failed", null, {
              requestPhase: "fetch_call",
              errorName: safeErrorName(error),
              causeCode: safeCauseCode(error),
              pushService: pushServiceFromEndpoint(subscription.endpoint)
            })
          };
        }
      })
    );
  }

  async probeDetachedFetcher(
    userId: string,
    householdId: string,
    isAllowedEndpoint: (endpoint: string) => boolean
  ): Promise<WebPushAuthorizationProbeResult[]> {
    const subscriptions = (await this.repository.listActiveByUserHousehold(userId, householdId))
      .filter((subscription) => isAllowedEndpoint(subscription.endpoint));
    const fetcher = this.fetcher;

    return Promise.all(
      subscriptions.map(async (subscription, index) => {
        try {
          const response = await fetcher(subscription.endpoint, {
            method: "POST",
            headers: { TTL: "60" }
          });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          return { index: index + 1, ok: true, status: response.status };
        } catch (error) {
          return {
            index: index + 1,
            ok: false,
            ...failure("network", "network_failed", null, {
              requestPhase: "fetch_call",
              errorName: safeErrorName(error),
              causeCode: safeCauseCode(error),
              pushService: pushServiceFromEndpoint(subscription.endpoint)
            })
          };
        }
      })
    );
  }

  async probeDummyAuthorizationManualRedirect(
    userId: string,
    householdId: string,
    isAllowedEndpoint: (endpoint: string) => boolean
  ): Promise<WebPushAuthorizationProbeResult[]> {
    const subscriptions = (await this.repository.listActiveByUserHousehold(userId, householdId))
      .filter((subscription) => isAllowedEndpoint(subscription.endpoint));

    return Promise.all(
      subscriptions.map(async (subscription, index) => {
        try {
          const response = await this.fetcher(subscription.endpoint, {
            method: "POST",
            headers: { Authorization: DUMMY_AUTHORIZATION },
            redirect: "manual"
          });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          return { index: index + 1, ok: true, status: response.status };
        } catch (error) {
          return {
            index: index + 1,
            ok: false,
            ...failure("network", "network_failed", null, {
              requestPhase: "fetch_call",
              errorName: safeErrorName(error),
              causeCode: safeCauseCode(error),
              pushService: pushServiceFromEndpoint(subscription.endpoint)
            })
          };
        }
      })
    );
  }

  private async sendOne(
    subscription: PushSubscriptionRecord,
    payload: object,
    publicKey: string,
    privateKey: string,
    subject: string
  ): Promise<WebPushAttemptResult> {
    let body: Uint8Array;
    try {
      body = await encryptPayload(subscription, JSON.stringify(payload));
    } catch (error) {
      const errorCategory =
        error instanceof Error &&
        (error.message === "invalid-p256dh" || error.message === "invalid-auth")
          ? "invalid_subscription"
          : "payload_encrypt_failed";
      return {
        status: "failed",
        failure: failure("encryption", errorCategory)
      };
    }

    let authorization: string;
    try {
      authorization = await createVapidAuthorization(
        subscription.endpoint,
        subject,
        privateKey,
        publicKey
      );
    } catch (error) {
      if (error instanceof ClassifiedWebPushError) {
        return { status: "failed", failure: error.failure };
      }
      return {
        status: "failed",
        failure: failure("vapid", "unknown")
      };
    }

    let response: Response;
    try {
      response = await this.fetcher(subscription.endpoint, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Encoding": "aes128gcm",
          TTL: "60",
          "Content-Type": "application/octet-stream"
        },
        body
      });
    } catch (error) {
      return {
        status: "failed",
        failure: failure("network", "network_failed", null, {
          requestPhase: "fetch_call",
          errorName: safeErrorName(error),
          causeCode: safeCauseCode(error),
          pushService: pushServiceFromEndpoint(subscription.endpoint)
        })
      };
    }

    const now = nowIso();
    if (response.status >= 200 && response.status < 300) {
      try {
        await this.repository.markSuccess(subscription.id, now);
      } catch {
        return {
          status: "failed",
          failure: failure("subscription", "subscription_state_update_failed")
        };
      }
      return { status: "sent", upstreamStatus: response.status };
    }

    const responseFailure =
      response.status === 404 || response.status === 410
        ? failure("push_service", "push_service_stale", response.status)
        : response.status === 401 || response.status === 403
          ? failure("push_service", "push_service_auth_failed", response.status)
          : response.status === 429
            ? failure("push_service", "push_service_rate_limited", 429)
            : response.status >= 500
              ? failure("push_service", "push_service_server_error", response.status)
              : response.status >= 400
                ? failure("push_service", "push_service_client_error", response.status)
                : failure("push_service", "unknown", response.status);

    if (responseFailure.errorCategory === "push_service_stale") {
      try {
        await this.repository.markDisabled(subscription.id, now);
      } catch {
        return {
          status: "failed",
          failure: failure("subscription", "subscription_state_update_failed")
        };
      }
      return { status: "stale", failure: responseFailure };
    }
    return { status: "failed", failure: responseFailure };
  }
}
