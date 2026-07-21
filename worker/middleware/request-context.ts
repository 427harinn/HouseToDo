import type { AuthenticatedUser } from "../types/api";
import type { Env } from "../types/env";

export type RequestContext = {
  request: Request;
  env: Env;
  requestId: string;
  user?: AuthenticatedUser;
};

export const createRequestContext = (request: Request, env: Env): RequestContext => {
  const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
  return { request, env, requestId };
};
