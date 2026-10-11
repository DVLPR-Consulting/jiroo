import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { markdownEditorExtensions } from "@/lib/markdown/editor-extensions";
import { docToMarkdown } from "@/lib/markdown/markdown-document";
import { createSlashMenuStore, isSlashMenuActive } from "@/lib/markdown/slash-extension";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function setup(content = "") {
  const store = createSlashMenuStore();
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: markdownEditorExtensions({ slashMenu: store }),
    content,
  });
  editor.commands.focus("end");
  return { editor, store };
}

function press(target: Editor, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  return target.view.someProp("handleKeyDown", (handler) => handler(target.view, event)) ?? false;
}

const markdown = (target: Editor) => docToMarkdown(target.markdown!, target.getJSON()).trim();

describe("slash command menu", () => {
  it("opens on « / » in an empty block with every block listed", () => {
    const { editor: e, store } = setup();
    e.commands.insertContent("/");
    expect(store.getState().open).toBe(true);
    expect(store.getState().items).toHaveLength(10);
    expect(isSlashMenuActive(e.state)).toBe(true);
  });

  it("opens after a space but not inside a word", () => {
    const { editor: e, store } = setup("<p>Voir</p>");
    e.commands.insertContent("/");
    expect(store.getState().open).toBe(false);
    e.commands.insertContent(" /");
    expect(store.getState().open).toBe(true);
  });

  it("filters while typing and inserts the active block with Entrée", () => {
    const { editor: e, store } = setup();
    e.commands.insertContent("/titre");
    expect(store.getState().items.map((item) => item.label)).toEqual([
      "Titre 1",
      "Titre 2",
      "Titre 3",
    ]);
    expect(press(e, "ArrowDown")).toBe(true);
    expect(press(e, "Enter")).toBe(true);
    e.commands.insertContent("Contexte");
    expect(markdown(e)).toBe("## Contexte");
    expect(store.getState().open).toBe(false);
  });

  it("wraps around with the arrow keys", () => {
    const { editor: e, store } = setup();
    e.commands.insertContent("/");
    press(e, "ArrowUp");
    expect(store.getState().items[store.getState().active]?.label).toBe("Séparateur");
    press(e, "ArrowDown");
    expect(store.getState().active).toBe(0);
  });

  it("closes on Échap and keeps the typed text", () => {
    const { editor: e, store } = setup();
    e.commands.insertContent("/ti");
    expect(press(e, "Escape")).toBe(true);
    expect(store.getState().open).toBe(false);
    expect(markdown(e)).toBe("/ti");
  });

  it("lets Entrée create a new line when nothing matches", () => {
    const { editor: e, store } = setup();
    e.commands.insertContent("/zzz");
    expect(store.getState().items).toEqual([]);
    press(e, "Enter");
    expect(e.getJSON().content).toHaveLength(2);
  });

  it("inserts a block chosen with the mouse", () => {
    const { editor: e, store } = setup();
    e.commands.insertContent("/cit");
    store.select(store.getState().items[0]!);
    e.commands.insertContent("Note");
    expect(markdown(e)).toBe("> Note");
  });

  it("is not offered in a code block", () => {
    const { editor: e, store } = setup("<pre><code>x</code></pre>");
    e.commands.insertContent(" /");
    expect(store.getState().open).toBe(false);
  });
});
