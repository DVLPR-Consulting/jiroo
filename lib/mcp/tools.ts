import "server-only";
import { ZodError, type z } from "zod";
import { reserveApiRequest } from "@/lib/api/rate-limit";
import { isoDate, toBacklogSummary, type ItemSummary } from "@/lib/api/dto";
import type { Actor } from "@/lib/auth/actor-context";
import { withRequestCache } from "@/lib/auth/request-cache";
import { getBacklogByKeyForUser, listBacklogsForUser } from "@/lib/services/backlogs";
import { scopeAllows, type ApiPrincipal } from "@/lib/services/api-tokens";
import { listComments } from "@/lib/services/comments";
import { findItemSummaryByKey, InvalidCursorError, searchItemsForActor } from "@/lib/services/item-search";
import { getItemByKeyForBacklog, listActivities, listUsersByIds } from "@/lib/services/items";
import { listStatusesForBacklog } from "@/lib/services/statuses";
import { addCommentUseCase } from "@/lib/use-cases/comments";
import { describeDomainError } from "@/lib/use-cases/errors";
import { createItemUseCase, updateItemUseCase } from "@/lib/use-cases/items";
import type { ApiTokenScope } from "@/lib/validation/api-token";
import {
  addCommentInput,
  createItemInput,
  getItemInput,
  listBacklogsInput,
  listMyItemsInput,
  listStatusesInput,
  searchItemsInput,
  transitionItemInput,
  updateItemInput,
} from "@/lib/mcp/schemas";

/**
 * The Jiroo MCP tools (JIR-158). Each one runs for the token's owner with
 * the owner's permissions, through the same use cases as the interface and
 * the REST API, and answers an agent in plain text plus structured content.
 * Failures are tool results (`isError`), never protocol errors.
 */

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObjectSchema = z.ZodObject<any>;

export type ToolDefinition<S extends AnyObjectSchema = AnyObjectSchema> = {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  scope: ApiTokenScope;
  handler: (input: z.output<S>, actor: Actor) => Promise<Record<string, unknown>>;
};

function define<S extends AnyObjectSchema>(tool: ToolDefinition<S>): ToolDefinition<S> {
  return tool;
}

class ToolRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRefusal";
  }
}

const NOT_FOUND = "Introuvable, ou hors de vos droits de lecture.";

async function resolveItem(actorId: string, key: string) {
  const backlogKey = key.split("-")[0]!;
  const backlog = await getBacklogByKeyForUser(backlogKey, actorId);
  const item = backlog ? await getItemByKeyForBacklog(key, backlog.id) : null;
  // The same answer for an unknown key and a backlog the actor may not read.
  if (!backlog || !item) throw new ToolRefusal(NOT_FOUND);
  return { backlog, item };
}

/** The item's summary after a mutation, by exact key (the actor could already read it). */
async function summaryOf(actorId: string, key: string): Promise<ItemSummary | null> {
  return findItemSummaryByKey(actorId, key);
}

