import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import {
  BYPASS_LENGTH_LIMIT,
  markdownEditorExtensions,
} from "@/lib/markdown/editor-extensions";
import { docToMarkdown, markdownToDoc } from "@/lib/markdown/markdown-document";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function create(markdown = "", maxLength: number | null = null) {
  editor = new Editor({ extensions: markdownEditorExtensions({ maxLength }) });
  const manager = editor.markdown!;
  editor
    .chain()
    .setMeta(BYPASS_LENGTH_LIMIT, true)
    .setContent(markdownToDoc(manager, markdown), { emitUpdate: false })
    .run();
  return { editor, markdown: () => docToMarkdown(manager, editor!.getJSON()) };
}

/** Types text the way ProseMirror receives it, so input rules run. */
function type(target: Editor, text: string) {
  for (const char of text) {
    const { from, to } = target.state.selection;
    const handled = target.view.someProp("handleTextInput", (handler) =>
      handler(target.view, from, to, char, () => target.state.tr.insertText(char, from, to)),
    );
    if (!handled) target.view.dispatch(target.state.tr.insertText(char, from, to));
  }
}

describe("Markdown input rules", () => {
  it.each([
    ["## ", "Titre", "## Titre"],
    ["### ", "Sous-titre", "### Sous-titre"],
    ["- ", "puce", "- puce"],
    ["1. ", "étape", "1. étape"],
    ["> ", "citation", "> citation"],
    ["[ ] ", "tâche", "- [ ] tâche"],
  ])("turns %j into a block", (trigger, text, expected) => {
    const { editor, markdown } = create();
    editor.commands.focus("end");
    type(editor, trigger);
    type(editor, text);
    expect(markdown()).toBe(expected);
  });

  it.each([
    ["**gras**", "**gras**", "strong"],
    ["*ital*", "*ital*", "em"],
    ["~~barré~~", "~~barré~~", "s"],
    ["`code`", "`code`", "code"],
  ])("turns %j into a mark", (typed, expected, tag) => {
    const { editor, markdown } = create();
    editor.commands.focus("end");
    type(editor, `${typed} `);
    expect(markdown()).toBe(`${expected} `);
    expect(editor.getHTML()).toContain(`<${tag}>`);
  });
});

describe("MarkdownLengthLimit", () => {
  it("rejects an edit whose Markdown would exceed the limit", () => {
    const { editor, markdown } = create("12345678", 10);
    editor.commands.focus("end");
    expect(editor.commands.insertContent("90")).toBe(true);
    expect(markdown()).toBe("1234567890");
    editor.commands.insertContent("X");
    expect(markdown()).toBe("1234567890");
  });

  it("counts the Markdown syntax, not the visible text", () => {
    const { editor, markdown } = create("abcdef", 10);
    editor.commands.selectAll();
    // "**abcdef**" is 10 characters: allowed. Adding a heading is not.
    editor.commands.toggleBold();
    expect(markdown()).toBe("**abcdef**");
    editor.commands.toggleHeading({ level: 2 });
    expect(markdown()).toBe("**abcdef**");
  });

  it("lets an over-limit legacy value shrink but not grow", () => {
    const { editor, markdown } = create("0123456789ABC", 10);
    editor.commands.focus("end");
    editor.commands.insertContent("D");
    expect(markdown()).toBe("0123456789ABC");
    editor.commands.deleteRange({ from: 13, to: 14 });
    expect(markdown()).toBe("0123456789AB");
  });
});
