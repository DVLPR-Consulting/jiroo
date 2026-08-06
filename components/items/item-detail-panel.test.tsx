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
  getItemByKeyForBacklog: vi.fn(),
  getItemLabelIds: vi.fn(),
  listActivities: vi.fn(),
  listComments: vi.fn(),
  listLinksForItem: vi.fn(),
  listRefsForItem: vi.fn(),
  listUsersByIds: vi.fn(),
  moveSprintItemAction: vi.fn(),
  reparentItemAction: vi.fn(),
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
  reparentItemAction: mocks.reparentItemAction,
}));

vi.mock("@/app/actions/sprints", () => ({
  moveSprintItemAction: mocks.moveSprintItemAction,
}));

vi.mock("@/app/actions/comments", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
}));

vi.mock("@/app/actions/labels", () => ({
  createLabelAction: vi.fn(),
}));

vi.mock("@/app/actions/links", () => ({
  addLinkAction: vi.fn(),
  removeLinkAction: vi.fn(),
}));

vi.mock("@/app/actions/refs", () => ({
  addRefAction: vi.fn(),
  removeRefAction: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/lib/services/items", () => ({
  getItemByKeyForBacklog: mocks.getItemByKeyForBacklog,
  getItemLabelIds: mocks.getItemLabelIds,
  listActivities: mocks.listActivities,
  listUsersByIds: mocks.listUsersByIds,
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
  estimatePoints: null,
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
    { id: "better-auth-marie", name: "Marie Lemaire" },
  ],
  assigneeCandidates: [
    { id: "better-auth-marie", name: "Marie Lemaire" },
  ],
  reporterCandidates: [
    { id: "better-auth-marie", name: "Marie Lemaire" },
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

function renderPanel(
  parent?: { key: string; title: string },
  detailOverride = detail,
  canEditItems = true,
) {
  return render(
    <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
      <ItemDetailPanel
        {...baseProps}
        detail={detailOverride}
        parent={parent}
        canEditItems={canEditItems}
        canTransitionItems={canEditItems}
        canAssignItems={canEditItems}
      />
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
    mocks.moveSprintItemAction.mockReset();
    mocks.reparentItemAction.mockReset();
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

  it("shows story points only for tasks", () => {
    const { rerender } = renderPanel();
    expect(screen.queryByText("Points")).not.toBeInTheDocument();

    rerender(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache", estimatePoints: 5 }}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByText("Points")).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(5);
  });

  it("renders task points as text for a viewer", () => {
    renderPanel(undefined, { ...detail, type: "tache", estimatePoints: 5 }, false);

    expect(screen.getByText("Points")).toBeVisible();
    expect(screen.getByText("5 pts")).toBeVisible();
    expect(screen.queryByRole("spinbutton", { name: "Points" })).not.toBeInTheDocument();
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

  it("names the detail as a dialog and closes through Escape", async () => {
    const user = userEvent.setup();
    const returnTarget = document.createElement("button");
    returnTarget.textContent = "Item déclencheur";
    document.body.append(returnTarget);
    returnTarget.focus();
    const rendered = renderPanel();

    const dialog = screen.getByRole("dialog", {
      name: `${detail.key} — ${detail.title}`,
    });
    expect(dialog).toBeVisible();
    await user.keyboard("{Escape}");

    expect(mocks.push).toHaveBeenCalled();
    expect(dialog).not.toBeInTheDocument();
    expect(returnTarget).toHaveFocus();
    rendered.unmount();
    returnTarget.remove();
  });

  it("uses a single-column mobile-first grid and a desktop side column", () => {
    renderPanel();

    expect(
      screen.getByRole("dialog", { name: `${detail.key} — ${detail.title}` }),
    ).toHaveClass("w-screen");
    expect(screen.getByTestId("item-detail-grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-[1fr_220px]",
    );
  });

  it("cancels title editing with Escape without closing the detail dialog", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: `Renommer ${detail.key}` }));
    expect(screen.getByRole("textbox", { name: "Titre de l’item" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("dialog", { name: `${detail.key} — ${detail.title}` }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Titre de l’item" }))
      .not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps item details readable while hiding viewer mutation affordances", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          canEditItems={false}
          canTransitionItems={false}
          canAssignItems={false}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("heading", { name: detail.title })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter le lien" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Commentaires" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("requires edit plus the exact status or assignee capability", () => {
    const denied = {
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
    } as const;

    const edited = render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canEditItems />
      </ViewUrlStateProvider>,
    );
    expect(screen.getByRole("button", { name: `Renommer ${detail.key}` })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Priorité" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Statut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Assigné" })).not.toBeInTheDocument();
    edited.unmount();

    const transitioned = render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canTransitionItems />
      </ViewUrlStateProvider>,
    );
    expect(screen.queryByRole("combobox", { name: "Statut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Renommer ${detail.key}` })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Assigné" })).not.toBeInTheDocument();
    transitioned.unmount();

    const editedAndTransitioned = render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          {...denied}
          canEditItems
          canTransitionItems
        />
      </ViewUrlStateProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Statut" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assigné" })).not.toBeInTheDocument();
    editedAndTransitioned.unmount();

    const assigned = render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canAssignItems />
      </ViewUrlStateProvider>,
    );
    expect(screen.queryByRole("combobox", { name: "Assigné" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Statut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();
    assigned.unmount();

    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          {...denied}
          canEditItems
          canAssignItems
        />
      </ViewUrlStateProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Assigné" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Statut" })).not.toBeInTheDocument();
  });

  it("renders current assignee and reporter identities as disabled non-candidate options", () => {
    const currentAssignee = { id: "former-assignee", name: "Ancienne assignée" };
    const currentReporter = { id: "former-reporter", name: "Ancien rapporteur" };
    const assignable = { id: "assignable-user", name: "Candidate assignable" };
    const reporterCandidate = { id: "reporter-candidate", name: "Rapporteuse candidate" };

    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{
            ...detail,
            assigneeId: currentAssignee.id,
            reporterId: currentReporter.id,
          }}
          users={[currentAssignee, currentReporter]}
          assigneeCandidates={[assignable]}
          reporterCandidates={[reporterCandidate]}
          canEditItems
          canAssignItems
        />
      </ViewUrlStateProvider>,
    );

    const assigneeSelect = screen.getByRole("combobox", { name: "Assigné" });
    expect(assigneeSelect).toHaveValue(currentAssignee.id);
    expect(
      within(assigneeSelect).getByRole("option", { name: currentAssignee.name }),
    ).toBeDisabled();
    expect(
      within(assigneeSelect).getByRole("option", { name: assignable.name }),
    ).toBeEnabled();

    const reporterSelect = screen.getByRole("combobox", { name: "Rapporteur" });
    expect(reporterSelect).toHaveValue(currentReporter.id);
    expect(
      within(reporterSelect).getByRole("option", { name: currentReporter.name }),
    ).toBeDisabled();
    expect(
      within(reporterSelect).getByRole("option", { name: reporterCandidate.name }),
    ).toBeEnabled();
  });

  it("grants delete, comments, and links independently from ordinary editing", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          canEditItems={false}
          canTransitionItems={false}
          canAssignItems={false}
          itemCapabilities={{
            create: false,
            edit: false,
            transition: false,
            assign: false,
            delete: true,
            restore: false,
            addComments: true,
            editOwnComments: false,
            deleteOwnComments: false,
            deleteAllComments: false,
            link: true,
          }}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("button", { name: "Actions" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ajouter le lien" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeVisible();
    expect(screen.queryByRole("button", { name: `Renommer ${detail.key}` }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Commentaires" }));
    expect(screen.getByRole("textbox", { name: "Nouveau commentaire" })).toBeVisible();
  });

  it("lets a scheduler change parent and sprint without editing ordinary fields", async () => {
    const user = userEvent.setup();
    mocks.reparentItemAction.mockResolvedValue({ ok: true });
    mocks.moveSprintItemAction.mockResolvedValue({ ok: true });
    const taskDetail = { ...detail, type: "tache" as const };
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={taskDetail}
          parent={{ key: "CASS-1", title: "Epic initial" }}
          candidates={[
            { id: detail.parentId!, key: "CASS-1", title: "Epic initial", type: "epic" },
            { id: "55555555-5555-4555-8555-555555555555", key: "CASS-3", title: "Epic cible", type: "epic" },
          ]}
          sprints={[
            { id: "66666666-6666-4666-8666-666666666666", name: "Sprint actif" },
          ]}
          sprintId={null}
          canEditItems={false}
          canTransitionItems={false}
          canAssignItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.queryByRole("button", { name: `Renommer ${detail.key}` }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Parent" }), "55555555-5555-4555-8555-555555555555");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sprint" }), "66666666-6666-4666-8666-666666666666");

    await waitFor(() => expect(mocks.reparentItemAction).toHaveBeenCalledWith({
      backlogKey: "CASS",
      id: detail.id,
      newParentId: "55555555-5555-4555-8555-555555555555",
    }));
    await waitFor(() => expect(mocks.moveSprintItemAction).toHaveBeenCalledWith({
      backlogKey: "CASS",
      backlogId: detail.backlogId,
      itemId: detail.id,
      sprintId: "66666666-6666-4666-8666-666666666666",
      beforeId: null,
      afterId: null,
    }));
  });

  it("rolls back an optimistic planning change and exposes the safe error", async () => {
    const user = userEvent.setup();
    let resolveAction!: (result: { ok: false; error: string }) => void;
    mocks.reparentItemAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache" }}
          parent={{ key: "CASS-1", title: "Epic initial" }}
          candidates={[
            { id: detail.parentId!, key: "CASS-1", title: "Epic initial", type: "epic" },
            { id: "55555555-5555-4555-8555-555555555555", key: "CASS-3", title: "Epic cible", type: "epic" },
          ]}
          canEditItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </ViewUrlStateProvider>,
    );

    const parentSelect = screen.getByRole("combobox", { name: "Parent" });
    await user.selectOptions(parentSelect, "55555555-5555-4555-8555-555555555555");
    expect(parentSelect).toHaveValue("55555555-5555-4555-8555-555555555555");
    resolveAction({ ok: false, error: "Planification interdite." });

    await waitFor(() => expect(parentSelect).toHaveValue(detail.parentId));
    expect(screen.getByRole("alert")).toHaveTextContent("Planification interdite.");
    expect(mocks.toastError).toHaveBeenCalledWith("Planification interdite.");
  });

  it("rolls back the parent and exposes a safe error when reparenting rejects", async () => {
    const user = userEvent.setup();
    mocks.reparentItemAction.mockRejectedValueOnce(new Error("internal parent details"));
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache" }}
          parent={{ key: "CASS-1", title: "Epic initial" }}
          candidates={[
            { id: detail.parentId!, key: "CASS-1", title: "Epic initial", type: "epic" },
            { id: "55555555-5555-4555-8555-555555555555", key: "CASS-3", title: "Epic cible", type: "epic" },
          ]}
          canEditItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </ViewUrlStateProvider>,
    );

    const parentSelect = screen.getByRole("combobox", { name: "Parent" });
    await user.selectOptions(parentSelect, "55555555-5555-4555-8555-555555555555");

    await waitFor(() => expect(parentSelect).toHaveValue(detail.parentId));
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de modifier la planification.");
    expect(mocks.toastError).toHaveBeenCalledWith("Impossible de modifier la planification.");
  });

  it("rolls back the sprint and exposes a safe error when sprint assignment rejects", async () => {
    const user = userEvent.setup();
    mocks.moveSprintItemAction.mockRejectedValueOnce(new Error("internal sprint details"));
    const initialSprintId = "66666666-6666-4666-8666-666666666666";
    const targetSprintId = "77777777-7777-4777-8777-777777777777";
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache" }}
          sprints={[
            { id: initialSprintId, name: "Sprint initial" },
            { id: targetSprintId, name: "Sprint cible" },
          ]}
          sprintId={initialSprintId}
          canEditItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </ViewUrlStateProvider>,
    );

    const sprintSelect = screen.getByRole("combobox", { name: "Sprint" });
    await user.selectOptions(sprintSelect, targetSprintId);

    await waitFor(() => expect(sprintSelect).toHaveValue(initialSprintId));
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de modifier la planification.");
    expect(mocks.toastError).toHaveBeenCalledWith("Impossible de modifier la planification.");
  });
});

describe("ItemDetailContent parent resolution", () => {
  it("derives the parent breadcrumb from the items already loaded by the view", async () => {
    mocks.getItemByKeyForBacklog.mockResolvedValueOnce(detail);
    mocks.getItemLabelIds.mockResolvedValueOnce([]);
    mocks.listActivities.mockResolvedValueOnce([]);
    mocks.listComments.mockResolvedValueOnce([]);
    mocks.listLinksForItem.mockResolvedValueOnce([]);
    mocks.listRefsForItem.mockResolvedValueOnce([]);
    mocks.listUsersByIds.mockResolvedValueOnce(baseProps.users);
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
      },
      users: baseProps.users,
      assigneeCandidates: baseProps.assigneeCandidates,
      reporterCandidates: baseProps.reporterCandidates,
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

    expect(mocks.getItemByKeyForBacklog).toHaveBeenCalledWith(
      detail.key,
      detail.backlogId,
    );
    expect(screen.getByRole("navigation", { name: "Fil d’Ariane" })).toHaveTextContent(
      "PARENT-1 / CASS-2",
    );
  });
});
