"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type { MarkdownEditorHandle } from "@/components/markdown/markdown-editor-core";

// Tiptap/ProseMirror weigh ~160 KB gzipped: load them only where an editor is
// actually shown (e.g. once "Éditer" is clicked), not with every item drawer.
const MarkdownEditorCore = lazy(() =>
  import("@/components/markdown/markdown-editor-core").then((module) => ({
    default: module.MarkdownEditor,
  })),
);

type MarkdownEditorProps = ComponentProps<typeof MarkdownEditorCore>;

/** Shared WYSIWYG Markdown editor, loaded on demand (see markdown-editor-core). */
export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden
          className="rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)]"
        >
          <div className="h-9 border-b border-border" />
          <div className={cn("px-3 py-2", props.minHeightClassName ?? "min-h-32")} />
        </div>
      }
    >
      <MarkdownEditorCore {...props} />
    </Suspense>
  );
}
