import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readShortcutsEnabled,
  shortcutsEnabledSnapshot,
  SHORTCUTS_ENABLED_STORAGE_KEY,
  subscribeShortcutsEnabled,
  writeShortcutsEnabled,
} from "@/lib/shortcuts/preferences";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("shortcuts preference", () => {
  it("is enabled by default", () => {
    expect(readShortcutsEnabled()).toBe(true);
    expect(shortcutsEnabledSnapshot()).toBe(true);
  });

  it("persists the choice in local storage", () => {
    writeShortcutsEnabled(false);
    expect(window.localStorage.getItem(SHORTCUTS_ENABLED_STORAGE_KEY)).toBe("false");
    expect(readShortcutsEnabled()).toBe(false);
    writeShortcutsEnabled(true);
    expect(readShortcutsEnabled()).toBe(true);
  });

  it("notifies subscribers of local and cross-tab changes", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeShortcutsEnabled(onChange);
    writeShortcutsEnabled(false);
    window.dispatchEvent(
      new StorageEvent("storage", { key: SHORTCUTS_ENABLED_STORAGE_KEY }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    writeShortcutsEnabled(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("falls back to enabled when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readShortcutsEnabled()).toBe(true);
  });
});
