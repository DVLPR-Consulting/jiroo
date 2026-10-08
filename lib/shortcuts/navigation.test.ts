import { describe, expect, it } from "vitest";
import { backlogKeyFromPath, goShortcutHref } from "@/lib/shortcuts/navigation";

describe("backlogKeyFromPath", () => {
  it("reads the backlog key from backlog routes", () => {
    expect(backlogKeyFromPath("/b/CASS")).toBe("CASS");
    expect(backlogKeyFromPath("/b/CASS/releases/42")).toBe("CASS");
    expect(backlogKeyFromPath("/b/A%20B/reports")).toBe("A B");
  });

  it("is null outside a backlog", () => {
    expect(backlogKeyFromPath("/aide")).toBeNull();
    expect(backlogKeyFromPath("/mine")).toBeNull();
    expect(backlogKeyFromPath("/b/%E0%A4%A")).toBeNull();
  });
});

describe("goShortcutHref", () => {
  it("maps each destination of the current backlog", () => {
    expect(goShortcutHref("go.backlog", "CASS")).toBe("/b/CASS?view=backlog");
    expect(goShortcutHref("go.board", "CASS")).toBe("/b/CASS?view=board");
    expect(goShortcutHref("go.list", "CASS")).toBe("/b/CASS?view=list");
    expect(goShortcutHref("go.tree", "CASS")).toBe("/b/CASS?view=tree");
    expect(goShortcutHref("go.releases", "CASS")).toBe("/b/CASS/releases");
    expect(goShortcutHref("go.reports", "CASS")).toBe("/b/CASS/reports");
  });

  it("always reaches the guide, and nothing else without a backlog", () => {
    expect(goShortcutHref("go.help", null)).toBe("/aide");
    expect(goShortcutHref("go.board", null)).toBeNull();
  });
});
