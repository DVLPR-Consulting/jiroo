/**
 * Markdown <-> Tiptap document conversion for the shared Markdown editor.
 *
 * Storage stays Markdown. The editor only accepts the subset it can round-trip
 * without losing meaning (see SUPPORTED_TOKENS); anything else — GFM tables,
 * raw HTML, images, links outside the link policy… — is reported by
 * `unsupportedMarkdownFeatures` so the
 * caller can keep the raw Markdown instead of silently dropping it.
 */
import type { JSONContent } from "@tiptap/react";
import type { MarkdownManager } from "@tiptap/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { isAllowedLinkUrl } from "@/lib/markdown/link-url";

/** marked token types the editor parses and serializes back faithfully. */
const SUPPORTED_TOKENS = new Set([
  "space",
  "paragraph",
  "text",
  "heading",
  "list",
  "list_item",
  "taskList",
  "taskItem",
  "checkbox",
  "blockquote",
  "code",
  "hr",
  "br",
  "escape",
  "strong",
  "em",
  "del",
  "codespan",
  "link",
  // Reference definitions are resolved into inline links, same rendering.
  "def",
]);

const FEATURE_LABELS: Record<string, string> = {
  table: "tableau",
  html: "HTML",
  image: "image",
};

type Token = {
  type: string;
  raw?: string;
  href?: string;
  tokens?: Token[];
  items?: Token[];
  nestedTokens?: Token[];
};

// Named character references other than the four Tiptap decodes (amp, lt,
// gt, quot, lowercase only: "&AMP;" is valid HTML but Tiptap keeps it as
// text) would turn into literal text on the next save.
const NAMED_ENTITY = /&(?!(?:amp|lt|gt|quot);)[A-Za-z][A-Za-z\d]{1,31};/;

function collectUnsupported(tokens: Token[] | undefined, found: Set<string>) {
  for (const token of tokens ?? []) {
    if (!SUPPORTED_TOKENS.has(token.type)) {
      found.add(FEATURE_LABELS[token.type] ?? token.type);
    } else if (
      (token.type === "link" || token.type === "def") &&
      !isAllowedLinkUrl(token.href ?? "")
    ) {
      // tel:, ftp:, "./page"… would lose their target in the editor.
      found.add("lien non pris en charge");
    } else if (token.type === "text" && !token.tokens && NAMED_ENTITY.test(token.raw ?? "")) {
      found.add("entité HTML");
    }
    collectUnsupported(token.tokens, found);
    collectUnsupported(token.items, found);
    collectUnsupported(token.nestedTokens, found);
  }
}

/** French labels of the Markdown constructs the editor cannot round-trip. */
export function unsupportedMarkdownFeatures(
  manager: MarkdownManager,
  markdown: string,
): string[] {
  const found = new Set<string>();
  collectUnsupported(manager.instance.lexer(markdown) as Token[], found);
  return [...found];
}

const LIST_ITEMS = new Set(["listItem", "taskItem"]);

function repair(node: JSONContent): JSONContent {
  const content = node.content?.map(repair);
  let next: JSONContent = content ? { ...node, content } : { ...node };

  // An empty list item ("1. " in a template) is parsed without its required
  // paragraph and would serialize to nothing: give it an empty one.
  if (next.type && LIST_ITEMS.has(next.type)) {
    const children = next.content ?? [];
    if (children[0]?.type !== "paragraph") {
      next = { ...next, content: [{ type: "paragraph" }, ...children] };
    }
  }

  // Never carry a disallowed link target (javascript:, data:…) into the editor.
  if (next.marks) {
    next.marks = next.marks.filter(
      (mark) =>
        mark.type !== "link" || isAllowedLinkUrl(String(mark.attrs?.href ?? "")),
    );
  }
  return next;
}

/** Parses Markdown into a Tiptap JSON document. */
export function markdownToDoc(manager: MarkdownManager, markdown: string): JSONContent {
  return repair(manager.parse(markdown));
}

// Line starts that would open a block (heading, quote, list, setext underline,
// thematic break) when the paragraph text is parsed again.
const BLOCK_START = /^( {0,3})(#{1,6}(?=[ \t]|$)|>|[-+=]|\d{1,9}(?=[.)](?:[ \t]|$)))/;

/** Backslash-escapes the block markers at the start of each paragraph line. */
export function escapeBlockStarts(paragraph: string): string {
  return paragraph
    .split("\n")
    .map((line) =>
      line.replace(BLOCK_START, (_match, indent: string, marker: string) =>
        /^\d/.test(marker) ? `${indent}${marker}\\` : `${indent}\\${marker}`,
      ),
    )
    .join("\n");
}

/** Serializes a Tiptap JSON document to the Markdown that gets stored. */
export function docToMarkdown(manager: MarkdownManager, doc: JSONContent): string {
  // Trailing blank lines come from the editor's trailing empty paragraph; the
  // last line keeps its own trailing spaces ("- [ ] " is an empty task).
  return manager.serialize(doc).replace(/\n\s*$/, "");
}

/**
 * Document position right after the `count`-th non-whitespace text character,
 * or null when the text is shorter. Used to put the caret where the user
 * clicked in the read rendering: whitespace is ignored on both sides because
 * the rendered HTML and the editor lay blocks out differently.
 */
export function positionAfterVisibleChars(
  doc: ProseMirrorNode,
  count: number,
): number | null {
  if (count <= 0) return null;
  let remaining = count;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;
    const text = node.text ?? "";
    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index]!)) continue;
      remaining -= 1;
      if (remaining === 0) {
        found = pos + index + 1;
        return false;
      }
    }
    return false;
  });
  return found;
}
