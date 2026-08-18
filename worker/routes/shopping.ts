import { unauthenticatedError } from "../lib/errors";
import { okJson } from "../lib/response";
import {
  parseJsonBody,
  validateShoppingUpdateInput,
  validateShoppingWriteInput,
  validateShoppingTemplateUpdateInput,
  validateShoppingTemplateWriteInput
} from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { ShoppingService } from "../services/shopping-service";
import { ShoppingTemplateService } from "../services/shopping-template-service";
import type { AuthenticatedUser } from "../types/api";
import type { ShoppingItem, ShoppingRecentItem, ShoppingTemplate } from "../types/domain";

const requireUser = (user: AuthenticatedUser | undefined): AuthenticatedUser => {
  if (!user) throw unauthenticatedError();
  return user;
};

export const itemResponse = (item: ShoppingItem) => ({
  id: item.id,
  name: item.name,
  quantity: item.quantity,
  note: item.note,
  plannedPurchaseDate: item.plannedPurchaseDate,
  status: item.status,
  addedBy: item.addedBy,
  purchasedBy: item.purchasedBy
    ? { userId: item.purchasedBy, displayName: item.purchasedByDisplayName }
    : null,
  purchasedAt: item.purchasedAt,
  sortOrder: item.sortOrder,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  image: item.image
});

const templateResponse = (template: ShoppingTemplate) => ({
  id: template.id,
  name: template.name,
  quantity: template.quantity,
  note: template.note,
  active: template.active,
  sortOrder: template.sortOrder,
  createdBy: template.createdBy,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt
});

const recentResponse = (item: ShoppingRecentItem) => ({
  name: item.name,
  quantity: item.quantity,
  note: item.note,
  createdAt: item.createdAt
});

export const listShoppingItemsRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const data = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).listItems(user.id);
  return okJson(
    {
      pending: data.pending.map(itemResponse),
      purchased: data.purchased.map(itemResponse)
    },
    context.requestId
  );
});

export const listRecentShoppingItemsRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const limitValue = new URL(context.request.url).searchParams.get("limit");
  const parsedLimit = limitValue ? Number(limitValue) : 8;
  const limit = Number.isInteger(parsedLimit) ? parsedLimit : 8;
  const items = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).listRecentItems(user.id, limit);
  return okJson({ items: items.map(recentResponse) }, context.requestId);
});

export const createShoppingItemRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateShoppingWriteInput(await parseJsonBody(context.request));
  const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).createItem(user.id, input);
  return okJson({ item: itemResponse(item) }, context.requestId, { status: 201 });
});

export const getShoppingItemRoute = (itemId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).getItem(user.id, itemId);
    return okJson({ item: itemResponse(item) }, context.requestId);
  });

export const updateShoppingItemRoute = (itemId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const input = validateShoppingUpdateInput(await parseJsonBody(context.request));
    const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).updateItem(user.id, itemId, input);
    return okJson({ item: itemResponse(item) }, context.requestId);
  });

export const deleteShoppingItemRoute = (itemId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).deleteItem(user.id, itemId);
    return okJson({ deleted: true }, context.requestId);
  });

export const purchaseShoppingItemRoute = (itemId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    await parseJsonBody(context.request);
    const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).markPurchased(user.id, itemId);
    return okJson({ item: itemResponse(item) }, context.requestId);
  });

export const unpurchaseShoppingItemRoute = (itemId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    await parseJsonBody(context.request);
    const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).markPending(user.id, itemId);
    return okJson({ item: itemResponse(item) }, context.requestId);
  });

export const clearPurchasedShoppingItemsRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  await parseJsonBody(context.request);
  const clearedCount = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).clearPurchased(user.id);
  return okJson({ clearedCount }, context.requestId);
});

export const listShoppingTemplatesRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const templates = await new ShoppingTemplateService(context.env.DB).listTemplates(user.id);
  return okJson({ templates: templates.map(templateResponse) }, context.requestId);
});

export const createShoppingTemplateRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateShoppingTemplateWriteInput(await parseJsonBody(context.request));
  const template = await new ShoppingTemplateService(context.env.DB).createTemplate(user.id, input);
  return okJson({ template: templateResponse(template) }, context.requestId, { status: 201 });
});

export const getShoppingTemplateRoute = (templateId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const template = await new ShoppingTemplateService(context.env.DB).getTemplate(user.id, templateId);
    return okJson({ template: templateResponse(template) }, context.requestId);
  });

export const updateShoppingTemplateRoute = (templateId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const input = validateShoppingTemplateUpdateInput(await parseJsonBody(context.request));
    const template = await new ShoppingTemplateService(context.env.DB).updateTemplate(user.id, templateId, input);
    return okJson({ template: templateResponse(template) }, context.requestId);
  });

export const deleteShoppingTemplateRoute = (templateId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    await new ShoppingTemplateService(context.env.DB).deactivateTemplate(user.id, templateId);
    return okJson({ deleted: true }, context.requestId);
  });

export const addShoppingItemFromTemplateRoute = (templateId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    await parseJsonBody(context.request);
    const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).addFromTemplate(user.id, templateId);
    return okJson({ item: itemResponse(item) }, context.requestId, { status: 201 });
  });
