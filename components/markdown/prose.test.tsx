import fs from "node:fs";
import path from "node:path";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommentMarkdown } from "@/components/items/detail/comment-markdown";
import { MARKDOWN_PAGE_PROSE, MARKDOWN_PROSE } from "@/components/markdown/prose";

// The typography tokens of app/globals.css (`.t-h2`…) are plain CSS: Tailwind
// emits nothing for them behind a variant, so `[&_h2]:t-h2` left read-mode
// headings unstyled (JIR-68).
const TOKEN_CLASSES = ["t-display", "t-h1", "t-h2", "t-h3", "t-body", "t-sm", "t-label", "t-meta"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("Markdown prose", () => {
  it("never applies a typography token class through a Tailwind variant", () => {
    const variantToken = new RegExp(`:(${TOKEN_CLASSES.join("|")})(?![\\w-])`);
    const offenders = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .flatMap((file) =>
        fs
          .readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, index) =>
            line.split(/\s+/).some((token) => token.includes("]:") && variantToken.test(token))
              ? [`${file}:${index + 1}`]
              : [],
          ),
      );
    expect(offenders).toEqual([]);
  });

  it("sizes headings on the token scale with explicit values", () => {
    expect(MARKDOWN_PROSE).toContain("[&_h2]:text-[17px]");
    expect(MARKDOWN_PAGE_PROSE).toContain("[&_h1]:text-[22px]");
    expect(MARKDOWN_PAGE_PROSE).toContain("[&_h2]:text-[17px]");
  });

  it.each([
    ["tight", "- [ ] À faire avec **du texte**\n- [x] Fait"],
    ["loose", "- [ ] À faire avec **du texte**\n\n- [x] Fait"],
  ])("styles %s GFM task lists with first-line checkbox alignment", (_kind, body) => {
    const { container } = render(<CommentMarkdown body={body} mentionNames={[]} />);
    const root = container.firstElementChild as HTMLElement;
    const list = root.querySelector("ul.contains-task-list")!;
    const checkboxes = within(root).getAllByRole("checkbox");
    expect(list.querySelectorAll(":scope > li.task-list-item")).toHaveLength(2);
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeDisabled();
    expect(checkboxes[1]).toBeChecked();
    expect(list.querySelector("strong")).toHaveTextContent("du texte");

    // jsdom has no layout: check the shared rules on the actual renderer root.
    expect(root).toHaveClass(
      "[&_ul.contains-task-list]:list-none",
      "[&_ul.contains-task-list]:pl-0",
      "[&_li.task-list-item]:relative",
      "[&_li.task-list-item]:pl-[calc(1em+0.5rem)]",
      "[&_li.task-list-item>p]:my-0",
      "[&_li.task-list-item_input[type=checkbox]]:absolute",
      "[&_li.task-list-item_input[type=checkbox]]:start-0",
      "[&_li.task-list-item_input[type=checkbox]]:top-[0.2em]",
      "[&_li.task-list-item_input[type=checkbox]]:size-[1em]",
    );
  });

  it("keeps ordinary bullets inside tasks and mixed lists", () => {
    const body = "- [ ] À faire\n  - Détail ordinaire\n- Voisin ordinaire\n\nParagraphe.\n\n- Liste ordinaire";
    const { container } = render(<CommentMarkdown body={body} mentionNames={[]} />);
    const root = container.firstElementChild as HTMLElement;
    const normalLists = root.querySelectorAll("ul:not(.contains-task-list)");
    expect(normalLists).toHaveLength(2);
    expect(normalLists[0]).toHaveTextContent("Détail ordinaire");
    expect(normalLists[0]!.closest("li.task-list-item")).not.toBeNull();
    expect(normalLists[1]).toHaveTextContent("Liste ordinaire");
    expect(root.querySelector("ul.contains-task-list > li:not(.task-list-item)"))
      .toHaveTextContent("Voisin ordinaire");
    expect(root).toHaveClass(
      "[&_ul]:list-disc",
      "[&_ul]:pl-5",
      "[&_ul.contains-task-list>li:not(.task-list-item)]:list-disc",
      "[&_ul.contains-task-list>li:not(.task-list-item)]:ms-5",
    );
    // Only task items lose their marker; ordinary descendants keep the defaults.
    expect(MARKDOWN_PROSE).not.toContain("[&_ul.contains-task-list_li]:list-none");
    expect(MARKDOWN_PROSE).not.toContain("[&_ul.contains-task-list_ul]:pl-0");
  });

  it("renders comments with the comment editor's typography", () => {
    const { container } = render(<CommentMarkdown body={"## Contexte\n\nTexte"} mentionNames={[]} />);
    const root = container.firstElementChild as HTMLElement;
    for (const token of MARKDOWN_PROSE.split(" ")) expect(root.classList).toContain(token);
    expect(container.querySelector("h2")).toHaveTextContent("Contexte");
  });
});
