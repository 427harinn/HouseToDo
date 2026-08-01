import { nowIso } from "../lib/date";
import {
  inactiveShoppingTemplateError,
  shoppingTemplateNotFoundError
} from "../lib/errors";
import type { ShoppingUpdateInput, ShoppingWriteInput } from "../lib/validation";
import { ShoppingTemplateRepository } from "../repositories/shopping-template-repository";
import type { ShoppingTemplate } from "../types/domain";
import { HouseholdService } from "./household-service";

export class ShoppingTemplateService {
  private readonly households: HouseholdService;
  private readonly templates: ShoppingTemplateRepository;

  constructor(db: D1Database) {
    this.households = new HouseholdService(db);
    this.templates = new ShoppingTemplateRepository(db);
  }

  async listTemplates(userId: string): Promise<ShoppingTemplate[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    return this.templates.listByHouseholdId(household.id);
  }

  async getTemplate(userId: string, templateId: string): Promise<ShoppingTemplate> {
    const household = await this.households.requireCurrentHousehold(userId);
    const template = await this.templates.findByIdForHousehold(household.id, templateId);
    if (!template) throw shoppingTemplateNotFoundError();
    return template;
  }

  async createTemplate(userId: string, input: ShoppingWriteInput): Promise<ShoppingTemplate> {
    const household = await this.households.requireCurrentHousehold(userId);
    const now = nowIso();
    return this.templates.create({
      id: crypto.randomUUID(),
      householdId: household.id,
      ...input,
      sortOrder: await this.templates.getNextSortOrder(household.id),
      createdBy: userId,
      now
    });
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    input: ShoppingUpdateInput
  ): Promise<ShoppingTemplate> {
    const household = await this.households.requireCurrentHousehold(userId);
    const current = await this.templates.findByIdForHousehold(household.id, templateId);
    if (!current) throw shoppingTemplateNotFoundError();
    if (!current.active) throw inactiveShoppingTemplateError();
    const updated = await this.templates.update(household.id, templateId, { ...input, now: nowIso() });
    if (!updated) throw shoppingTemplateNotFoundError();
    return updated;
  }

  async deactivateTemplate(userId: string, templateId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    const deactivated = await this.templates.deactivate(household.id, templateId, nowIso());
    if (!deactivated) throw shoppingTemplateNotFoundError();
  }
}
