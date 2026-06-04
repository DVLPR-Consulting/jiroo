import { describe, expect, it } from "vitest";
import {
  commentBodySchema,
  addCommentInput,
  editCommentInput,
  dedupeMentionIds,
  notifyTargets,
} from "./comments";

const VALID_UUID = "5764b39c-d013-4db6-ba82-48183cb28954";
// better-auth user ids are plain text strings (not UUIDs)
const USER_A = "xIUffh8EwmWluhHN859Kxq5LJHV6cH5f";
const USER_B = "yZAbc1234567890defghijklmnopqrst";
const USER_C = "user-c-plain-string";

// ---------------------------------------------------------------------------
// commentBodySchema
// ---------------------------------------------------------------------------

describe("commentBodySchema", () => {
  it("rejects an empty string", () => {
    expect(commentBodySchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only string (trimmed to empty)", () => {
    expect(commentBodySchema.safeParse("   ").success).toBe(false);
    expect(commentBodySchema.safeParse("\t\n").success).toBe(false);
  });

  it("trims surrounding whitespace and accepts the result", () => {
    const result = commentBodySchema.safeParse("  hello world  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("hello world");
  });

  it("rejects a body longer than 5000 characters", () => {
    expect(commentBodySchema.safeParse("a".repeat(5001)).success).toBe(false);
  });

  it("accepts a body of exactly 5000 characters", () => {
    expect(commentBodySchema.safeParse("a".repeat(5000)).success).toBe(true);
  });

  it("accepts a normal body", () => {
    const result = commentBodySchema.safeParse("This is a normal comment.");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("This is a normal comment.");
  });

  it("has a French error message for min constraint", () => {
    const result = commentBodySchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Le commentaire ne peut pas être vide.");
    }
  });
});

// ---------------------------------------------------------------------------
// addCommentInput
// ---------------------------------------------------------------------------

describe("addCommentInput", () => {
  it("accepts a valid input with all fields", () => {
    const result = addCommentInput.safeParse({
      itemId: VALID_UUID,
      body: "A comment",
      mentionIds: [USER_A],
    });
    expect(result.success).toBe(true);
  });

  it("requires a uuid for itemId", () => {
    const result = addCommentInput.safeParse({
      itemId: "not-a-uuid",
      body: "A comment",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing itemId", () => {
    const result = addCommentInput.safeParse({ body: "A comment" });
    expect(result.success).toBe(false);
  });

  it("defaults mentionIds to [] when omitted", () => {
    const result = addCommentInput.safeParse({ itemId: VALID_UUID, body: "A comment" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mentionIds).toEqual([]);
  });

  it("accepts non-uuid mention IDs (better-auth plain string ids)", () => {
    const result = addCommentInput.safeParse({
      itemId: VALID_UUID,
      body: "A comment",
      mentionIds: [USER_A, USER_B],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mentionIds).toEqual([USER_A, USER_B]);
  });

  it("rejects an empty body", () => {
    const result = addCommentInput.safeParse({ itemId: VALID_UUID, body: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// editCommentInput
// ---------------------------------------------------------------------------

describe("editCommentInput", () => {
  it("accepts a valid input with all fields", () => {
    const result = editCommentInput.safeParse({
      id: VALID_UUID,
      body: "Updated comment",
      mentionIds: [USER_A],
    });
    expect(result.success).toBe(true);
  });

  it("requires a uuid for id", () => {
    const result = editCommentInput.safeParse({
      id: "not-a-uuid",
      body: "Updated comment",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing id", () => {
    const result = editCommentInput.safeParse({ body: "Updated comment" });
    expect(result.success).toBe(false);
  });

  it("defaults mentionIds to [] when omitted", () => {
    const result = editCommentInput.safeParse({ id: VALID_UUID, body: "Updated comment" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mentionIds).toEqual([]);
  });

  it("accepts non-uuid mention IDs (better-auth plain string ids)", () => {
    const result = editCommentInput.safeParse({
      id: VALID_UUID,
      body: "Updated comment",
      mentionIds: [USER_A],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mentionIds).toEqual([USER_A]);
  });

  it("rejects an empty body", () => {
    const result = editCommentInput.safeParse({ id: VALID_UUID, body: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dedupeMentionIds
// ---------------------------------------------------------------------------

describe("dedupeMentionIds", () => {
  it("returns an empty array for empty input", () => {
    expect(dedupeMentionIds([])).toEqual([]);
  });

  it("deduplicates repeated IDs", () => {
    expect(dedupeMentionIds([USER_A, USER_A, USER_B, USER_A])).toEqual([USER_A, USER_B]);
  });

  it("preserves first-seen order", () => {
    expect(dedupeMentionIds([USER_B, USER_A, USER_C, USER_B])).toEqual([USER_B, USER_A, USER_C]);
  });

  it("drops empty strings", () => {
    expect(dedupeMentionIds(["", USER_A, "", USER_B])).toEqual([USER_A, USER_B]);
  });

  it("drops falsy strings (empty string only — type is string[])", () => {
    expect(dedupeMentionIds(["", ""])).toEqual([]);
  });

  it("passes through a list of unique non-empty IDs unchanged", () => {
    expect(dedupeMentionIds([USER_A, USER_B, USER_C])).toEqual([USER_A, USER_B, USER_C]);
  });
});

// ---------------------------------------------------------------------------
// notifyTargets
// ---------------------------------------------------------------------------

describe("notifyTargets", () => {
  it("returns empty for empty mention list", () => {
    expect(notifyTargets([], USER_A)).toEqual([]);
  });

  it("excludes the author even when self-mentioned", () => {
    expect(notifyTargets([USER_A], USER_A)).toEqual([]);
  });

  it("excludes the author from a mixed list", () => {
    expect(notifyTargets([USER_A, USER_B, USER_A], USER_A)).toEqual([USER_B]);
  });

  it("keeps other users when author is not mentioned", () => {
    expect(notifyTargets([USER_B, USER_C], USER_A)).toEqual([USER_B, USER_C]);
  });

  it("deduplicates mention IDs in the result", () => {
    expect(notifyTargets([USER_B, USER_B, USER_C], USER_A)).toEqual([USER_B, USER_C]);
  });

  it("drops empty strings and excludes the author", () => {
    expect(notifyTargets(["", USER_B, USER_A, ""], USER_A)).toEqual([USER_B]);
  });

  it("returns empty when all mentions are the author", () => {
    expect(notifyTargets([USER_A, USER_A, USER_A], USER_A)).toEqual([]);
  });
});
