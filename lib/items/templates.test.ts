import { describe, expect, it } from "vitest";
import { ITEM_KINDS } from "@/lib/design/constants";
import { ITEM_TEMPLATES, getTemplate } from "@/lib/items/templates";

describe("ITEM_TEMPLATES", () => {
  it("has at least 2 entries", () => {
    expect(ITEM_TEMPLATES.length).toBeGreaterThanOrEqual(2);
  });

  it("every entry has a non-empty id, name, and description", () => {
    for (const t of ITEM_TEMPLATES) {
      expect(t.id.trim()).not.toBe("");
      expect(t.name.trim()).not.toBe("");
      expect(t.description.trim()).not.toBe("");
    }
  });

  it("every entry has a valid kind", () => {
    for (const t of ITEM_TEMPLATES) {
      expect(ITEM_KINDS).toContain(t.kind);
    }
  });

  it("ids are unique", () => {
    const ids = ITEM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getTemplate", () => {
  it("returns the bug-report template with kind 'bug'", () => {
    const t = getTemplate("bug-report");
    expect(t).toBeDefined();
    expect(t?.kind).toBe("bug");
    expect(t?.id).toBe("bug-report");
  });

  it("returns the user-story template with kind 'feature'", () => {
    const t = getTemplate("user-story");
    expect(t).toBeDefined();
    expect(t?.kind).toBe("feature");
  });

  it("returns undefined for an unknown id", () => {
    expect(getTemplate("nope")).toBeUndefined();
  });
});
