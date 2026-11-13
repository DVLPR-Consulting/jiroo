import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  checkPermission: vi.fn(),
  notifyUsers: vi.fn(),
  publishBacklogChange: vi.fn(),
  requireItemPermission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/realtime/publish", () => ({
  notifyUsers: mocks.notifyUsers,
  publishBacklogChange: mocks.publishBacklogChange,
}));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
}));
vi.mock("@/lib/services/comments", () => ({ addComment: mocks.addComment }));
vi.mock("@/lib/auth/authorization", () => ({ checkPermission: mocks.checkPermission }));

import { currentActivitySource, type Actor } from "@/lib/auth/actor-context";
import { addCommentUseCase } from "@/lib/use-cases/comments";

const author: Actor = { actorId: "author-1", source: "mcp", tokenId: "token-1" };
const input = { itemId: "item-1", body: "Message", mentionIds: ["recipient-1"] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireItemPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "item-1" });
  mocks.addComment.mockResolvedValue({ id: "comment-1", body: "Message", notifyUserIds: ["recipient-1"] });
  mocks.publishBacklogChange.mockResolvedValue(undefined);
  mocks.notifyUsers.mockResolvedValue(undefined);
  mocks.checkPermission.mockResolvedValue({ allowed: true });
});

describe("addCommentUseCase", () => {
  it("requires add_comments on the stored item, then adds, publishes and notifies in order", async () => {
    await expect(addCommentUseCase(author, input)).resolves.toEqual({
      comment: { id: "comment-1", body: "Message" },
      backlogId: "backlog-1",
    });

    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "author-1",
      itemId: "item-1",
      permission: "add_comments",
    });
    expect(mocks.addComment).toHaveBeenCalledWith(input, "author-1");
    expect(mocks.publishBacklogChange).toHaveBeenCalledWith({
      kind: "item",
      backlogId: "backlog-1",
      itemIds: ["item-1"],
      actorId: "author-1",
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["recipient-1"], "author-1");
    const order = [
      mocks.requireItemPermission,
      mocks.addComment,
      mocks.publishBacklogChange,
      mocks.notifyUsers,
    ].map((mock) => mock.mock.invocationCallOrder[0]!);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("only mentions users who may read the backlog, and never says why the others were dropped", async () => {
    mocks.checkPermission.mockImplementation(async ({ actorId }: { actorId: string }) => ({ allowed: actorId === "reader" }));
    await addCommentUseCase(author, { itemId: "item-1", body: "Message", mentionIds: ["reader", "outsider", "reader", "ghost"] });

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "outsider",
      permission: "browse_backlog",
      scope: { type: "backlog", backlogId: "backlog-1" },
    });
    expect(mocks.addComment).toHaveBeenCalledWith({ itemId: "item-1", body: "Message", mentionIds: ["reader"] }, "author-1");

  });

  it("surfaces a technical failure instead of dropping the mention, and bounds the list before any lookup", async () => {
    mocks.addComment.mockClear();
    mocks.checkPermission.mockRejectedValueOnce(new Error("connection lost"));
    await expect(addCommentUseCase(author, { itemId: "item-1", body: "Message", mentionIds: ["reader"] })).rejects.toThrow("connection lost");
    expect(mocks.addComment).not.toHaveBeenCalled();

    mocks.checkPermission.mockClear();
    const many = Array.from({ length: 51 }, (_, index) => `user-${index}`);
    await expect(addCommentUseCase(author, { itemId: "item-1", body: "Message", mentionIds: [...many, ...many] }))
      .rejects.toThrow("Un commentaire peut mentionner 50 personnes au plus.");
    expect(mocks.checkPermission).not.toHaveBeenCalled();
    const fifty = many.slice(0, 50);
    await expect(addCommentUseCase(author, { itemId: "item-1", body: "Message", mentionIds: [...fifty, ...fifty] })).resolves.toBeDefined();
  });

  it("stops before the service when the actor may not comment", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("add_comments", { type: "backlog", backlogId: "backlog-1" }),
    );

    await expect(addCommentUseCase(author, input)).rejects.toMatchObject({ name: "PermissionDeniedError" });
    expect(mocks.addComment).not.toHaveBeenCalled();
    expect(mocks.publishBacklogChange).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it("lets a service error through and publishes nothing", async () => {
    mocks.addComment.mockRejectedValueOnce(new Error("Item introuvable."));

    await expect(addCommentUseCase(author, input)).rejects.toThrow("Item introuvable.");
    expect(mocks.publishBacklogChange).not.toHaveBeenCalled();
  });

  it("runs the service inside the actor scope", async () => {
    mocks.addComment.mockImplementation(async () => ({
      id: "comment-1",
      source: currentActivitySource(),
      notifyUserIds: [],
    }));

    const { comment } = await addCommentUseCase(author, input);

    expect(comment).toEqual({ id: "comment-1", source: "mcp" });
    expect(mocks.notifyUsers).toHaveBeenCalledWith([], "author-1");
  });
});
