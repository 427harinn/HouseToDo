import { unauthenticatedError } from "../lib/errors";
import { okJson } from "../lib/response";
import { parseJsonBody, validateTaskTemplatePatchInput, validateTaskTemplateWriteInput } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { TaskTemplateService } from "../services/task-template-service";
import type { AuthenticatedUser } from "../types/api";
import type { TaskTemplate } from "../types/domain";

const requireUser = (user: AuthenticatedUser | undefined): AuthenticatedUser => {
  if (!user) throw unauthenticatedError();
  return user;
};

const templateResponse = (template: TaskTemplate) => ({
  id: template.id,
  title: template.title,
  name: template.title,
  description: template.description,
  note: template.description,
  modelRecurrenceType: template.modelRecurrenceType,
  executionTiming: template.executionTiming,
  deadlineDate: template.deadlineDate,
  assignmentType: template.assignmentType,
  assignedUserId: template.assignedUserId,
  assignment: { type: template.assignmentType, user: template.assignedUserId ? { userId: template.assignedUserId } : null },
  weekdays: template.weekdays,
  deadlineTime: template.deadlineTime,
  notificationOffsetMinutes: template.notificationOffsetMinutes,
  weeklyDeadlineWeekday: template.weeklyDeadlineWeekday,
  monthlyDayOfMonth: template.monthlyDayOfMonth,
  monthlyDeadlineDay: template.monthlyDeadlineType === "day_of_month" ? template.monthlyDayOfMonth : null,
  monthlyDeadlineType: template.monthlyDeadlineType,
  active: template.active,
  sortOrder: template.sortOrder,
  createdBy: template.createdBy,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt
});

export const listTaskTemplatesRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const templates = await new TaskTemplateService(context.env.DB).listTemplates(user.id);
  return okJson({ templates: templates.map(templateResponse) }, context.requestId);
});

export const createTaskTemplateRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateTaskTemplateWriteInput(await parseJsonBody(context.request));
  const template = await new TaskTemplateService(context.env.DB).createTemplate(user.id, input);
  return okJson({ template: templateResponse(template) }, context.requestId, { status: 201 });
});

export const getTaskTemplateRoute = (templateId: string): Handler => requireAuth(async (context) => {
  const user = requireUser(context.user);
  const template = await new TaskTemplateService(context.env.DB).getTemplate(user.id, templateId);
  return okJson({ template: templateResponse(template) }, context.requestId);
});

export const updateTaskTemplateRoute = (templateId: string): Handler => requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateTaskTemplatePatchInput(await parseJsonBody(context.request));
  const template = await new TaskTemplateService(context.env.DB).updateTemplate(user.id, templateId, input, validateTaskTemplateWriteInput);
  return okJson({ template: templateResponse(template) }, context.requestId);
});

export const deleteTaskTemplateRoute = (templateId: string): Handler => requireAuth(async (context) => {
  const user = requireUser(context.user);
  await new TaskTemplateService(context.env.DB).deactivateTemplate(user.id, templateId);
  return okJson({ deleted: true }, context.requestId);
});
