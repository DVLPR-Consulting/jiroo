import { z } from "zod";
import { ITEM_DESCRIPTION_MAX, ITEM_TITLE_MAX } from "@/lib/validation/item";

/**
 * Input schemas of the Jiroo MCP tools (JIR-158). Descriptions are read by
 * the agents, so they say what a field means in Jiroo's terms. The REST API
 * (JIR-157) accepts the same shapes.
 */

export const BACKLOG_KEY = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9]{1,9}$/, "A backlog key: 2 to 10 letters or digits, such as CASS.")
  .transform((key) => key.toUpperCase())
  .describe("Backlog key, such as CASS.");

export const ITEM_KEY = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9]{1,9}-\d{1,9}$/, "An item key: the backlog key, a hyphen and a number, such as CASS-12.")
  .transform((key) => key.toUpperCase())
  .describe("Item key, such as CASS-12.");

const uuid = z.uuid();
// user.id is text (Better Auth), not a uuid.
const userId = z.string().trim().min(1).max(64).describe("A user id (see the assignee ids of other items).");
const estimate = z.number().min(0).max(999.99).describe("Story points, two decimals at most; tasks only.");
const priority = z.number().int().min(0).max(4).describe("0 = none, 1 = lowest … 4 = highest.");
const isoDate = z.iso.date().describe("A calendar date, YYYY-MM-DD.");

export const listBacklogsInput = z.object({
  includeArchived: z.boolean().default(false).describe("Also return archived backlogs."),
});

export const listStatusesInput = z.object({
  backlog: BACKLOG_KEY,
});

export const searchItemsInput = z.object({
  backlog: BACKLOG_KEY.optional().describe("Limit to one backlog; otherwise every backlog you can read."),
  query: z.string().trim().max(200).optional().describe("Free text, matched on the key and the title."),
  statusId: uuid.optional().describe("Only items in this status (see list_statuses)."),
  assignee: z
    .union([z.literal("me"), userId])
    .optional()
    .describe("Only items assigned to this user id, or \"me\" for the token's owner."),
  type: z.enum(["composant", "epic", "tache", "soustache"]).optional().describe("Only this item type."),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional().describe("The nextCursor of a previous page."),
});

export const getItemInput = z.object({
  key: ITEM_KEY,
});

export const listMyItemsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional().describe("The nextCursor of a previous page."),
});

export const createItemInput = z.object({
  backlog: BACKLOG_KEY,
  type: z.enum(["composant", "epic", "tache", "soustache"]).describe("Hierarchy level: composant > epic > tache > soustache."),
  title: z.string().trim().min(1).max(ITEM_TITLE_MAX),
  description: z.string().max(ITEM_DESCRIPTION_MAX).optional().describe("Markdown."),
  parentKey: ITEM_KEY.optional().describe("Key of the parent item, one level up."),
  statusId: uuid.optional().describe("Initial status; the backlog's default « À faire » status otherwise."),
  priority: priority.optional(),
  assigneeId: userId.optional(),
  estimatePoints: estimate.optional(),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  kind: z.enum(["feature", "bug"]).optional(),
  sprintId: uuid.optional().describe("Plan the task in this sprint right away."),
});

export const updateItemInput = z.object({
  key: ITEM_KEY,
  title: z.string().trim().min(1).max(ITEM_TITLE_MAX).optional(),
  description: z.string().max(ITEM_DESCRIPTION_MAX).nullable().optional().describe("Markdown; null clears it."),
  priority: priority.optional(),
  assigneeId: userId.nullable().optional().describe("null unassigns."),
  estimatePoints: estimate.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});

export const transitionItemInput = z.object({
  key: ITEM_KEY,
  statusId: uuid.describe("Target status id, from list_statuses of the item's backlog."),
});

export const addCommentInput = z.object({
  key: ITEM_KEY,
  body: z.string().trim().min(1).max(20_000).describe("Markdown."),
  mentionIds: z.array(userId).max(50).default([]).describe("User ids to notify."),
});

export type SearchItemsInput = z.infer<typeof searchItemsInput>;
export type CreateItemInput = z.infer<typeof createItemInput>;
export type UpdateItemInput = z.infer<typeof updateItemInput>;
