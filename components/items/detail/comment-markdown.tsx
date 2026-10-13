import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_PROSE } from "@/components/markdown/prose";
import { cn } from "@/lib/utils";

type MarkdownNode = {
  type: string;
  value?: string;
  data?: Record<string, unknown>;
  children?: MarkdownNode[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionMatcher(mentionNames: string[]): RegExp | null {
  const alternatives = [...new Set(mentionNames)]
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  return alternatives.length === 0
    ? null
    : new RegExp(
        `(^|[^\\p{L}\\p{N}_])(@(?:${alternatives.join("|")}))(?=$|[^\\p{L}\\p{N}_])`,
        "gu",
      );
}

function highlightedTextNodes(node: MarkdownNode, matcher: RegExp): MarkdownNode[] {
  const value = node.value ?? "";
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(matcher)) {
    const prefix = match[1] ?? "";
    const mention = match[2];
    if (!mention || match.index === undefined) continue;

    const mentionStart = match.index + prefix.length;
    if (mentionStart > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, mentionStart) });
    }
    nodes.push({
      type: "text",
      value: mention,
      data: {
        hName: "mark",
        hProperties: { "data-mention": "true" },
      },
    });
    lastIndex = mentionStart + mention.length;
  }

  if (nodes.length === 0) return [node];
  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }
  return nodes;
}

function highlightMentions(node: MarkdownNode, matcher: RegExp): void {
  if (!node.children) return;

  node.children = node.children.flatMap((child) => {
    if (child.type === "text") return highlightedTextNodes(child, matcher);
    highlightMentions(child, matcher);
    return child;
  });
}

function remarkMentionHighlights(mentionNames: string[]) {
  return () => (tree: unknown) => {
    const matcher = mentionMatcher(mentionNames);
    if (matcher) highlightMentions(tree as MarkdownNode, matcher);
  };
}

// Renders comment body as GFM markdown, styled like the comment editor. No rehype-raw — XSS-safe.
export function CommentMarkdown({
  body,
  mentionNames,
}: {
  body: string;
  mentionNames: string[];
}) {
  return (
    <div className={cn(MARKDOWN_PROSE, "[&_mark]:rounded [&_mark]:bg-[var(--accent-subtle)] [&_mark]:px-0.5 [&_mark]:font-medium [&_mark]:text-[var(--accent-subtle-fg)]")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMentionHighlights(mentionNames)]}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
