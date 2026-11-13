import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  addCommentUseCase: vi.fn(),
  createItemUseCase: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getItemByKeyForBacklog: vi.fn(),
  listActivities: vi.fn(),
  listBacklogsForUser: vi.fn(),
  listComments: vi.fn(),
  listStatusesForBacklog: vi.fn(),
  listUsersByIds: vi.fn(),
  reserveApiRequest: vi.fn(),
  searchItemsForActor: vi.fn(),
  updateItemUseCase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/rate-limit", () => ({ reserveApiRequest: mocks.reserveApiRequest }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
  listBacklogsForUser: mocks.listBacklogsForUser,
}));
vi.mock("@/lib/services/comments", () => ({ listComments: mocks.listComments }));
vi.mock("@/lib/services/item-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/item-search")>()),
  searchItemsForActor: mocks.searchItemsForActor,
}));
vi.mock("@/lib/services/items", () => ({
  getItemByKeyForBacklog: mocks.getItemByKeyForBacklog,
  listActivities: mocks.listActivities,
  listUsersByIds: mocks.listUsersByIds,
}));
vi.mock("@/lib/services/statuses", () => ({ listStatusesForBacklog: mocks.listStatusesForBacklog }));
vi.mock("@/lib/use-cases/comments", () => ({ addCommentUseCase: mocks.addCommentUseCase }));
vi.mock("@/lib/use-cases/items", () => ({
  createItemUseCase: mocks.createItemUseCase,
  updateItemUseCase: mocks.updateItemUseCase,
}));

import { currentActivitySource } from "@/lib/auth/actor-context";
import { JIROO_TOOLS, runTool, type ToolDefinition } from "@/lib/mcp/tools";

const reader = { actorId: "user-1", tokenId: "token-1", scope: "read" as const };
const writer = { actorId: "user-1", tokenId: "token-2", scope: "write" as const };
const backlog = { id: "backlog-1", key: "CASS", name: "Pôle civil", color: "#123456", archivedAt: null };
const itemRow = { id: "item-1", key: "CASS-12", description: "Détails", backlogId: "backlog-1" };
const summary = { id: "item-1", key: "CASS-12", title: "Rédiger" };

function tool(name: string): ToolDefinition {
  const found = JIROO_TOOLS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`unknown tool ${name}`);
  return found as ToolDefinition;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.reserveApiRequest.mockResolvedValue({ allowed: true, count: 1, retryAfterSeconds: 60 });
  mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
  mocks.getItemByKeyForBacklog.mockResolvedValue(itemRow);
  mocks.searchItemsForActor.mockResolvedValue({ items: [summary], nextCursor: null });
  mocks.listBacklogsForUser.mockResolvedValue([backlog]);
  mocks.listStatusesForBacklog.mockResolvedValue([{ id: "status-1", name: "À faire", category: "todo", color: "#fff", order: 0 }]);
  mocks.listComments.mockResolvedValue([]);
  mocks.listActivities.mockResolvedValue([]);
  mocks.listUsersByIds.mockResolvedValue([]);
  mocks.createItemUseCase.mockResolvedValue({ item: { id: "item-9", key: "CASS-99" }, backlogId: "backlog-1" });
  mocks.updateItemUseCase.mockResolvedValue({ item: { id: "item-1" }, backlogId: "backlog-1" });
  mocks.addCommentUseCase.mockResolvedValue({ comment: { id: "comment-1", body: "Bonjour", createdAt: new Date("2026-11-13T08:00:00.000Z") }, backlogId: "backlog-1" });
});

describe("the tool catalogue", () => {
  it("exposes the nine planned tools with their scopes", () => {
    expect(JIROO_TOOLS.map((t) => [t.name, t.scope])).toEqual([
      ["list_backlogs", "read"],
      ["list_statuses", "read"],
      ["search_items", "read"],
      ["get_item", "read"],
      ["list_my_items", "read"],
      ["create_item", "write"],
      ["update_item", "write"],
      ["transition_item", "write"],
      ["add_comment", "write"],
    ]);
  });
});

