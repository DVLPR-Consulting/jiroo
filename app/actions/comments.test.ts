import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  editComment: vi.fn(),
  getSession: vi.fn(),
  requireCommentPermission: vi.fn(),
  requireItemPermission: vi.fn(),
  revalidatePath: vi.fn(),
  softDeleteComment: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireCommentPermission: mocks.requireCommentPermission,
  requireItemPermission: mocks.requireItemPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
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
    mocks.addComment.mockResolvedValue({ id: "comment-1" });
    mocks.editComment.mockResolvedValue({ id: "comment-1" });
    mocks.softDeleteComment.mockResolvedValue({ id: "comment-1" });
  });

  it("requires add_comments from the item stored backlog", async () => {
    await addCommentAction({
      backlogKey: "FORGED",
      itemId: "item-1",
      body: "Message",
      mentionIds: [],
    });

    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "author-1",
      itemId: "item-1",
      permission: "add_comments",
    });
    expect(mocks.requireItemPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addComment.mock.invocationCallOrder[0]!,
    );
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
    mocks.requireCommentPermission.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      editCommentAction({
        backlogKey: "DEMO",
        id: "comment-1",
        body: "Interdit",
        mentionIds: [],
      }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.editComment).not.toHaveBeenCalled();
  });
});
