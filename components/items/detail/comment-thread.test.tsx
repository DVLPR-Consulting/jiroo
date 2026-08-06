import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentThread, type CommentRow } from "./comment-thread";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/comments", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
}));

describe("CommentThread", () => {
  it("highlights only recorded mentions while preserving inline code", () => {
    const comment: CommentRow = {
      id: "comment-1",
      authorId: "author-1",
      authorName: "Nina Laurent",
      body: "Bonjour @Alice Martin et @Bob. `@Alice Martin`",
      mentions: ["user-alice"],
      createdAt: new Date("2026-08-04T08:00:00Z"),
      editedAt: null,
      deletedAt: null,
      deleted: false,
    };

    const { container } = render(
      <CommentThread
        itemId="item-1"
        backlogKey="CASS"
        comments={[comment]}
        users={[
          { id: "user-alice", name: "Alice Martin" },
          { id: "user-bob", name: "Bob" },
        ]}
        currentUserId="viewer-1"
      />,
    );

    const highlights = container.querySelectorAll("mark");
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent("@Alice Martin");
    expect(screen.getByText("@Alice Martin", { selector: "code" })).not.toContainElement(
      highlights[0]!,
    );
    expect(highlights[0]).not.toHaveTextContent("@Bob");
  });

  it("renders comments without edit, delete, or compose controls for viewers", () => {
    const comment: CommentRow = {
      id: "comment-own",
      authorId: "viewer-1",
      authorName: "Nina Laurent",
      body: "Commentaire existant",
      mentions: [],
      createdAt: new Date("2026-08-04T08:00:00Z"),
      editedAt: null,
      deletedAt: null,
      deleted: false,
    };

    render(
      <CommentThread
        itemId="item-1"
        backlogKey="CASS"
        comments={[comment]}
        users={[]}
        currentUserId="viewer-1"
        capabilities={{ add: false, editOwn: false, deleteOwn: false, deleteAll: false }}
      />,
    );

    expect(screen.getByText("Commentaire existant")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("fails closed when a future consumer omits comment capabilities", () => {
    const comment: CommentRow = {
      id: "comment-own",
      authorId: "viewer-1",
      authorName: "Nina Laurent",
      body: "Commentaire existant",
      mentions: [],
      createdAt: new Date("2026-08-04T08:00:00Z"),
      editedAt: null,
      deletedAt: null,
      deleted: false,
    };

    render(
      <CommentThread
        itemId="item-1"
        backlogKey="CASS"
        comments={[comment]}
        users={[]}
        currentUserId="viewer-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("separates own-comment editing from delete-all moderation", () => {
    const own = {
      id: "comment-own",
      authorId: "actor-1",
      authorName: "Ada",
      body: "Mon commentaire",
      mentions: [],
      createdAt: new Date("2026-08-04T08:00:00Z"),
      editedAt: null,
      deletedAt: null,
      deleted: false,
    } satisfies CommentRow;
    const other = {
      ...own,
      id: "comment-other",
      authorId: "actor-2",
      authorName: "Grace",
      body: "Commentaire externe",
    } satisfies CommentRow;

    render(
      <CommentThread
        itemId="item-1"
        backlogKey="CASS"
        comments={[own, other]}
        users={[]}
        currentUserId="actor-1"
        capabilities={{ add: false, editOwn: true, deleteOwn: false, deleteAll: true }}
      />,
    );

    const ownComment = screen.getByRole("article", { name: "Commentaire de Ada" });
    expect(within(ownComment).getByRole("button", { name: "Modifier" })).toBeVisible();
    expect(within(ownComment).queryByRole("button", { name: "Supprimer" }))
      .not.toBeInTheDocument();
    const otherComment = screen.getByRole("article", { name: "Commentaire de Grace" });
    expect(within(otherComment).queryByRole("button", { name: "Modifier" }))
      .not.toBeInTheDocument();
    expect(within(otherComment).getByRole("button", { name: "Supprimer" })).toBeVisible();
  });
});
