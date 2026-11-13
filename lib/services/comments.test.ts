import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));

import { addComment } from "@/lib/services/comments";
import { activities, comments, notifications, user } from "@/lib/db/schema";
const itemId = "11111111-1111-4111-8111-111111111111";

describe("addComment notification recipients", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { mentions: ["author", "reader", "reader", "missing"], targets: ["reader"] },
    { mentions: ["author"], targets: [] },
  ])("returns only the recipients actually notified: $targets", async ({ mentions, targets }) => {
    const comment = { id: "comment-1", itemId, body: "Message", authorId: "author" };
    const notificationValues = vi.fn();
    const tx = {
      select: vi.fn(() => ({
        from: (table: unknown) => ({
          where: async () => table === user ? [{ id: "author" }, { id: "reader" }] : [{ id: itemId }],
        }),
      })),
      insert: vi.fn((table: unknown) => ({
        values: (values: unknown) => {
          if (table === notifications) notificationValues(values);
          if (table === comments) return { returning: async () => [comment] };
          expect(table === notifications || table === activities).toBe(true);
          return Promise.resolve();
        },
      })),
    };
    mocks.transaction.mockImplementation(async (run) => run(tx));
    const result = await addComment({ itemId, body: "Message", mentionIds: mentions }, "author");
    expect(result).toMatchObject({ ...comment, notifyUserIds: targets });
    if (targets.length) {
      expect(notificationValues).toHaveBeenCalledWith([
        { userId: "reader", type: "mention", itemId, commentId: "comment-1", readAt: null },
      ]);
    } else {
      expect(notificationValues).not.toHaveBeenCalled();
    }
  });
});
