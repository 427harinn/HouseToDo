import { apiRequest } from "./client";
import type { CreatedInvite, Household, HouseholdMember } from "../types";

export const getCurrentHousehold = (signal?: AbortSignal) =>
  apiRequest<{ household: Household | null }>("/api/households/current", { signal });

export const createHousehold = (name: string, signal?: AbortSignal) =>
  apiRequest<{ household: Household }>("/api/households", {
    method: "POST",
    body: JSON.stringify({ name }),
    signal
  });

export const joinHousehold = (code: string, signal?: AbortSignal) =>
  apiRequest<{ household: Household }>("/api/households/join", {
    method: "POST",
    body: JSON.stringify({ code }),
    signal
  });

export const validateInviteCode = (code: string, signal?: AbortSignal) =>
  apiRequest<{ valid: boolean }>("/api/households/invites/validate", {
    method: "POST",
    body: JSON.stringify({ code }),
    signal
  });

export const listMembers = (signal?: AbortSignal) =>
  apiRequest<{ members: HouseholdMember[] }>("/api/households/current/members", {
    signal
  });

export const createInvite = (signal?: AbortSignal) =>
  apiRequest<{ invite: CreatedInvite }>("/api/households/current/invites", {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export type UpdateCurrentHouseholdInput = {
  name?: string;
  timezone?: string;
  weekStartsOn?: number;
};

export const updateCurrentHousehold = (
  input: UpdateCurrentHouseholdInput,
  signal?: AbortSignal
) =>
  apiRequest<{ household: Household }>("/api/households/current", {
    method: "PATCH",
    body: JSON.stringify(input),
    signal
  });
