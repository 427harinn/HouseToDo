import { AuthService } from "../services/auth-service";
import type { Handler } from "./error-handler";

export const requireAuth =
  (handler: Handler): Handler =>
  async (context) => {
    const authService = new AuthService(context.env.DB);
    const user = await authService.authenticateRequest(context.request);
    return handler({ ...context, user });
  };
