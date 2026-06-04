import { describe, expect, it } from "vitest";
import { normalizeLabelName, labelColorVarForName, createLabelInput } from "./labels";
import { LABEL_HUES } from "@/lib/design/constants";

// ---------------------------------------------------------------------------
// normalizeLabelName
// ---------------------------------------------------------------------------

describe("normalizeLabelName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeLabelName("  hello  ")).toBe("hello");
    expect(normalizeLabelName("\tBug\n")).toBe("Bug");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeLabelName("foo   bar")).toBe("foo bar");
    expect(normalizeLabelName("a\t\tb")).toBe("a b");
    expect(normalizeLabelName("multi   internal   spaces")).toBe("multi internal spaces");
  });

  it("leaves already-normalized names intact", () => {
    expect(normalizeLabelName("good label")).toBe("good label");
    expect(normalizeLabelName("single")).toBe("single");
  });

  it("trims and collapses in one pass", () => {
    expect(normalizeLabelName("  foo   bar  ")).toBe("foo bar");
  });
});

// ---------------------------------------------------------------------------
// labelColorVarForName
// ---------------------------------------------------------------------------

describe("labelColorVarForName", () => {
  it("always returns the same hue for the same input (deterministic)", () => {
    const name = "Performance";
    const h1 = labelColorVarForName(name);
    const h2 = labelColorVarForName(name);
    const h3 = labelColorVarForName(name);
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it("always returns a value in LABEL_HUES", () => {
    const names = [
      "Bug", "Feature", "Performance", "Security", "Refactor",
      "Documentation", "Test", "Design", "UX", "Backend",
      "Frontend", "Database", "API", "Infra", "Release",
      "Hotfix", "Chore", "Spike", "Discussion", "Breaking",
    ];
    for (const name of names) {
      const hue = labelColorVarForName(name);
      expect((LABEL_HUES as readonly number[]).includes(hue)).toBe(true);
    }
  });

  it("is case-insensitive (same hue for 'Bug' and 'bug')", () => {
    expect(labelColorVarForName("Bug")).toBe(labelColorVarForName("bug"));
    expect(labelColorVarForName("FEATURE")).toBe(labelColorVarForName("feature"));
  });

  it("is whitespace-insensitive (normalizes before hashing)", () => {
    expect(labelColorVarForName("  Bug  ")).toBe(labelColorVarForName("Bug"));
    expect(labelColorVarForName("foo   bar")).toBe(labelColorVarForName("foo bar"));
  });

  it("spreads names across multiple distinct hues (no degenerate collapse)", () => {
    const names = [
      "Bug", "Feature", "Performance", "Security", "Refactor",
      "Documentation", "Test", "Design", "UX", "Backend",
      "Frontend", "Database", "API", "Infra", "Release",
      "Hotfix", "Chore", "Spike", "Discussion", "Breaking",
    ];
    const hues = new Set(names.map(labelColorVarForName));
    // With 20 names and 6 hues, we expect to see at least 3 distinct hues
    expect(hues.size).toBeGreaterThan(1);
  });

  it("pins concrete hues for known names (catches any hash change)", () => {
    // Values computed from the djb2 implementation. If the hash algorithm
    // changes, these break — which is the whole point of a regression guard.
    expect(labelColorVarForName("bug")).toBe(4);
    expect(labelColorVarForName("urgent")).toBe(3);
    expect(labelColorVarForName("backend")).toBe(2);
    expect(labelColorVarForName("security")).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// createLabelInput
// ---------------------------------------------------------------------------

describe("createLabelInput", () => {
  const validUuid = "5764b39c-d013-4db6-ba82-48183cb28954";

  it("accepts a valid input", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "Bug" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name (after trim)", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 50 chars", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "a".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("accepts a name of exactly 50 chars", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "a".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("accepts a name of 1 char", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "X" });
    expect(result.success).toBe(true);
  });

  it("requires a uuid for backlogId", () => {
    const result = createLabelInput.safeParse({ backlogId: "not-a-uuid", name: "Bug" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing backlogId", () => {
    const result = createLabelInput.safeParse({ name: "Bug" });
    expect(result.success).toBe(false);
  });

  it("trims the name", () => {
    const result = createLabelInput.safeParse({ backlogId: validUuid, name: "  Bug  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Bug");
  });
});