/** Only the fields the agent sent, so an absent field is not an assignment. */
function presentFields<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export const JIROO_TOOLS = [
  define({
    name: "list_backlogs",
    title: "List backlogs",
    description: "The backlogs (projects) you can read, with their key, name and colour.",
    inputSchema: listBacklogsInput,
    scope: "read",
    async handler({ includeArchived }, actor) {
      const rows = await listBacklogsForUser(actor.actorId, { includeArchived });
      return { backlogs: rows.map(toBacklogSummary) };
    },
  }),
  define({
    name: "list_statuses",
    title: "List statuses",
    description: "The workflow statuses of one backlog, in board order, with their id (needed by transition_item) and category (todo, in_progress, done).",
    inputSchema: listStatusesInput,
    scope: "read",
    async handler({ backlog: key }, actor) {
      const backlog = await getBacklogByKeyForUser(key, actor.actorId);
      if (!backlog) throw new ToolRefusal(NOT_FOUND);
      return { backlog: toBacklogSummary(backlog), statuses: await listStatusesForBacklog(backlog.id) };
    },
  }),
  define({
    name: "search_items",
    title: "Search items",
    description: "Live items of the backlogs you can read, filtered by backlog, status, assignee, type and free text; paged in creation order with nextCursor.",
    inputSchema: searchItemsInput,
    scope: "read",
    async handler(input, actor) {
      const page = await searchItemsForActor(actor.actorId, {
        backlogKey: input.backlog,
        statusId: input.statusId,
        assignee: input.assignee,
        type: input.type,
        query: input.query,
        limit: input.limit,
        cursor: input.cursor,
      });
      return { items: page.items, nextCursor: page.nextCursor };
    },
  }),
  define({
    name: "get_item",
    title: "Get item",
    description: "One item by key, with its description, comments and activity history.",
    inputSchema: getItemInput,
    scope: "read",
    async handler({ key }, actor) {
      const { backlog, item } = await resolveItem(actor.actorId, key);
      const [summary, comments, activities] = await Promise.all([
        summaryOf(actor.actorId, key),
        listComments(item.id),
        listActivities(item.id),
      ]);
      const actorIds = [...new Set(activities.map((a) => a.actorId))];
      const names = new Map((await listUsersByIds(actorIds)).map((u) => [u.id, u.name]));
      return {
        item: {
          ...summary,
          description: item.description,
          url: `/b/${backlog.key}?item=${item.key}`,
          comments: comments.map((c) => ({
            id: c.id,
            author: { id: c.authorId, name: c.authorName },
            body: c.body,
            createdAt: isoDate(c.createdAt),
            editedAt: isoDate(c.editedAt),
            deleted: c.deleted,
          })),
          activities: activities.map((a) => ({
            id: a.id,
            actor: { id: a.actorId, name: names.get(a.actorId) ?? a.actorId },
            action: a.action,
            field: a.field,
            oldValue: a.oldValue,
            newValue: a.newValue,
            source: a.source,
            at: isoDate(a.at),
          })),
        },
      };
    },
  }),
  define({
    name: "list_my_items",
    title: "List my items",
    description: "The live items assigned to you, the token's owner.",
    inputSchema: listMyItemsInput,
    scope: "read",
    async handler({ limit, cursor }, actor) {
      const page = await searchItemsForActor(actor.actorId, { assignee: "me", limit, cursor });
      return { items: page.items, nextCursor: page.nextCursor };
    },
  }),
  define({
    name: "create_item",
    title: "Create item",
    description: "Create an item in a backlog. Needs the write scope and the create permission on that backlog.",
    inputSchema: createItemInput,
    scope: "write",
    async handler(input, actor) {
      const backlog = await getBacklogByKeyForUser(input.backlog, actor.actorId);
      if (!backlog) throw new ToolRefusal(NOT_FOUND);
      let parentId: string | null = null;
      if (input.parentKey) {
        const parent = await getItemByKeyForBacklog(input.parentKey, backlog.id);
        if (!parent) throw new ToolRefusal(`Parent ${input.parentKey} : ${NOT_FOUND.toLowerCase()}`);
        parentId = parent.id;
      }
      const { backlog: _backlogKey, parentKey: _parentKey, ...fields } = input;
      void _backlogKey;
      void _parentKey;
      const { item } = await createItemUseCase(actor, { ...presentFields(fields), backlogId: backlog.id, parentId, type: input.type, title: input.title });
      return { item: (await summaryOf(actor.actorId, item.key)) ?? { id: item.id, key: item.key } };
    },
  }),
  define({
    name: "update_item",
    title: "Update item",
    description: "Change the title, description, priority, assignee, estimate or dates of an item. Only the fields you send change; use transition_item for the status.",
    inputSchema: updateItemInput,
    scope: "write",
    async handler(input, actor) {
      const { item } = await resolveItem(actor.actorId, input.key);
      const { key: _key, ...fields } = input;
      void _key;
      const changes = presentFields(fields);
      if (Object.keys(changes).length === 0) throw new ToolRefusal("Aucun champ à modifier.");
      await updateItemUseCase(actor, { id: item.id, ...changes });
      return { item: await summaryOf(actor.actorId, item.key) };
    },
  }),
  define({
    name: "transition_item",
    title: "Transition item",
    description: "Move an item to another status of its backlog (see list_statuses). Needs the write scope and the transition permission.",
    inputSchema: transitionItemInput,
    scope: "write",
    async handler({ key, statusId }, actor) {
      const { item } = await resolveItem(actor.actorId, key);
      await updateItemUseCase(actor, { id: item.id, statusId });
      return { item: await summaryOf(actor.actorId, item.key) };
    },
  }),
  define({
    name: "add_comment",
    title: "Add comment",
    description: "Add a Markdown comment to an item, optionally notifying users by id. Needs the write scope and the comment permission.",
    inputSchema: addCommentInput,
    scope: "write",
    async handler({ key, body, mentionIds }, actor) {
      const { item } = await resolveItem(actor.actorId, key);
      const { comment } = await addCommentUseCase(actor, { itemId: item.id, body, mentionIds });
      return {
        comment: { id: comment.id, itemKey: key, body: comment.body, createdAt: isoDate(comment.createdAt) },
      };
    },
  }),
] as const satisfies readonly ToolDefinition[];

export type JirooToolName = (typeof JIROO_TOOLS)[number]["name"];

function refusal(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** The agent-facing text of an error, or `null` for one that must stay hidden. */
export function describeToolError(error: unknown): string | null {
  if (error instanceof ToolRefusal) return error.message;
  if (error instanceof InvalidCursorError) return error.message;
  if (error instanceof ZodError) {
    return `Entrée invalide : ${error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} — ${issue.message}`).join(" ; ")}`;
  }
  if (error instanceof Error && error.name === "PermissionDeniedError") {
    const decision = (error as { decision?: { permission?: string } }).decision;
    return `Permission refusée${decision?.permission ? ` (${decision.permission})` : ""}.`;
  }
  if (error instanceof Error && error.name === "ResourceNotFoundError") return NOT_FOUND;
  return describeDomainError(error);
}

/**
 * Runs one tool for a principal: scope, request budget, the actor scope and
 * the request cache, then the error mapping. Never throws.
 */
export async function runTool(
  tool: ToolDefinition,
  rawInput: unknown,
  principal: ApiPrincipal,
  now = new Date(),
): Promise<ToolResult> {
  if (!scopeAllows(principal.scope, tool.scope)) {
    return refusal(`Ce jeton est en lecture seule : l’outil ${tool.name} demande la portée « Lecture et écriture ».`);
  }
  const actor: Actor = { actorId: principal.actorId, source: "mcp", tokenId: principal.tokenId };
  try {
    // Inside the masking scope: a failed budget write must not reach the agent as SQL.
    const budget = await reserveApiRequest(principal.tokenId, now);
    if (!budget.allowed) {
      return refusal(`Trop de requêtes pour ce jeton : réessayez dans ${budget.retryAfterSeconds} s.`);
    }
    const input = tool.inputSchema.parse(rawInput ?? {});
    const structuredContent = await withRequestCache(() => tool.handler(input, actor));
    return { content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  } catch (error) {
    const described = describeToolError(error);
    if (described) return refusal(described);
    console.error(`[mcp] ${tool.name} failed`, error);
    return refusal("Une erreur interne a empêché l’opération. Réessayez ou prévenez l’équipe Jiroo.");
  }
}