describe("runTool", () => {
  it("refuses a write tool to a read token as a tool result, before any budget or work", async () => {
    const result = await runTool(tool("add_comment"), { key: "CASS-12", body: "x" }, reader);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("lecture seule");
    expect(mocks.reserveApiRequest).not.toHaveBeenCalled();
    expect(mocks.addCommentUseCase).not.toHaveBeenCalled();
  });

  it("refuses when the token's budget is spent, with the wait time", async () => {
    mocks.reserveApiRequest.mockResolvedValueOnce({ allowed: false, count: 301, retryAfterSeconds: 17 });
    const result = await runTool(tool("list_backlogs"), {}, reader);
    expect(result).toMatchObject({ isError: true });
    expect(result.content[0]!.text).toContain("17 s");
    expect(mocks.listBacklogsForUser).not.toHaveBeenCalled();
  });

  it("lists the backlogs for the token's owner as structured content", async () => {
    const result = await runTool(tool("list_backlogs"), {}, reader);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ backlogs: [{ ...backlog }] });
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(mocks.listBacklogsForUser).toHaveBeenCalledWith("user-1", { includeArchived: false });
    expect(mocks.reserveApiRequest).toHaveBeenCalledWith("token-1", expect.any(Date));
  });

  it("answers an unknown or unreadable backlog and item the same way", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValueOnce(null);
    const statuses = await runTool(tool("list_statuses"), { backlog: "nope" }, reader);
    expect(statuses).toMatchObject({ isError: true });
    mocks.getItemByKeyForBacklog.mockResolvedValueOnce(null);
    const item = await runTool(tool("get_item"), { key: "CASS-404" }, reader);
    expect(item.content[0]!.text).toBe(statuses.content[0]!.text);
  });

  it("creates an item through the use case, as the token's owner from the MCP channel", async () => {
    mocks.createItemUseCase.mockImplementation(async () => ({
      item: { id: "item-9", key: "CASS-99", source: currentActivitySource() },
      backlogId: "backlog-1",
    }));
    mocks.getItemByKeyForBacklog.mockResolvedValueOnce({ id: "parent-1", key: "CASS-1" });

    const result = await runTool(tool("create_item"), {
      backlog: "cass",
      type: "tache",
      title: "  Nouvelle tâche ",
      parentKey: "CASS-1",
      priority: 2,
    }, writer);

    expect(result.isError).toBeUndefined();
    expect(mocks.createItemUseCase).toHaveBeenCalledWith(
      { actorId: "user-1", source: "mcp", tokenId: "token-2" },
      { backlogId: "backlog-1", parentId: "parent-1", type: "tache", title: "Nouvelle tâche", priority: 2 },
    );
    expect(mocks.getItemByKeyForBacklog).toHaveBeenCalledWith("CASS-1", "backlog-1");
  });

  it("updates only the fields the agent sent and refuses an empty update", async () => {
    await runTool(tool("update_item"), { key: "CASS-12", assigneeId: null, title: "Titre" }, writer);
    expect(mocks.updateItemUseCase).toHaveBeenCalledWith(
      { actorId: "user-1", source: "mcp", tokenId: "token-2" },
      { id: "item-1", assigneeId: null, title: "Titre" },
    );

    const empty = await runTool(tool("update_item"), { key: "CASS-12" }, writer);
    expect(empty).toMatchObject({ isError: true });
    expect(mocks.updateItemUseCase).toHaveBeenCalledTimes(1);
  });

  it("transitions and comments through the use cases", async () => {
    await runTool(tool("transition_item"), { key: "CASS-12", statusId: "11111111-1111-4111-8111-111111111111" }, writer);
    expect(mocks.updateItemUseCase).toHaveBeenCalledWith(expect.anything(), {
      id: "item-1",
      statusId: "11111111-1111-4111-8111-111111111111",
    });

    const comment = await runTool(tool("add_comment"), { key: "CASS-12", body: "Bonjour" }, writer);
    expect(mocks.addCommentUseCase).toHaveBeenCalledWith(
      { actorId: "user-1", source: "mcp", tokenId: "token-2" },
      { itemId: "item-1", body: "Bonjour", mentionIds: [] },
    );
    expect(comment.structuredContent).toEqual({
      comment: { id: "comment-1", itemKey: "CASS-12", body: "Bonjour", createdAt: "2026-11-13T08:00:00.000Z" },
    });
  });

  it("maps validation, permission and business errors to readable refusals and hides the rest", async () => {
    const invalid = await runTool(tool("transition_item"), { key: "CASS-12", statusId: "not-a-uuid" }, writer);
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]!.text).toMatch(/^Entrée invalide : statusId/);

    mocks.updateItemUseCase.mockRejectedValueOnce(permissionDeniedError("transition_items", { type: "backlog", backlogId: "backlog-1" }));
    const denied = await runTool(tool("transition_item"), { key: "CASS-12", statusId: "11111111-1111-4111-8111-111111111111" }, writer);
    expect(denied.content[0]!.text).toBe("Permission refusée (transition_items).");

    mocks.updateItemUseCase.mockRejectedValueOnce(new Error("Statut invalide pour ce backlog."));
    const domain = await runTool(tool("transition_item"), { key: "CASS-12", statusId: "11111111-1111-4111-8111-111111111111" }, writer);
    expect(domain.content[0]!.text).toBe("Statut invalide pour ce backlog.");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.updateItemUseCase.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    const hidden = await runTool(tool("transition_item"), { key: "CASS-12", statusId: "11111111-1111-4111-8111-111111111111" }, writer);
    expect(hidden.isError).toBe(true);
    expect(hidden.content[0]!.text).not.toContain("ECONNREFUSED");
    consoleError.mockRestore();
  });
});
