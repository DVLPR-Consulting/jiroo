import { describe, expect, it } from "vitest";
import {
  createSequenceMatcher,
  isEditableTarget,
  shortcutContext,
  shortcutEventKey,
  SEQUENCE_TIMEOUT_MS,
} from "@/lib/shortcuts/engine";

const BINDINGS = [
  { id: "help", sequence: ["?"] },
  { id: "next", sequence: ["j"] },
  { id: "go.board", sequence: ["g", "a"] },
  { id: "go.backlog", sequence: ["g", "b"] },
] as const;

describe("createSequenceMatcher", () => {
  it("matches a single key immediately", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    expect(matcher.feed("j", 0)).toEqual({ type: "match", id: "next" });
  });

  it("waits for the second key of a g sequence", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    expect(matcher.feed("g", 0)).toEqual({ type: "pending" });
    expect(matcher.feed("b", 400)).toEqual({ type: "match", id: "go.backlog" });
    // The buffer is cleared after a match.
    expect(matcher.feed("b", 500)).toEqual({ type: "none" });
  });

  it("drops a pending sequence after the timeout", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    matcher.feed("g", 0);
    expect(matcher.feed("a", SEQUENCE_TIMEOUT_MS + 1)).toEqual({ type: "none" });
  });

  it("still accepts the second key right at the timeout", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    matcher.feed("g", 0);
    expect(matcher.feed("a", SEQUENCE_TIMEOUT_MS)).toEqual({
      type: "match",
      id: "go.board",
    });
  });

  it("restarts from the key that broke a sequence", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    matcher.feed("g", 0);
    expect(matcher.feed("j", 100)).toEqual({ type: "match", id: "next" });
  });

  it("ignores unknown keys", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    expect(matcher.feed("x", 0)).toEqual({ type: "none" });
  });

  it("can be reset explicitly", () => {
    const matcher = createSequenceMatcher(BINDINGS);
    matcher.feed("g", 0);
    matcher.reset();
    expect(matcher.feed("a", 10)).toEqual({ type: "none" });
  });
});

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("shortcutEventKey", () => {
  it("returns lower-case letters without modifiers", () => {
    expect(shortcutEventKey(keyEvent({ key: "j" }))).toBe("j");
    expect(shortcutEventKey(keyEvent({ key: "J" }))).toBe("j"); // caps lock
  });

  it("rejects letters typed with a modifier", () => {
    expect(shortcutEventKey(keyEvent({ key: "k", metaKey: true }))).toBeNull();
    expect(shortcutEventKey(keyEvent({ key: "k", ctrlKey: true }))).toBeNull();
    expect(shortcutEventKey(keyEvent({ key: "K", shiftKey: true }))).toBeNull();
    expect(shortcutEventKey(keyEvent({ key: "a", altKey: true }))).toBeNull();
  });

  it("accepts punctuation whatever the layout needed to produce it", () => {
    expect(shortcutEventKey(keyEvent({ key: "?", shiftKey: true }))).toBe("?");
    // AZERTY: « / » is Shift + « : », « [ » is AltGr (Ctrl+Alt) + 5.
    expect(shortcutEventKey(keyEvent({ key: "/", shiftKey: true }))).toBe("/");
    expect(shortcutEventKey(keyEvent({ key: "[", ctrlKey: true, altKey: true }))).toBe("[");
  });

  it("rejects browser and OS combinations", () => {
    expect(shortcutEventKey(keyEvent({ key: "[", metaKey: true }))).toBeNull();
    expect(shortcutEventKey(keyEvent({ key: "/", ctrlKey: true }))).toBeNull();
  });

  it("rejects named keys, repeats and IME composition", () => {
    expect(shortcutEventKey(keyEvent({ key: "Enter" }))).toBeNull();
    expect(shortcutEventKey(keyEvent({ key: "j", repeat: true }))).toBeNull();
    expect(shortcutEventKey(keyEvent({ key: "j", isComposing: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  function el(html: string, selector: string): Element {
    document.body.innerHTML = html;
    return document.querySelector(selector)!;
  }

  it.each([
    ['<input type="text" />', "input"],
    ['<input />', "input"],
    ['<input type="search" />', "input"],
    ["<textarea></textarea>", "textarea"],
    ["<select><option>a</option></select>", "select"],
    ['<div contenteditable="true"><p>x</p></div>', "p"],
    ['<div class="ProseMirror"><p>x</p></div>', "p"],
    ['<div role="textbox"></div>', "div"],
    ['<div role="combobox"></div>', "div"],
  ])("treats %s as editable", (html, selector) => {
    expect(isEditableTarget(el(html, selector))).toBe(true);
  });

  it.each([
    ['<input type="checkbox" />', "input"],
    ['<button type="button">b</button>', "button"],
    ['<div contenteditable="false"><p>x</p></div>', "p"],
    ['<tr tabindex="0"></tr>', "tr"],
  ])("does not treat %s as editable", (html, selector) => {
    expect(isEditableTarget(el(html, selector))).toBe(false);
  });

  it("treats the document body as not editable", () => {
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("shortcutContext", () => {
  function target(html: string, selector = "#t"): Element {
    document.body.innerHTML = html;
    return document.querySelector(selector)!;
  }

  it("is the page outside any overlay", () => {
    expect(shortcutContext(target('<main><button id="t">x</button></main>'))).toBe("page");
    expect(shortcutContext(document.body)).toBe("page");
  });

  it("is the item inside the item drawer", () => {
    expect(
      shortcutContext(
        target('<div role="dialog" data-shortcut-scope="item"><button id="t">x</button></div>'),
      ),
    ).toBe("item");
  });

  it("is blocked inside other dialogs and menus", () => {
    expect(shortcutContext(target('<div role="dialog"><button id="t">x</button></div>'))).toBeNull();
    expect(shortcutContext(target('<div role="alertdialog"><button id="t">x</button></div>'))).toBeNull();
    expect(shortcutContext(target('<div role="menu"><div id="t" role="menuitem">x</div></div>'))).toBeNull();
  });

  it("is blocked in editable fields, even inside the drawer", () => {
    expect(
      shortcutContext(
        target('<div role="dialog" data-shortcut-scope="item"><textarea id="t"></textarea></div>'),
      ),
    ).toBeNull();
  });

  it("is blocked inside an element that keeps its own keys", () => {
    expect(
      shortcutContext(
        target('<div role="dialog" data-shortcut-scope="item"><div data-local-escape><button id="t">x</button></div></div>'),
      ),
    ).toBeNull();
  });
});
