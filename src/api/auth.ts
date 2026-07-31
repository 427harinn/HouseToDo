import { apiRequest } from "./client";
import type { AuthUser } from "../types";

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  displayName: string;
};

export const login = (input: LoginInput, signal?: AbortSignal) =>
  apiRequest<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const register = (input: RegisterInput, signal?: AbortSignal) =>
  apiRequest<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const logout = (signal?: AbortSignal) =>
  apiRequest<{ loggedOut: true }>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export const me = (signal?: AbortSignal) =>
  apiRequest<{ user: AuthUser }>("/api/auth/me", { signal });
