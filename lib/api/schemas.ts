import { addCommentInput, createItemInput, searchItemsInput, transitionItemInput, updateItemInput } from "@/lib/mcp/schemas";
import { createItemSchema } from "@/lib/validation/item";

export const createRestItemInput = createItemInput.omit({ backlog: true }).extend({
  backlogKey: createItemInput.shape.backlog,
  labelIds: createItemSchema.shape.labelIds,
}).strict();
export const updateRestItemInput = updateItemInput.omit({ key: true }).extend({
  statusId: transitionItemInput.shape.statusId.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "Indiquez au moins un champ à modifier.");
export const commentRestInput = addCommentInput.omit({ key: true }).strict();
export function parseSearchParams(url: string) {
  const params = new URL(url).searchParams;
  return searchItemsInput.parse({
    backlog: params.get("backlog") ?? undefined,
    query: params.get("q") ?? undefined,
    statusId: params.get("status") ?? undefined,
    assignee: params.get("assignee") ?? undefined,
    type: params.get("type") ?? undefined,
    limit: params.has("limit") ? Number(params.get("limit")) : undefined,
    cursor: params.get("cursor") ?? undefined,
  });
}
