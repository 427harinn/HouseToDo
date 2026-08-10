import { base64UrlToBytes, bytesToBase64Url } from "../lib/crypto";
import { nowIso } from "../lib/date";
import {
  PushSubscriptionRepository,
  type PushSubscriptionRecord
} from "../repositories/push-subscription-repository";

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
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    parsePrivateJwk(privateKeyText),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
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
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, input)
  );
  return `vapid t=${header}.${body}.${bytesToBase64Url(signature)}, k=${publicKey}`;
};

export type PushDeliveryResult = "sent" | "stale" | "failed";

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
      WEB_PUSH_VAPID_PUBLIC_KEY?: string;
      WEB_PUSH_VAPID_PRIVATE_KEY?: string;
      WEB_PUSH_SUBJECT?: string;
    }
  ): Promise<{ sent: number; failed: number }> {
    const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = env.WEB_PUSH_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject || !/^(mailto:|https:)/.test(subject))
      throw new Error("push-config-missing");
    const subscriptions = await this.repository.listActiveByUserHousehold(
      userId,
      householdId
    );
    let sent = 0;
    let failed = 0;
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
      if (result === "sent") sent += 1;
      else failed += 1;
    }
    return { sent, failed };
  }

  private async sendOne(
    subscription: PushSubscriptionRecord,
    payload: object,
    publicKey: string,
    privateKey: string,
    subject: string
  ): Promise<PushDeliveryResult> {
    try {
      const body = await encryptPayload(subscription, JSON.stringify(payload));
      const response = await this.fetcher(subscription.endpoint, {
        method: "POST",
        headers: {
          Authorization: await createVapidAuthorization(
            subscription.endpoint,
            subject,
            privateKey,
            publicKey
          ),
          "Content-Encoding": "aes128gcm",
          TTL: "60",
          "Content-Type": "application/octet-stream"
        },
        body
      });
      const now = nowIso();
      if (response.status >= 200 && response.status < 300) {
        await this.repository.markSuccess(subscription.id, now);
        return "sent";
      }
      if (response.status === 404 || response.status === 410) {
        await this.repository.markDisabled(subscription.id, now);
        return "stale";
      }
      return "failed";
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "web_push_delivery_failed",
          endpointSuffix: subscription.endpoint_hash?.slice(-8) ?? "unknown",
          errorCode: error instanceof Error ? error.message : "unknown"
        })
      );
      return "failed";
    }
  }
}
