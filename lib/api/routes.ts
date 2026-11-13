import { withApiAuth } from "@/lib/api/handler";
import { jsonOk, parseJson } from "@/lib/api/http";
import { commentRestInput, createRestItemInput, parseSearchParams, updateRestItemInput } from "@/lib/api/schemas";
import { BACKLOG_KEY, ITEM_KEY } from "@/lib/mcp/schemas";
import { getApiComment, getApiItemDetail, getApiItemSummary, getApiMe, listApiBacklogs, listApiStatuses, resolveApiBacklog, resolveApiItem } from "@/lib/services/api-read";
import { searchItemsForActor } from "@/lib/services/item-search";
import { addCommentUseCase } from "@/lib/use-cases/comments";
import { createItemUseCase, updateItemUseCase } from "@/lib/use-cases/items";

export const getMe = withApiAuth("read", async (_request, actor) => jsonOk(await getApiMe(actor.actorId, actor.tokenId!)));
export const getBacklogs = withApiAuth("read", async (_request, actor) => jsonOk({ backlogs: await listApiBacklogs(actor.actorId) }));
export const getStatuses = withApiAuth<{ key: string }>("read", async (_request, actor, params) => jsonOk({ statuses: await listApiStatuses(actor.actorId, BACKLOG_KEY.parse(params.key)) }));
export const getItems = withApiAuth("read", async (request, actor) => {
  const { backlog, query, statusId, ...filters } = parseSearchParams(request.url);
  return jsonOk(await searchItemsForActor(actor.actorId, { ...filters, backlogKey: backlog, statusId, query }));
});
export const getItem = withApiAuth<{ key: string }>("read", async (_request, actor, params) => jsonOk({ item: await getApiItemDetail(actor.actorId, ITEM_KEY.parse(params.key)) }));
export const getMyItems = withApiAuth("read", async (_request, actor) => {
  const items = [];
  let cursor: string | null = null;
  do {
    const page = await searchItemsForActor(actor.actorId, { assignee: "me", limit: 100, cursor });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return jsonOk({ items });
});
export const postItem = withApiAuth("write", async (request, actor) => {
  const { backlogKey, parentKey, ...input } = await parseJson(request, createRestItemInput);
  const backlog = await resolveApiBacklog(actor.actorId, backlogKey);
  const parent = parentKey ? await resolveApiItem(actor.actorId, parentKey) : null;
  const result = await createItemUseCase(actor, { ...input, backlogId: backlog.backlogId, parentId: parent?.id ?? null });
  return jsonOk({ item: await getApiItemSummary(actor.actorId, result.item.key) }, 201);
});
export const patchItem = withApiAuth<{ key: string }>("write", async (request, actor, params) => {
  const key = ITEM_KEY.parse(params.key);
  const input = await parseJson(request, updateRestItemInput);
  const item = await resolveApiItem(actor.actorId, key);
  await updateItemUseCase(actor, { ...input, id: item.id });
  return jsonOk({ item: await getApiItemSummary(actor.actorId, key) });
});
export const postComment = withApiAuth<{ key: string }>("write", async (request, actor, params) => {
  const key = ITEM_KEY.parse(params.key);
  const input = await parseJson(request, commentRestInput);
  const item = await resolveApiItem(actor.actorId, key);
  const { comment } = await addCommentUseCase(actor, { ...input, itemId: item.id });
  return jsonOk({ comment: await getApiComment(actor.actorId, key, comment.id) }, 201);
});
