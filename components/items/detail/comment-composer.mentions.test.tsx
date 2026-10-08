import { useImperativeHandle, useState, type Ref } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "@/components/items/detail/comment-composer";
import type { MarkdownEditorHandle } from "@/components/markdown/markdown-editor";

const mocks = vi.hoisted(() => ({ addCommentAction: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/comments", () => ({
  addCommentAction: mocks.addCommentAction,
  editCommentAction: vi.fn(),
}));

// jsdom cannot type into ProseMirror reliably: a plain field stands in for the
// editor, honouring the same caret and replacement contract (the real editor's
// side is covered by markdown-editor.test.tsx and the E2E suite).
vi.mock("@/components/markdown/markdown-editor", () => ({
  MarkdownEditor: function StubEditor({
    value,
    onChange,
    onCaretTextChange,
    label,
    maxLength,
    ref,
  }: {
    value: string;
    onChange: (value: string) => void;
    onCaretTextChange?: (text: string) => void;
    label: string;
    maxLength?: number;
    ref?: Ref<MarkdownEditorHandle>;
  }) {
    const [current, setCurrent] = useState(value);
    const update = (next: string) => {
      setCurrent(next);
      onChange(next);
      onCaretTextChange?.(next);
    };
    useImperativeHandle(ref, () => ({
      focus: () => {},
      // Same contract as the real editor: refuse past the limit, report it.
      replaceTextBeforeCaret: (length: number, text: string) => {
        const next = current.slice(0, current.length - length) + text;
        if (maxLength !== undefined && next.length > maxLength) return false;
        update(next);
        return true;
      },
    }));
    return (
      <textarea aria-label={label} value={current} onChange={(e) => update(e.target.value)} />
    );
  },
}));

describe("CommentComposer mentions", () => {
  it("suggests users after @ and records the selected mention", async () => {
    const user = userEvent.setup();
    mocks.addCommentAction.mockResolvedValueOnce({ ok: true });
    render(
      <CommentComposer
        itemId="item-1"
        backlogKey="DEMO"
        users={[
          { id: "user-alice", name: "Alice" },
          { id: "user-bob", name: "Bob" },
        ]}
        mode="create"
      />,
    );
    const field = screen.getByRole("textbox", { name: "Nouveau commentaire" });
    await user.type(field, "Merci @al");
    const listbox = screen.getByRole("listbox", { name: "Suggestions de mention" });
    expect(listbox).toHaveTextContent("Alice");
    expect(listbox).not.toHaveTextContent("Bob");
    await user.click(screen.getByRole("button", { name: "Alice" }));
    expect(field).toHaveValue("Merci @Alice ");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Commenter" }));
    expect(mocks.addCommentAction).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      itemId: "item-1",
      body: "Merci @Alice",
      mentionIds: ["user-alice"],
    });
  });

  it("does not record a mention refused by the 5 000 limit (Codex R3)", async () => {
    const user = userEvent.setup();
    mocks.addCommentAction.mockReset();
    mocks.addCommentAction.mockResolvedValueOnce({ ok: true });
    const body = `${"x".repeat(4996)} @a`;
    render(
      <CommentComposer
        itemId="item-1"
        backlogKey="DEMO"
        users={[{ id: "user-alice", name: "Alice Exemple" }]}
        mode="create"
        initialBody={body.slice(0, -1)}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Nouveau commentaire" });
    await user.click(field);
    await user.type(field, "a");
    await user.click(screen.getByRole("button", { name: "Alice Exemple" }));

    expect(field).toHaveValue(body);
    expect(screen.getByRole("alert")).toHaveTextContent("limite de 5 000 caractères");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Commenter" }));
    expect(mocks.addCommentAction).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      itemId: "item-1",
      body,
      mentionIds: [],
    });
  });
});
