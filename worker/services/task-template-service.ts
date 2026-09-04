import { nowIso } from "../lib/date";
import { inactiveTaskTemplateError, taskTemplateNotFoundError, AppError } from "../lib/errors";
import { validateTaskTemplateWriteInput, type TaskTemplatePatchInput, type TaskTemplateWriteInput } from "../lib/validation";
import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { TaskTemplateRepository } from "../repositories/task-template-repository";
import type { TaskTemplate } from "../types/domain";
import { HouseholdService } from "./household-service";

type ValidatedTemplateInput = ReturnType<typeof validateTaskTemplateWriteInput>;

export class TaskTemplateService {
  private readonly households: HouseholdService;
  private readonly members: HouseholdMemberRepository;
  private readonly templates: TaskTemplateRepository;

  constructor(db: D1Database) {
    this.households = new HouseholdService(db);
    this.members = new HouseholdMemberRepository(db);
    this.templates = new TaskTemplateRepository(db);
  }

  async listTemplates(userId: string): Promise<TaskTemplate[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    return this.templates.listByHouseholdId(household.id);
  }

  async getTemplate(userId: string, templateId: string): Promise<TaskTemplate> {
    const household = await this.households.requireCurrentHousehold(userId);
    const template = await this.templates.findByIdForHousehold(household.id, templateId);
    if (!template) throw taskTemplateNotFoundError();
    return template;
  }

  async createTemplate(userId: string, input: ValidatedTemplateInput): Promise<TaskTemplate> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.validateAssignee(household.id, input);
    return this.templates.create({
      id: crypto.randomUUID(),
      householdId: household.id,
      ...input,
      sortOrder: await this.templates.getNextSortOrder(household.id),
      createdBy: userId,
      now: nowIso()
    });
  }

  async updateTemplate(userId: string, templateId: string, input: TaskTemplatePatchInput, validate: (value: unknown) => ValidatedTemplateInput): Promise<TaskTemplate> {
    const household = await this.households.requireCurrentHousehold(userId);
    const current = await this.templates.findByIdForHousehold(household.id, templateId);
    if (!current) throw taskTemplateNotFoundError();
    if (!current.active) throw inactiveTaskTemplateError();
    const candidate = {
      title: current.title,
      description: current.description,
      modelRecurrenceType: current.modelRecurrenceType,
      executionTiming: current.executionTiming,
      deadlineDate: current.deadlineDate,
      assignmentType: current.assignmentType,
      assignedUserId: current.assignedUserId,
      weekdays: current.weekdays,
      deadlineTime: current.deadlineTime,
      notificationOffsetMinutes: current.notificationOffsetMinutes,
      weeklyDeadlineWeekday: current.weeklyDeadlineWeekday,
      monthlyDayOfMonth: current.monthlyDayOfMonth,
      monthlyDeadlineType: current.monthlyDeadlineType,
      ...input
    };
    const normalized = validate(candidate);
    await this.validateAssignee(household.id, normalized);
    const updated = await this.templates.update(household.id, templateId, { ...normalized, now: nowIso() });
    if (!updated) throw taskTemplateNotFoundError();
    return updated;
  }

  async deactivateTemplate(userId: string, templateId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    const deactivated = await this.templates.deactivate(household.id, templateId, nowIso());
    if (!deactivated) throw taskTemplateNotFoundError();
  }

  private async validateAssignee(householdId: string, input: TaskTemplateWriteInput): Promise<void> {
    if (input.assignmentType !== "specific" || !input.assignedUserId) return;
    const membership = await this.members.findMembership(householdId, input.assignedUserId);
    if (!membership) {
      throw new AppError({
        code: "ASSIGNEE_NOT_HOUSEHOLD_MEMBER",
        status: 400,
        message: "Assigned user must be a household member.",
        details: { assignedUserId: "Assigned user must be a household member." }
      });
    }
  }
}
