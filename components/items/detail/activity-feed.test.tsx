import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "@/components/items/detail/activity-feed";
import type { CommentRow } from "@/lib/services/comments";
import type { ActivityFilter } from "@/lib/items/activity-feed";
import { SHORTCUTS_ENABLED_STORAGE_KEY } from "@/lib/shortcuts/preferences";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/comments", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
}));

afterEach(() => window.localStorage.clear());

const users = [
  { id: "marie", name: "Marie Lemaire" },
  { id: "paul", name: "Paul Martin" },
];

const comment: CommentRow = {
  id: "comment-1",
  authorId: "paul",
  authorName: "Paul Martin",
  body: "Je m’en occupe.",
  mentions: [],
  createdAt: new Date("2026-10-03T10:00:00Z"),
  editedAt: null,
  deletedAt: null,
  deleted: false,
};

function activity(
  id: string,
  at: string,
  action: string,
  field: string | null,
  oldValue: string | null,
  newValue: string | null,
) {
  return {
    id,
    itemId: "item-1",
    actorId: "marie",
    action,
    field,
    oldValue,
    newValue,
    at: new Date(at),
    requestCorrelationId: null,
  } as Parameters<typeof ActivityFeed>[0]["activities"][number];
}

const activities = [
  activity("a1", "2026-10-01T10:00:00Z", "create", null, null, "CASS-3"),
  activity("a2", "2026-10-02T10:00:00Z", "status_change", "status", "todo", "doing"),
  activity("a3", "2026-10-04T10:00:00Z", "update", "labels", "l1", "l2"),
];

const lookup = {
  status: (id: string) => ({ todo: "À faire", doing: "En cours" })[id],
  user: (id: string) => users.find((user) => user.id === id)?.name,
  label: (id: string) => ({ l1: "urgent", l2: "front" })[id],
  item: () => undefined,
};

function Harness({ canAdd = true }: { canAdd?: boolean }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  return (
    <ActivityFeed
      itemId="item-1"
      backlogKey="CASS"
      comments={[comment]}
      activities={activities}
      users={users}
      currentUserId="marie"
      capabilities={{ add: canAdd, editOwn: true, deleteOwn: true, deleteAll: false }}
      lookup={lookup}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}

function feedTexts() {
  return within(screen.getByRole("tabpanel"))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("ActivityFeed", () => {
  it("merges comments and history newest first, with old → new values", () => {
    render(<Harness />);
    const texts = feedTexts();
    expect(texts).toHaveLength(4);
    expect(texts[0]).toContain("a modifié les labels");
    expect(texts[0]).toContain("Ajouté : front");
    expect(texts[0]).toContain("Retiré : urgent");
    expect(texts[1]).toContain("Je m’en occupe.");
    expect(texts[2]).toContain("a changé le statut");
    expect(texts[2]).toContain("À faire");
    expect(texts[2]).toContain("En cours");
    expect(texts[3]).toContain("a créé l’item");
  });

  it("filters with the segmented control and sorts oldest first", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Commentaires" }));
    expect(screen.getByRole("tab", { name: "Commentaires" })).toHaveAttribute("aria-selected", "true");
    expect(feedTexts()).toHaveLength(1);

    await user.click(screen.getByRole("tab", { name: "Historique" }));
    expect(feedTexts().every((text) => !text.includes("Je m’en occupe."))).toBe(true);
    expect(screen.queryByRole("button", { name: "Commenter" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tout" }));
    await user.click(screen.getByRole("button", { name: "Trier : Plus récents" }));
    expect(screen.getByRole("button", { name: "Trier : Plus anciens" })).toBeVisible();
    expect(feedTexts()[0]).toContain("a créé l’item");
  });

  it("moves between filters with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Tout" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Commentaires" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Commentaires" })).toHaveAttribute("aria-selected", "true");
  });

  it("puts the composer on top with the M hint only when single-key shortcuts are on", async () => {
    const { unmount } = render(<Harness />);
    expect(await screen.findByRole("textbox", { name: "Nouveau commentaire" })).toBeVisible();
    expect(screen.getByText(/pour commenter/)).toBeVisible();
    unmount();

    window.localStorage.setItem(SHORTCUTS_ENABLED_STORAGE_KEY, "false");
    render(<Harness />);
    expect(screen.queryByText(/pour commenter/)).not.toBeInTheDocument();
  });

  it("has no composer without the comment right", () => {
    render(<Harness canAdd={false} />);
    expect(screen.queryByRole("button", { name: "Commenter" })).not.toBeInTheDocument();
  });
});
