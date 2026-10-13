import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
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

  it("renders comments with the comment editor's typography", () => {
    const { container } = render(<CommentMarkdown body={"## Contexte\n\nTexte"} mentionNames={[]} />);
    const root = container.firstElementChild as HTMLElement;
    for (const token of MARKDOWN_PROSE.split(" ")) expect(root.classList).toContain(token);
    expect(container.querySelector("h2")).toHaveTextContent("Contexte");
  });
});
