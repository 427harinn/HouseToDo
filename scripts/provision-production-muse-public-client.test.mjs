import { describe, expect, it } from "vitest";
import {
  buildPublicClientInsertSql,
  MUSE_ALLOWED_SCOPES,
  MUSE_CONFIDENTIAL_CLIENT_ID,
  MUSE_PUBLIC_CLIENT_ID,
  MUSE_REDIRECT_URI,
  planPublicClientProvisioning
} from "./provision-production-muse-public-client.mjs";

const publicClient = {
  client_id: MUSE_PUBLIC_CLIENT_ID,
  client_name: "Muse",
  client_secret_hash: null,
  allowed_scopes: JSON.stringify(MUSE_ALLOWED_SCOPES),
  token_endpoint_auth_method: "none",
  enabled: 1
};

describe("production Muse public client provisioning", () => {
  it("inserts the public client with no secret and exact auth, scopes, and redirect", () => {
    const sql = buildPublicClientInsertSql("2026-10-26T00:00:00.000Z");
    expect(sql).toContain("'housetodo-muse'");
    expect(sql).toContain("'Muse', NULL,");
    expect(sql).toContain("'none', 1,");
    expect(sql).toContain(JSON.stringify(MUSE_ALLOWED_SCOPES));
    expect(sql).toContain(MUSE_REDIRECT_URI);
    expect(sql).not.toMatch(/randomBytes|CLIENT_SECRET=/i);
  });

  it("plans insertion for a missing client and no-ops an exact duplicate", () => {
    expect(planPublicClientProvisioning({ client: null, redirectUris: [] })).toBe("insert");
    expect(planPublicClientProvisioning({ client: publicClient, redirectUris: [MUSE_REDIRECT_URI] })).toBe("noop");
  });

  it("refuses to overwrite an existing client whose fields or redirects differ", () => {
    expect(() => planPublicClientProvisioning({ client: { ...publicClient, client_secret_hash: "unexpected" }, redirectUris: [MUSE_REDIRECT_URI] })).toThrow(/refusing to overwrite/);
    expect(() => planPublicClientProvisioning({ client: publicClient, redirectUris: ["https://wrong.example/callback"] })).toThrow(/refusing to overwrite/);
    expect(() => planPublicClientProvisioning({ client: publicClient, redirectUris: [MUSE_REDIRECT_URI, "https://wrong.example/callback"] })).toThrow(/refusing to overwrite/);
  });

  it("does not target the existing confidential client or its records", () => {
    const sql = buildPublicClientInsertSql("2026-10-26T00:00:00.000Z");
    expect(MUSE_CONFIDENTIAL_CLIENT_ID).toBe("housetodo-muse-production");
    expect(sql).not.toContain(MUSE_CONFIDENTIAL_CLIENT_ID);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|REVOKE)\b/i);
  });
});
