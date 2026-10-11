import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { markdownEditorExtensions } from "@/lib/markdown/editor-extensions";
import { docToMarkdown } from "@/lib/markdown/markdown-document";
import { SLASH_COMMANDS, filterSlashCommands } from "@/lib/markdown/slash-commands";

const labels = (query: string) => filterSlashCommands(query).map((command) => command.label);

describe("filterSlashCommands", () => {
  it("lists every block in a fixed order for an empty query", () => {
    expect(labels("")).toEqual([
      "Texte",
      "Titre 1",
      "Titre 2",
      "Titre 3",
      "Liste à puces",
      "Liste numérotée",
      "Liste de tâches",
      "Citation",
      "Bloc de code",
      "Séparateur",
    ]);
  });

  it("matches labels case- and accent-insensitively", () => {
    expect(labels("TITRE")).toEqual(["Titre 1", "Titre 2", "Titre 3"]);
    expect(labels("separateur")).toEqual(["Séparateur"]);
    expect(labels("numerot")).toEqual(["Liste numérotée"]);
  });

  it("matches keywords and Markdown shortcuts", () => {
    expect(labels("h2")).toEqual(["Titre 2"]);
    expect(labels("todo")).toEqual(["Liste de tâches"]);
    expect(labels("quote")).toEqual(["Citation"]);
    expect(labels("code")).toEqual(["Bloc de code"]);
    expect(labels("liste")).toEqual(["Liste à puces", "Liste numérotée", "Liste de tâches"]);
  });

  it("ranks label prefixes before other matches", () => {
    expect(labels("c")[0]).toBe("Citation");
  });

  it("returns nothing for an unknown query", () => {
    expect(labels("tableau")).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = SLASH_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("slash command blocks", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function run(id: string) {
    editor = new Editor({ extensions: markdownEditorExtensions(), content: "<p>/x</p>" });
    const command = SLASH_COMMANDS.find((candidate) => candidate.id === id)!;
    command.run(editor.chain().focus().deleteRange({ from: 1, to: 3 })).run();
    editor.commands.insertContent("Bloc");
    return docToMarkdown(editor.markdown!, editor.getJSON());
  }

  it.each([
    ["heading1", "# Bloc"],
    ["heading2", "## Bloc"],
    ["heading3", "### Bloc"],
    ["bulletList", "- Bloc"],
    ["orderedList", "1. Bloc"],
    ["taskList", "- [ ] Bloc"],
    ["blockquote", "> Bloc"],
    ["codeBlock", "```\nBloc\n```"],
    ["paragraph", "Bloc"],
  ])("%s produces round-trippable Markdown", (id, expected) => {
    expect(run(id).trim()).toBe(expected);
  });

  it("inserts a separator", () => {
    expect(run("horizontalRule")).toContain("---");
  });
});
