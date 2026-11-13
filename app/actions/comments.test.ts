import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  checkPermission: vi.fn(),
  editComment: vi.fn(),
  getSession: vi.fn(),
  requireCommentPermission: vi.fn(),
  requireItemPermission: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
  publishBacklogChange: vi.fn(),
  revalidateBacklogPages: vi.fn(),
  softDeleteComment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({
  invalidateBacklog: mocks.invalidateBacklog,
  notifyUsers: mocks.notifyUsers,
  publishBacklogChange: mocks.publishBacklogChange,
  revalidateBacklogPages: mocks.revalidateBacklogPages,
}));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireCommentPermission: mocks.requireCommentPermission,
  requireItemPermission: mocks.requireItemPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/authorization", () => ({ checkPermission: mocks.checkPermission }));
vi.mock("@/lib/services/comments", () => ({
  addComment: mocks.addComment,
  editComment: mocks.editComment,
  softDeleteComment: mocks.softDeleteComment,
}));

import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
} from "@/app/actions/comments";

describe("comment action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "author-1", role: "contributor" } });
    mocks.requireItemPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "item-1" });
    mocks.requireCommentPermission.mockResolvedValue({
      backlogId: "backlog-1",
      resourceId: "comment-1",
      authorId: "author-1",
    });
    mocks.addComment.mockResolvedValue({ id: "comment-1", notifyUserIds: ["recipient-1"] });
    mocks.editComment.mockResolvedValue({ id: "comment-1", itemId: "item-1" });
    mocks.softDeleteComment.mockResolvedValue({ id: "comment-1", itemId: "item-1" });
    mocks.checkPermission.mockResolvedValue({ allowed: true });
  });

  it("keeps only readable mentions when editing a comment", async () => {
    mocks.checkPermission.mockImplementation(async ({ actorId }: { actorId: string }) => ({ allowed: actorId === "reader" }));
    await editCommentAction({ backlogKey: "DEMO", id: "comment-1", body: "Corrigé", mentionIds: ["reader", "outsider"] });
    expect(mocks.editComment).toHaveBeenCalledWith("comment-1", { body: "Corrigé", mentionIds: ["reader"] }, "author-1");
  });

  it("requires add_comments from the item stored backlog", async () => {
    await expect(addCommentAction({
      backlogKey: "FORGED",
      itemId: "item-1",
      body: "Message",
      mentionIds: [],
    })).resolves.toEqual({ ok: true, comment: { id: "comment-1" } });

    expect(mocks.publishBacklogChange).toHaveBeenCalledWith({ kind: "item", backlogId: "backlog-1", itemIds: ["item-1"], actorId: "author-1" });
    expect(mocks.revalidateBacklogPages).toHaveBeenCalledWith("FORGED");
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["recipient-1"], "author-1");
    expect(mocks.addComment.mock.invocationCallOrder[0]).toBeLessThan(mocks.notifyUsers.mock.invocationCallOrder[0]!);
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "author-1",
      itemId: "item-1",
      permission: "add_comments",
    });
    expect(mocks.requireItemPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addComment.mock.invocationCallOrder[0]!,
    );
  });

  it("publishes, notifies, then re-renders the pages, and reports a failed re-render", async () => {
    await addCommentAction({ backlogKey: "DEMO", itemId: "item-1", body: "Message", mentionIds: [] });
    const order = [mocks.publishBacklogChange, mocks.notifyUsers, mocks.revalidateBacklogPages]
      .map((mock) => mock.mock.invocationCallOrder[0]!);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    mocks.revalidateBacklogPages.mockImplementationOnce(() => {
      throw new Error("revalidation failed");
    });
    await expect(
      addCommentAction({ backlogKey: "DEMO", itemId: "item-1", body: "Message", mentionIds: [] }),
    ).resolves.toEqual({ ok: false, error: "Action impossible sur le commentaire." });
    // The comment is already committed and published: only the page render failed.
    expect(mocks.publishBacklogChange).toHaveBeenCalledTimes(2);
  });

  it("returns a structured comment permission denial", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("add_comments", { type: "backlog", backlogId: "backlog-1" }),
    );

    await expect(
      addCommentAction({
        backlogKey: "FORGED",
        itemId: "item-1",
        body: "Message",
        mentionIds: [],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Ajouter des commentaires » pour ce backlog.",
    });
    expect(mocks.addComment).not.toHaveBeenCalled();
    expect(mocks.publishBacklogChange).not.toHaveBeenCalled();
    expect(mocks.revalidateBacklogPages).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it("requires edit_own_comments with stored comment ownership", async () => {
    await editCommentAction({
      backlogKey: "FORGED",
      id: "comment-1",
      body: "Corrigé",
      mentionIds: [],
    });

    expect(mocks.requireCommentPermission).toHaveBeenCalledWith({
      actorId: "author-1",
      commentId: "comment-1",
      ownPermission: "edit_own_comments",
    });
    expect(mocks.requireCommentPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.editComment.mock.invocationCallOrder[0]!,
    );
  });

  it("selects delete_own_comments or delete_all_comments from stored ownership", async () => {
    await deleteCommentAction({ backlogKey: "FORGED", id: "comment-1" });

    expect(mocks.requireCommentPermission).toHaveBeenCalledWith({
      actorId: "author-1",
      commentId: "comment-1",
      ownPermission: "delete_own_comments",
      otherPermission: "delete_all_comments",
    });
    expect(mocks.requireCommentPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.softDeleteComment.mock.invocationCallOrder[0]!,
    );
  });

  it("passes an authorized delete-all decision to the ownership-enforcing service", async () => {
    mocks.requireCommentPermission.mockResolvedValueOnce({
      backlogId: "backlog-1",
      resourceId: "comment-1",
      authorId: "other-author",
    });

    await deleteCommentAction({ backlogKey: "DEMO", id: "comment-1" });

    expect(mocks.softDeleteComment).toHaveBeenCalledWith(
      "comment-1",
      "author-1",
      { allowAny: true },
    );
  });

  it("does not call the mutation service when stored ownership authorization fails", async () => {
    mocks.requireCommentPermission.mockRejectedValueOnce(
      permissionDeniedError("edit_own_comments", {
        type: "backlog",
        backlogId: "backlog-1",
      }),
    );

    await expect(
      editCommentAction({
        backlogKey: "DEMO",
        id: "comment-1",
        body: "Interdit",
        mentionIds: [],
      }),
    ).resolves.toEqual({
      ok: false,
      error:
        "Vous n’avez pas la permission « Modifier ses propres commentaires » pour ce backlog.",
    });
    expect(mocks.editComment).not.toHaveBeenCalled();
  });
});
