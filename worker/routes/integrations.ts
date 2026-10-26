import { notFoundError } from "../lib/errors";
import { okJson } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { OAuthService } from "../services/oauth-service";

export const listIntegrationsRoute: Handler = requireAuth(async (context) => {
  const integrations = await new OAuthService(context.env).listUserGrants(context.user!.id);
  return okJson({ integrations }, context.requestId, {
    headers: { "cache-control": "private, no-store" }
  });
});

export const revokeIntegrationRoute = (grantId: string): Handler =>
  requireAuth(async (context) => {
    const revoked = await new OAuthService(context.env).revokeUserGrant(
      context.user!.id,
      grantId
    );
    if (!revoked) throw notFoundError();
    return okJson({ revoked: true }, context.requestId, {
      headers: { "cache-control": "no-store" }
    });
  });
