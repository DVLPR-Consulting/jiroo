import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adjacentItemKey,
  moveShortcutFocus,
  openCurrentShortcutItem,
  shortcutItemKeys,
  shortcutItems,
} from "@/lib/shortcuts/list-navigation";

function setup() {
  document.body.innerHTML = `
    <main>
      <table><tbody>
        <tr tabindex="0" data-shortcut-item="CASS-1"><td><input type="checkbox" aria-label="Sélectionner CASS-1" /></td></tr>
        <tr tabindex="0" data-shortcut-item="CASS-2"></tr>
        <tr tabindex="0" data-shortcut-item="CASS-3" hidden></tr>
        <tr tabindex="0" data-shortcut-item="CASS-4"></tr>
      </tbody></table>
    </main>`;
  return document.querySelector("main")!;
}

const key = (element: Element | null) => element?.getAttribute("data-shortcut-item");

describe("list navigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("skips hidden items", () => {
    expect(shortcutItems(setup()).map(key)).toEqual(["CASS-1", "CASS-2", "CASS-4"]);
  });

  it("selects the first item when nothing is focused, then moves without wrapping", () => {
    const main = setup();
    expect(key(moveShortcutFocus(main, -1))).toBe("CASS-1");
    expect(key(document.activeElement)).toBe("CASS-1");
    expect(key(moveShortcutFocus(main, 1))).toBe("CASS-2");
    expect(key(moveShortcutFocus(main, 1))).toBe("CASS-4");
    expect(key(moveShortcutFocus(main, 1))).toBe("CASS-4");
    expect(key(moveShortcutFocus(main, -1))).toBe("CASS-2");
  });

  it("moves from a control inside the focused row", () => {
    const main = setup();
    (document.querySelector("input") as HTMLInputElement).focus();
    expect(key(moveShortcutFocus(main, 1))).toBe("CASS-2");
  });

  it("does nothing without items", () => {
    document.body.innerHTML = "<main></main>";
    expect(moveShortcutFocus(document.querySelector("main")!, 1)).toBeNull();
  });

  it("opens the focused item by clicking it", () => {
    const main = setup();
    expect(openCurrentShortcutItem()).toBe(false);
    moveShortcutFocus(main, 1);
    const onClick = vi.fn();
    document.activeElement!.addEventListener("click", onClick);
    expect(openCurrentShortcutItem()).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lists the visible item keys in display order", () => {
    expect(shortcutItemKeys(setup())).toEqual(["CASS-1", "CASS-2", "CASS-4"]);
  });

  it("resolves the previous and next key without wrapping", () => {
    const keys = ["CASS-1", "CASS-2", "CASS-4"];
    expect(adjacentItemKey(keys, "CASS-2", 1)).toBe("CASS-4");
    expect(adjacentItemKey(keys, "CASS-2", -1)).toBe("CASS-1");
    expect(adjacentItemKey(keys, "CASS-1", -1)).toBeNull();
    expect(adjacentItemKey(keys, "CASS-4", 1)).toBeNull();
    expect(adjacentItemKey(keys, "CASS-9", 1)).toBeNull();
  });
});
