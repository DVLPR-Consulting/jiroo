import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentComposer } from "@/components/items/detail/comment-composer";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  addCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/actions/comments", () => ({
  addCommentAction: mocks.addCommentAction,
  editCommentAction: mocks.editCommentAction,
}));

const USERS = [{ id: "user-alice", name: "Alice" }];

describe("CommentComposer", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.addCommentAction.mockReset();
    mocks.editCommentAction.mockReset();
  });

  it("writes a new comment in the Markdown editor and submits with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    mocks.addCommentAction.mockResolvedValueOnce({ ok: true });
    render(
      <CommentComposer
        itemId="item-1"
        backlogKey="DEMO"
        users={USERS}
        mode="create"
        initialBody="Premier"
      />,
    );
    const editor = await screen.findByRole("textbox", { name: "Nouveau commentaire" });
    expect(screen.getByRole("toolbar", { name: "Mise en forme" })).toBeVisible();
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Gras" }));
    await user.click(editor);
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mocks.addCommentAction).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      itemId: "item-1",
      body: "**Premier**",
      mentionIds: [],
    });
    // Cleared after a successful submit.
    await waitFor(() => expect(editor).toHaveTextContent(""));
    expect(screen.getByRole("button", { name: "Commenter" })).toBeDisabled();
  });

  it("edits an existing comment shown as formatted content", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    mocks.editCommentAction.mockResolvedValueOnce({ ok: true });
    render(
      <CommentComposer
        itemId="item-1"
        backlogKey="DEMO"
        users={USERS}
        mode="edit"
        commentId="comment-1"
        initialBody={"Voir `code` et @Alice"}
        initialMentionIds={["user-alice"]}
        onDone={onDone}
      />,
    );
    const editor = await screen.findByRole("textbox", { name: "Modifier le commentaire" });
    await waitFor(() => expect(within(editor).getByText("code").tagName).toBe("CODE"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(mocks.editCommentAction).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      id: "comment-1",
      body: "Voir `code` et @Alice",
      mentionIds: ["user-alice"],
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("shows the server error", async () => {
    const user = userEvent.setup();
    mocks.addCommentAction.mockResolvedValueOnce({ ok: false, error: "Commentaire refusé." });
    render(
      <CommentComposer itemId="item-1" backlogKey="DEMO" users={USERS} mode="create" initialBody="x" />,
    );
    await screen.findByRole("textbox", { name: "Nouveau commentaire" });
    await user.click(screen.getByRole("button", { name: "Commenter" }));
    expect(await screen.findByText("Commentaire refusé.")).toBeVisible();
  });
});
