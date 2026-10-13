import { describe, expect, it } from "vitest";
import {
  allowedParentType,
  hierarchyStartStep,
  isValidParenting,
} from "@/lib/tree/hierarchy";

describe("hierarchy rules", () => {
  it("maps each type to its required parent type", () => {
    expect(allowedParentType("composant")).toBeNull();
    expect(allowedParentType("epic")).toBe("composant");
    expect(allowedParentType("tache")).toBe("epic");
    expect(allowedParentType("soustache")).toBe("tache");
  });

  it("accepts valid parent/child pairs", () => {
    expect(isValidParenting("epic", "composant")).toBe(true);
    expect(isValidParenting("tache", "epic")).toBe(true);
    expect(isValidParenting("soustache", "tache")).toBe(true);
    expect(isValidParenting("composant", null)).toBe(true);
  });

  it("rejects invalid parent/child pairs", () => {
    expect(isValidParenting("composant", "epic")).toBe(false);
    expect(isValidParenting("epic", null)).toBe(false);
    expect(isValidParenting("tache", "composant")).toBe(false);
    expect(isValidParenting("soustache", "epic")).toBe(false);
  });
});

describe("hierarchyStartStep", () => {
  it("asks for a composant first in an empty backlog", () => {
    expect(hierarchyStartStep([])).toBe("composant");
  });

  it("asks for an epic once a composant exists", () => {
    expect(hierarchyStartStep([{ type: "composant" }])).toBe("epic");
  });

  it("has nothing left to guide once an epic exists", () => {
    expect(hierarchyStartStep([{ type: "composant" }, { type: "epic" }])).toBeNull();
    expect(
      hierarchyStartStep([{ type: "composant" }, { type: "epic" }, { type: "tache" }]),
    ).toBeNull();
    // Only the Epic matters to tasks, whatever else the list holds.
    expect(hierarchyStartStep([{ type: "epic" }])).toBeNull();
  });
});
