import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { ItemDetailContent } from "@/components/items/item-detail-content";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  restoreItemAction: vi.fn(),
  softDeleteItemAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateItemAction: vi.fn(),
  getItemByKey: vi.fn(),
  getItemLabelIds: vi.fn(),
  listActivities: vi.fn(),
  listComments: vi.fn(),
  listLinksForItem: vi.fn(),
  listRefsForItem: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/CASS",
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/app/actions/items", () => ({
  restoreItemAction: mocks.restoreItemAction,
  softDeleteItemAction: mocks.softDeleteItemAction,
  updateItemAction: mocks.updateItemAction,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/lib/services/items", () => ({
  getItemByKey: mocks.getItemByKey,
  getItemLabelIds: mocks.getItemLabelIds,
  listActivities: mocks.listActivities,
}));

vi.mock("@/lib/services/comments", () => ({
  listComments: mocks.listComments,
}));

vi.mock("@/lib/services/links", () => ({
  listLinksForItem: mocks.listLinksForItem,
}));

vi.mock("@/lib/services/refs", () => ({
  listRefsForItem: mocks.listRefsForItem,
}));

const detail: Parameters<typeof ItemDetailPanel>[0]["detail"] = {
  id: "22222222-2222-4222-9222-222222222222",
  key: "CASS-2",
  type: "epic",
  kind: "feature",
  backlogId: "11111111-1111-4111-8111-111111111111",
  title: "Paiement en ligne",
  description: null,
  parentId: "33333333-3333-4333-8333-333333333333",
  statusId: "44444444-4444-4444-8444-444444444444",
  priority: 2,
  assigneeId: null,
  reporterId: "better-auth-marie",
  rank: "a1",
  path: "root.33333333333343338333333333333333.22222222222242229222222222222222",
  depth: 1,
  dueDate: null,
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  updatedAt: new Date("2026-08-02T10:00:00.000Z"),
  closedAt: null,
  deletedAt: null,
  search: "",
};

const baseProps = {
  detail,
  activities: [],
  comments: [],
  currentUserId: "better-auth-marie",
  itemLabelIds: [],
  backlogLabels: [],
  users: [
    { id: "better-auth-marie", name: "Marie Lemaire", email: "marie@example.test" },
  ],
  statuses: [
    {
      id: detail.statusId,
      name: "À faire",
      color: "#9aa0a6",
      category: "todo",
    },
  ],
  backlogKey: "CASS",
  links: [],
  candidates: [],
  refs: [],
};

function renderPanel(parent?: { key: string; title: string }) {
  return render(
    <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
      <ItemDetailPanel {...baseProps} parent={parent} />
    </ViewUrlStateProvider>,
  );
}

describe("ItemDetailPanel header", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.restoreItemAction.mockReset();
    mocks.softDeleteItemAction.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.updateItemAction.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState({}, "", "/b/CASS?view=board&item=CASS-2");
  });

  it("renders the parent and current keys as a breadcrumb", () => {
    renderPanel({ key: "PARENT-1", title: "Composant parent" });

    expect(screen.getByRole("navigation", { name: "Fil d’Ariane" })).toHaveTextContent(
      "PARENT-1 / CASS-2",
    );
  });

  it("renders only the current key when there is no parent", () => {
    renderPanel();

    const breadcrumb = screen.getByRole("navigation", { name: "Fil d’Ariane" });
    expect(breadcrumb).toHaveTextContent(/^CASS-2$/);
    expect(within(breadcrumb).queryByText("PARENT-1")).not.toBeInTheDocument();
  });

  it("copies the exact current href and confirms success", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    writeText.mockResolvedValueOnce(undefined);
    renderPanel({ key: "PARENT-1", title: "Composant parent" });
    const href = window.location.href;

    await user.click(screen.getByRole("button", { name: "Copier le lien" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(href));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Lien copié.");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("shows a safe error toast when clipboard writing fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    writeText.mockRejectedValueOnce(new Error("clipboard details"));
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Copier le lien" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Impossible de copier le lien."),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("ItemDetailContent parent resolution", () => {
  it("derives the parent breadcrumb from the items already loaded by the view", async () => {
    mocks.getItemByKey.mockResolvedValueOnce(detail);
    mocks.getItemLabelIds.mockResolvedValueOnce([]);
    mocks.listActivities.mockResolvedValueOnce([]);
    mocks.listComments.mockResolvedValueOnce([]);
    mocks.listLinksForItem.mockResolvedValueOnce([]);
    mocks.listRefsForItem.mockResolvedValueOnce([]);
    const parent = {
      ...detail,
      id: detail.parentId!,
      key: "PARENT-1",
      type: "composant" as const,
      title: "Composant parent",
      parentId: null,
      path: "root.33333333333343338333333333333333",
      depth: 0,
    };
    const content = await ItemDetailContent({
      itemKey: detail.key,
      backlog: {
        id: detail.backlogId,
        key: "CASS",
        name: "Caisse",
        color: "#475569",
        archivedAt: null,
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
      },
      users: baseProps.users,
      statuses: [
        {
          id: detail.statusId,
          name: "À faire",
          color: "#9aa0a6",
          category: "todo",
          order: 0,
        },
      ],
      labels: [],
      items: [parent, detail],
      currentUserId: "better-auth-marie",
    });

    render(
      <ViewUrlStateProvider initialEntries={[["item", detail.key]]}>
        {content}
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("navigation", { name: "Fil d’Ariane" })).toHaveTextContent(
      "PARENT-1 / CASS-2",
    );
  });
});
