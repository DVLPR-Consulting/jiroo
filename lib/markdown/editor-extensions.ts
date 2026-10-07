/**
 * Tiptap extensions of the shared Markdown editor. No raw HTML is ever emitted:
 * every node and mark here has a Markdown serialization, underline (HTML-only
 * in Markdown) is disabled, and links are restricted by `isAllowedLinkUrl`.
 */
import { Extension, type AnyExtension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { docToMarkdown, escapeBlockStarts } from "@/lib/markdown/markdown-document";
import { isAllowedLinkUrl } from "@/lib/markdown/link-url";

/** Transaction meta letting a programmatic content reset bypass the limit. */
export const BYPASS_LENGTH_LIMIT = "markdownLengthLimitBypass";

/**
 * Rejects any edit that would make the produced Markdown longer than `limit`
 * characters (the stored value is Markdown, so that is what the limit counts).
 * Edits that shrink an already-too-long document stay allowed.
 */
export const MarkdownLengthLimit = Extension.create<{ limit: number | null }>({
  name: "markdownLengthLimit",
  addOptions() {
    return { limit: null };
  },
  addProseMirrorPlugins() {
    const { limit } = this.options;
    const editor = this.editor;
    if (!limit) return [];
    return [
      new Plugin({
        key: new PluginKey("markdownLengthLimit"),
        filterTransaction: (tr, state) => {
          const manager = editor.markdown;
          if (!tr.docChanged || tr.getMeta(BYPASS_LENGTH_LIMIT) || !manager) return true;
          const next = docToMarkdown(manager, tr.doc.toJSON()).length;
          if (next <= limit) return true;
          return next <= docToMarkdown(manager, state.doc.toJSON()).length;
        },
      }),
    ];
  },
});

/**
 * Paragraph whose lines never start a Markdown block: a typed "# x", "- x",
 * "1. x" or "> x" stays literal text instead of becoming a heading or list
 * once the stored Markdown is read again.
 */
const LiteralParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    const rendered = this.parent?.(node, helpers, context) ?? "";
    return escapeBlockStarts(rendered);
  },
});

export function markdownEditorExtensions({
  maxLength = null,
}: { maxLength?: number | null } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      paragraph: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        protocols: [],
        isAllowedUri: (url) => isAllowedLinkUrl(url),
        shouldAutoLink: (url) => isAllowedLinkUrl(url),
      },
    }),
    LiteralParagraph,
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: {
        checkboxLabel: (node, checked) =>
          `Tâche ${checked ? "faite" : "à faire"} : ${node.textContent || "tâche vide"}`,
      },
    }),
    Markdown,
    MarkdownLengthLimit.configure({ limit: maxLength }),
  ];
}
