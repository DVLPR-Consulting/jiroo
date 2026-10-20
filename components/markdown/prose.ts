/**
 * Markdown typography shared by the editors and the read-mode renderers, so
 * a heading or a list looks the same while writing and once saved (JIR-68).
 * Headings use explicit values on the t-h1/t-h2/t-h3 scale of
 * app/globals.css: those token classes are plain CSS, which Tailwind cannot
 * apply through an arbitrary variant (`[&_h2]:` followed by the token).
 */

// GFM puts checkboxes inline (inside a paragraph for loose lists). Reserve a
// checkbox column without turning text, emphasis and links into separate flex
// items. Ordinary bullets in mixed lists keep their original indentation.
const GFM_TASK_LIST_PROSE = [
  "[&_ul.contains-task-list]:list-none",
  "[&_ul.contains-task-list]:pl-0",
  "[&_ul.contains-task-list>li:not(.task-list-item)]:list-disc",
  "[&_ul.contains-task-list>li:not(.task-list-item)]:ms-5",
  "[&_li.task-list-item]:list-none",
  "[&_li.task-list-item]:relative",
  "[&_li.task-list-item]:pl-[calc(1em+0.5rem)]",
  "[&_li.task-list-item>p]:my-0",
  "[&_li.task-list-item_input[type=checkbox]]:absolute",
  "[&_li.task-list-item_input[type=checkbox]]:start-0",
  "[&_li.task-list-item_input[type=checkbox]]:top-[0.2em]",
  "[&_li.task-list-item_input[type=checkbox]]:size-[1em]",
].join(" ");

/**
 * Framed editor (comments, release notes) and their read mode. Task items are
 * styled through their list: the item node view has no data-type attribute.
 */
export const MARKDOWN_PROSE =
  "text-sm leading-relaxed text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[var(--font-mono)] [&_code]:text-[0.85em] [&_h1]:my-2 [&_h1]:text-[17px] [&_h1]:leading-[1.3] [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-[17px] [&_h2]:leading-[1.3] [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-3 [&_hr]:border-border [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_ul[data-type=taskList]>li]:flex [&_ul[data-type=taskList]>li]:items-start [&_ul[data-type=taskList]>li]:gap-2 [&_ul[data-type=taskList]>li>label]:mt-[0.2em] [&_ul[data-type=taskList]>li>div]:min-w-0 [&_ul[data-type=taskList]>li>div]:flex-1 [&_ul[data-type=taskList]>li_p]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" + ` ${GFM_TASK_LIST_PROSE}`;

/** Notion-like page (item description): no frame, airy text. */
export const MARKDOWN_PAGE_PROSE =
  "text-sm leading-[1.7] text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[var(--font-mono)] [&_code]:text-[0.85em] [&_h1]:mt-6 [&_h1]:mb-1.5 [&_h1]:text-[22px] [&_h1]:leading-[1.2] [&_h1]:font-semibold [&_h1]:tracking-[-0.018em] [&_h2]:mt-5 [&_h2]:mb-1 [&_h2]:text-[17px] [&_h2]:leading-[1.3] [&_h2]:font-semibold [&_h2]:tracking-[-0.012em] [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:leading-[1.35] [&_h3]:font-semibold [&_h3]:tracking-[-0.006em] [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-3 [&_pre]:leading-relaxed [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-3.5 [&_blockquote]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border [&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-[var(--ring)] [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0.5 [&_ul[data-type=taskList]>li]:flex [&_ul[data-type=taskList]>li]:items-start [&_ul[data-type=taskList]>li]:gap-2 [&_ul[data-type=taskList]>li>label]:mt-[0.35em] [&_ul[data-type=taskList]>li>div]:min-w-0 [&_ul[data-type=taskList]>li>div]:flex-1 [&_ul[data-type=taskList]>li_p]:my-0 [&_.suggestion]:rounded-sm [&_.suggestion]:bg-[var(--muted)] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";
