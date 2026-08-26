import { okJson } from "../lib/response";
import { unauthenticatedError } from "../lib/errors";
import {
  parseJsonBody,
  validateCreateHouseholdInput,
  validateJoinHouseholdInput,
  validateUpdateHouseholdInput
} from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { HouseholdInviteService } from "../services/household-invite-service";
import { HouseholdService } from "../services/household-service";
import type { AuthenticatedUser } from "../types/api";

const requireUser = (user: AuthenticatedUser | undefined): AuthenticatedUser => {
  if (!user) throw unauthenticatedError();
  return user;
};

const toHouseholdResponse = (
  household: Awaited<ReturnType<HouseholdService["getCurrentHousehold"]>>
) =>
  household
    ? {
        id: household.id,
        name: household.name,
        timezone: household.timezone,
        weekStartsOn: household.weekStartsOn,
        role: household.role
      }
    : null;

export const currentHouseholdRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const household = await new HouseholdService(context.env.DB).getCurrentHousehold(
    user.id
  );
  return okJson({ household: toHouseholdResponse(household) }, context.requestId);
});

export const createHouseholdRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateCreateHouseholdInput(await parseJsonBody(context.request));
  const household = await new HouseholdService(context.env.DB).createHousehold(
    user.id,
    input
  );
  return okJson({ household: toHouseholdResponse(household) }, context.requestId, {
    status: 201
  });
});

export const updateCurrentHouseholdRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateUpdateHouseholdInput(await parseJsonBody(context.request));
  const household = await new HouseholdService(context.env.DB).updateCurrentHousehold(
    user.id,
    input
  );
  return okJson({ household: toHouseholdResponse(household) }, context.requestId);
});

export const currentHouseholdMembersRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const members = await new HouseholdService(context.env.DB).listCurrentMembers(
    user.id
  );
  return okJson(
    {
      members: members.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        color: member.color,
        joinedAt: member.joinedAt,
        avatarUrl: member.avatar
          ? `/api/users/${encodeURIComponent(member.userId)}/avatar?v=${encodeURIComponent(member.avatarUpdatedAt ?? "")}`
          : null
      }))
    },
    context.requestId
  );
});

export const createHouseholdInviteRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const invite = await new HouseholdInviteService(context.env.DB).createInvite(user.id);
  return okJson({ invite }, context.requestId, { status: 201 });
});

export const joinHouseholdRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateJoinHouseholdInput(await parseJsonBody(context.request));
  const household = await new HouseholdInviteService(context.env.DB).joinByCode(
    user.id,
    input.code
  );
  return okJson({ household: toHouseholdResponse(household) }, context.requestId);
});

export const validateHouseholdInviteRoute: Handler = async (context) => {
  const input = validateJoinHouseholdInput(await parseJsonBody(context.request));
  const valid = await new HouseholdInviteService(context.env.DB).validateCode(input.code);
  return okJson({ valid }, context.requestId);
};
