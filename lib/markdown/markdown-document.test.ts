import { afterAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Editor } from "@tiptap/react";
import { markdownEditorExtensions } from "@/lib/markdown/editor-extensions";
import {
  docToMarkdown,
  markdownToDoc,
  positionAfterVisibleChars,
  unsupportedMarkdownFeatures,
} from "@/lib/markdown/markdown-document";
import { ITEM_TEMPLATES } from "@/lib/items/templates";
import { buildReleaseNotesMarkdown } from "@/lib/releases/notes";

const editor = new Editor({ extensions: markdownEditorExtensions() });
const manager = editor.markdown!;
afterAll(() => editor.destroy());

const roundTrip = (markdown: string) => docToMarkdown(manager, markdownToDoc(manager, markdown));
// What the read mode shows: react-markdown + remark-gfm, no raw HTML.
const rendered = (markdown: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown))
    .replace(/>\s+</g, "><")
    .trim();

describe("Markdown round-trip on the supported subset", () => {
  it.each([
    ["headings", "# Titre 1\n\n## Titre 2\n\n### Titre 3"],
    ["inline marks", "Du **gras**, de l’*italique*, du ~~barré~~ et du `code`."],
    ["link", "Voir [la décision](https://www.courdecassation.fr/decision/1)."],
    ["bullet list", "- un\n- deux\n  - deux bis\n- trois"],
    ["ordered list", "1. un\n2. deux\n3. trois"],
    ["task list", "- [ ] à faire\n- [x] fait"],
    ["quote", "> Une citation\n> sur deux lignes"],
    ["code block", "```ts\nconst a = 1;\n\nconst b = 2;\n```"],
    ["hard break", "ligne  \nsuivante"],
    ["thematic break", "avant\n\n---\n\naprès"],
    ["escaped characters", "a\\_b\\_c, \\*pas italique\\*, \\[pas un lien\\]"],
    ["literal block markers", "\\# pas un titre\n\\- pas une liste\n1\\. pas numéroté\n\\+ pas une liste"],
  ])("keeps %s byte-identical", (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it.each([
    ["bug template", ITEM_TEMPLATES[0]!.description],
    ["user story template", ITEM_TEMPLATES[1]!.description],
    [
      "release notes",
      buildReleaseNotesMarkdown(
        {
          releaseName: "V1 <script>",
          description: "Ligne *une*\n# pas un titre\n<b>x</b>",
          effectiveReleaseDate: "2026-08-20",
          truncated: true,
          items: [
            { key: "CASS-1", title: "Corriger `a_b`", kind: "bug", type: "tache", completed: true },
            { key: "CASS-2", title: "[Lien] *mot*", kind: "feature", type: "tache", completed: true },
          ],
        },
        { includeIncomplete: true, includeDescription: true },
      ),
    ],
    ["escaped HTML", "1 \\< 2 et \\<b\\>x\\</b\\>\n\\> pas une citation"],
    [
      "normalized syntax",
      "Titre\n=====\n\n* a\n* b\n\n__gras__ _ital_\n\n    code indenté\n\n***\n\n<https://a.fr> [r][1]\n\n[1]: https://ref.fr",
    ],
  ])("renders the %s identically after a round-trip", (_name, markdown) => {
    expect(rendered(roundTrip(markdown))).toBe(rendered(markdown));
    // And the round-trip is stable.
    expect(roundTrip(roundTrip(markdown))).toBe(roundTrip(markdown));
  });

  it("keeps the empty numbered steps of the bug template", () => {
    expect(roundTrip("## Étapes pour reproduire\n1. \n2. \n3. \n")).toBe(
      "## Étapes pour reproduire\n\n1. \n2. \n3. ",
    );
  });

  it("serializes an empty document as an empty string", () => {
    expect(roundTrip("")).toBe("");
  });

  it("drops disallowed link targets but keeps their text", () => {
    expect(roundTrip("[clic](javascript:alert(1)) et [ok](https://a.fr)")).toBe(
      "clic et [ok](https://a.fr)",
    );
  });

  it("escapes typed HTML instead of emitting raw HTML", () => {
    editor.commands.setContent("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
    const markdown = docToMarkdown(manager, editor.getJSON());
    expect(markdown).not.toMatch(/<img/);
    expect(rendered(markdown)).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  });
});

describe("unsupportedMarkdownFeatures", () => {
  it("accepts the supported subset", () => {
    expect(
      unsupportedMarkdownFeatures(
        manager,
        "# t\n\n- [ ] a\n\n1. b\n\n> c\n\n```\nd\n```\n\n**e** *f* ~~g~~ `h` [i](https://j.fr)\n\n---",
      ),
    ).toEqual([]);
  });

  it.each([
    ["| a | b |\n|---|---|\n| 1 | 2 |", ["tableau"]],
    ["texte <b>gras</b>", ["HTML"]],
    ["<div>bloc</div>", ["HTML"]],
    ["![capture](https://a.fr/x.png)", ["image"]],
    ["- liste\n\n| a |\n|---|\n| 1 |\n\n![i](u)", ["tableau", "image"]],
    ["[appel](tel:+33100000000)", ["lien non pris en charge"]],
    ["[voir](./page) et [ok](https://a.fr)", ["lien non pris en charge"]],
    ["[x](javascript:alert(1))", ["lien non pris en charge"]],
    ["[r][1]\n\n[1]: ftp://a.fr", ["lien non pris en charge"]],
  ])("reports %j", (markdown, expected) => {
    expect(unsupportedMarkdownFeatures(manager, markdown)).toEqual(expected);
  });
});

describe("positionAfterVisibleChars", () => {
  it("maps a count of visible characters to a document position", () => {
    editor.commands.setContent(markdownToDoc(manager, "## Titre\n\nUn **mot** ici"));
    const doc = editor.state.doc;
    // "Titre" (5) + "Unmot" (5): right after the "t" of "mot".
    const pos = positionAfterVisibleChars(doc, 10)!;
    expect(doc.textBetween(0, pos, "|")).toBe("Titre|Un mot");
    expect(positionAfterVisibleChars(doc, 1)).toBe(2);
  });

  it("returns null when the count is out of range", () => {
    editor.commands.setContent(markdownToDoc(manager, "abc"));
    expect(positionAfterVisibleChars(editor.state.doc, 0)).toBeNull();
    expect(positionAfterVisibleChars(editor.state.doc, 4)).toBeNull();
  });
});

describe("code block fences (Codex R1)", () => {
  it("keeps a code block containing a fence after an unrelated edit", () => {
    const markdown = "Avant\n\n````js\n```\n````";
    editor.commands.setContent(markdownToDoc(manager, markdown));
    editor.commands.insertContentAt(2, "!");
    const saved = docToMarkdown(manager, editor.getJSON());
    expect(rendered(saved)).toBe(rendered(markdown.replace("Avant", "A!vant")));
    expect(unsupportedMarkdownFeatures(manager, saved)).toEqual([]);
  });

  it("fences a newly typed code block longer than its own backtick runs", () => {
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "md" },
          content: [{ type: "text", text: "```\nx\n`````" }],
        },
      ],
    });
    const saved = docToMarkdown(manager, editor.getJSON());
    expect(saved).toBe("``````md\n```\nx\n`````\n``````");
    expect(rendered(saved)).toBe(
      '<pre><code class="language-md">```\nx\n`````\n</code></pre>',
    );
  });
});

describe("named HTML entities (Codex R2)", () => {
  it("keeps named entities by editing such content as raw Markdown", () => {
    expect(
      unsupportedMarkdownFeatures(manager, "Texte &eacute;crit &copy; 2026 &nbsp; fin"),
    ).toEqual(["entité HTML"]);
    expect(unsupportedMarkdownFeatures(manager, "- point &rarr; suite")).toEqual(["entité HTML"]);
  });

  it.each([
    ["basic entities", "1 &lt; 2 &amp; 3 &gt; 0 &quot;ok&quot;"],
    ["numeric references", "&#233;t&#xE9;"],
    ["already-escaped references", "\\&eacute; et &amp;copy;"],
    ["entities inside code", "Voir `&eacute;` et\n\n```\n&copy;\n```"],
  ])("edits %s visually and keeps their rendering", (_name, markdown) => {
    expect(unsupportedMarkdownFeatures(manager, markdown)).toEqual([]);
    editor.commands.setContent(markdownToDoc(manager, markdown));
    editor.commands.insertContentAt(1, "!");
    expect(rendered(docToMarkdown(manager, editor.getJSON()))).toBe(rendered(`!${markdown}`));
  });
});
