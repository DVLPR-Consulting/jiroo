import { describe, expect, it } from "vitest";
import {
  shortcutById,
  SEQUENCE_SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  sequenceShortcutForContext,
  shortcutsInGroup,
  shortcutText,
} from "@/lib/shortcuts/registry";

describe("shortcut registry", () => {
  it("has unique ids", () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no ambiguous sequences (none is a prefix of another)", () => {
    for (const a of SEQUENCE_SHORTCUTS) {
      for (const b of SEQUENCE_SHORTCUTS) {
        if (a === b) continue;
        const prefix = a.sequence.every((key, index) => b.sequence[index] === key);
        // The same keys may serve the page's lists and the item drawer: the
        // two contexts never overlap.
        const sameKeysOtherContext =
          a.sequence.length === b.sequence.length &&
          [a.group, b.group].sort().join() === "item,list";
        expect(prefix && !sameKeysOtherContext, `${a.id} shadows ${b.id}`).toBe(false);
      }
    }
  });

  it("resolves j / k to the list on the page and to the item drawer inside it", () => {
    expect(sequenceShortcutForContext("list.next", "page")).toBe("list.next");
    expect(sequenceShortcutForContext("list.next", "item")).toBe("item.next");
    expect(sequenceShortcutForContext("list.previous", "item")).toBe("item.previous");
    expect(sequenceShortcutForContext("list.open", "item")).toBeNull();
    expect(sequenceShortcutForContext("item.comment", "page")).toBeNull();
    expect(sequenceShortcutForContext("item.comment", "item")).toBe("item.comment");
    expect(sequenceShortcutForContext("go.board", "item")).toBe("go.board");
  });

  it("only uses single printable characters in sequences", () => {
    for (const shortcut of SEQUENCE_SHORTCUTS) {
      for (const key of shortcut.sequence) expect(key).toMatch(/^[a-z?/[]$/);
    }
  });

  it("files every shortcut under a known group, and every group is used", () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(shortcutsInGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  it("follows Jira Cloud's keys for the shortcuts Jira also has", () => {
    const keys = Object.fromEntries(
      SEQUENCE_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.sequence.join(" ")]),
    );
    expect(keys).toMatchObject({
      help: "?",
      search: "/",
      create: "c",
      toggleSidebar: "[",
      "go.board": "g a",
      "go.list": "g i",
      "list.next": "j",
      "list.previous": "k",
      "list.open": "o",
      "item.edit": "e",
      "item.comment": "m",
      "item.assign": "a",
      "item.assignToMe": "i",
      "item.next": "j",
      "item.previous": "k",
    });
  });

  it("renders keys as text", () => {
    const byId = (id: string) => SHORTCUTS.find((shortcut) => shortcut.id === id)!;
    expect(shortcutText(byId("go.backlog"))).toBe("G puis B");
    expect(shortcutText(byId("list.open"))).toBe("O ou Entrée");
    expect(shortcutText(byId("searchCombo"))).toBe("⌘/Ctrl + K");
  });
});

describe("shortcutById", () => {
  it("returns the registry entry for an id", () => {
    expect(shortcutById("search")).toMatchObject({ kind: "sequence", sequence: ["/"] });
    expect(shortcutById("searchCombo")).toMatchObject({ kind: "combo", combo: ["⌘/Ctrl", "K"] });
  });
});
