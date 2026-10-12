import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentHref } from "@/test/history";
import { ItemBoard } from "@/components/items/item-board";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/app/actions/items", () => ({
  createItemAction: mocks.createItemAction,
  updateItemAction: mocks.updateItemAction,
}));

const readyStatus = {
  id: "ready",
  name: "Prêt",
  color: "#00a",
  category: "todo" as const,
  order: 0,
};

const createDialogProps = {
  backlogId: "backlog-id",
  items: [],
  statuses: [
    { id: "ready", name: "Prêt" },
    { id: "doing", name: "En cours" },
  ],
};

const editableCard = {
  id: "task-a",
  key: "DEMO-1",
  type: "tache" as const,
  title: "Authentication",
  statusId: "ready",
  priority: 2,
  rank: "a",
  assigneeId: null,
  parentId: "epic-a",
  componentId: "component-platform",
};

const activeSprint = {
  id: "sprint-active",
  name: "Sprint paiement",
  goal: "livrer le paiement invité",
  state: "active" as const,
  rank: "a0",
  capacityPoints: 13,
  plannedStartAt: new Date("2026-08-01T09:00:00.000Z"),
  plannedEndAt: new Date("2026-08-15T09:00:00.000Z"),
  startedAt: new Date("2026-08-01T09:00:00.000Z"),
  completedAt: null,
};
const activeMetrics = {
  itemCount: 2,
  estimatedPoints: 13,
  completedPoints: 5,
  remainingPoints: 8,
  unestimatedCount: 1,
  capacityPoints: 13,
  overCapacityPoints: 0,
  velocityComparison: null,
  commitmentBasis: null,
};

function renderBoard(board: React.ReactElement) {
  return render(
    <ViewUrlStateProvider initialEntries={[]}>{board}</ViewUrlStateProvider>,
  );
}

function renderEditableCard(moveItemAction = vi.fn()) {
  return renderBoard(
    <ItemBoard
      backlogKey="DEMO"
      items={[editableCard]}
      statuses={[readyStatus]}
      statusDomain={[readyStatus]}
      group={null}
      groupLabels={{}}
      moveItemAction={moveItemAction}
      createDialogProps={createDialogProps}
    />,
  );
}

describe("ItemBoard", () => {
  beforeEach(() => {
    mocks.createItemAction.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("identifies the active sprint and its execution metrics above the board", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        activeSprint={activeSprint}
        activeSprintMetrics={activeMetrics}
      />,
    );

    expect(screen.getByRole("heading", { name: "Sprint paiement" })).toBeVisible();
    expect(screen.getByText("Objectif : livrer le paiement invité")).toBeVisible();
    expect(screen.getByText("8 pts restants")).toBeVisible();
    expect(screen.getByText("5 pts terminés")).toBeVisible();
    expect(screen.getByText("1 non estimé")).toBeVisible();
    expect(screen.getByText("Authentication")).toBeVisible();
  });

  it("agrees the active sprint chips with French singular below two", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        activeSprint={activeSprint}
        activeSprintMetrics={{ ...activeMetrics, remainingPoints: 1, completedPoints: 0, unestimatedCount: 2 }}
      />,
    );

    expect(screen.getByText("1 pt restant")).toBeVisible();
    expect(screen.getByText("0 pt terminé")).toBeVisible();
    expect(screen.getByText("2 non estimés")).toBeVisible();
  });

  it("keeps cards compact when release data is present for upstream filtering", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[{
          ...editableCard,
          fixVersions: [{
            id: "release-2026-10",
            name: "VERSION-NE-DOIT-PAS-APPARAITRE",
            released: false,
            archived: false,
          }],
        }]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
      />,
    );

    expect(screen.getByText("Authentication")).toBeVisible();
    expect(screen.queryByText("VERSION-NE-DOIT-PAS-APPARAITRE")).not.toBeInTheDocument();
  });

  it("creates new board work directly in the active sprint", async () => {
    const user = userEvent.setup();
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={{
          ...createDialogProps,
          sprintId: activeSprint.id,
          contextLabel: activeSprint.name,
        }}
        activeSprint={activeSprint}
        activeSprintMetrics={activeMetrics}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Créer dans Prêt" }));

    expect(
      screen.getByRole("heading", { name: "Nouvelle tâche — Sprint paiement" }),
    ).toBeVisible();
  });

  it("shows a Backlog CTA and zero workflow columns when no sprint is active", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        activeSprint={null}
        activeSprintMetrics={null}
        backlogHref="/b/DEMO?view=backlog&q=paiement"
      />,
    );

    expect(screen.getByRole("heading", { name: "Aucun sprint actif" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir le Backlog" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=backlog&q=paiement",
    );
    expect(screen.queryByText("Prêt")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun item")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });

  it("offers item creation when the board has no rows", async () => {
    const user = userEvent.setup();
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        filtersActive={false}
        clearFiltersHref="/b/DEMO?view=board"
      />,
    );

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeInTheDocument();
    expect(
      screen.getByText("Créez votre premier item pour commencer à organiser ce backlog."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers a shareable filter reset when the board has no matches", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        filtersActive
        hasItems
        clearFiltersHref="/b/DEMO?view=board"
      />,
    );

    expect(screen.getByRole("heading", { name: "Aucun résultat" })).toBeInTheDocument();
    expect(screen.getByText("Aucun item ne correspond aux filtres actifs.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Effacer les filtres" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=board",
    );
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });

  it("keeps creation available when active filters belong to an empty backlog", async () => {
    const user = userEvent.setup();
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        filtersActive
        hasItems={false}
        clearFiltersHref="/b/DEMO?view=board"
      />,
    );

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Effacer les filtres" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("places cards in their component lane and uses the unassigned fallback lane", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[
          {
            id: "task-a",
            key: "DEMO-1",
            type: "tache",
            title: "Authentication",
            statusId: "ready",
            priority: 2,
            rank: "a",
            assigneeId: null,
            parentId: "epic-a",
            componentId: "component-platform",
          },
          {
            id: "task-b",
            key: "DEMO-2",
            type: "tache",
            title: "Invoices",
            statusId: "ready",
            priority: 2,
            rank: "b",
            assigneeId: null,
            parentId: "epic-b",
            componentId: "component-billing",
          },
          {
            id: "task-c",
            key: "DEMO-3",
            type: "tache",
            title: "Orphan task",
            statusId: "ready",
            priority: 2,
            rank: "c",
            assigneeId: null,
            parentId: null,
            componentId: null,
          },
        ]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group="component"
        groupLabels={{
          "component-platform": "Plateforme",
          "component-billing": "Facturation",
          none: "Sans composant",
        }}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
      />,
    );

    const platformLane = screen.getByText("Plateforme").parentElement!;
    const billingLane = screen.getByText("Facturation").parentElement!;
    const fallbackLane = screen.getByText("Sans composant").parentElement!;

    expect(within(platformLane).getByRole("button", { name: "DEMO-1 — Authentication" })).toBeInTheDocument();
    expect(within(billingLane).getByRole("button", { name: "DEMO-2 — Invoices" })).toBeInTheDocument();
    expect(within(fallbackLane).getByRole("button", { name: "DEMO-3 — Orphan task" })).toBeInTheDocument();
  });

  it("opens each column create dialog with that column status selected", async () => {
    const user = userEvent.setup();
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[
          readyStatus,
          { id: "doing", name: "En cours", color: "#fa0", category: "in_progress", order: 1 },
        ]}
        statusDomain={[
          readyStatus,
          { id: "doing", name: "En cours", color: "#fa0", category: "in_progress", order: 1 },
        ]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
      />,
    );

    expect(screen.getByRole("button", { name: "Créer dans Prêt" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Créer dans En cours" }));

    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("En cours");
  });

  it("maps UUID status metadata to canonical column-header icons", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[
          { ...editableCard, id: "todo", key: "DEMO-1", statusId: "11111111-1111-4111-8111-111111111111" },
          { ...editableCard, id: "doing", key: "DEMO-2", statusId: "22222222-2222-4222-8222-222222222222" },
          { ...editableCard, id: "review", key: "DEMO-3", statusId: "33333333-3333-4333-8333-333333333333" },
          { ...editableCard, id: "done", key: "DEMO-4", statusId: "44444444-4444-4444-8444-444444444444" },
        ]}
        statuses={[
          { id: "11111111-1111-4111-8111-111111111111", name: "À faire", color: "#999", category: "todo", order: 0 },
          { id: "22222222-2222-4222-8222-222222222222", name: "En cours", color: "#f90", category: "in_progress", order: 1 },
          { id: "33333333-3333-4333-8333-333333333333", name: "En revue", color: "#86f", category: "in_progress", order: 2 },
          { id: "44444444-4444-4444-8444-444444444444", name: "Terminé", color: "#3a7", category: "done", order: 3 },
        ]}
        statusDomain={[
          { id: "11111111-1111-4111-8111-111111111111", name: "À faire", color: "#999", category: "todo", order: 0 },
          { id: "22222222-2222-4222-8222-222222222222", name: "En cours", color: "#f90", category: "in_progress", order: 1 },
          { id: "33333333-3333-4333-8333-333333333333", name: "En revue", color: "#86f", category: "in_progress", order: 2 },
          { id: "44444444-4444-4444-8444-444444444444", name: "Terminé", color: "#3a7", category: "done", order: 3 },
        ]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
      />,
    );

    for (const label of ["À faire", "En cours", "En revue", "Terminé"]) {
      expect(screen.getAllByRole("img", { name: label })[0]).toBeVisible();
    }
  });

  it("keeps a filtered review column canonical using the complete status domain", () => {
    const statusDomain = [
      { id: "11111111-1111-4111-8111-111111111111", name: "À faire", color: "#999", category: "todo" as const, order: 0 },
      { id: "22222222-2222-4222-8222-222222222222", name: "En cours", color: "#f90", category: "in_progress" as const, order: 1 },
      { id: "33333333-3333-4333-8333-333333333333", name: "En revue", color: "#86f", category: "in_progress" as const, order: 2 },
      { id: "44444444-4444-4444-8444-444444444444", name: "Terminé", color: "#3a7", category: "done" as const, order: 3 },
    ];

    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[
          {
            ...editableCard,
            id: "review",
            key: "DEMO-3",
            statusId: statusDomain[2]!.id,
          },
        ]}
        statuses={[statusDomain[2]!]}
        statusDomain={statusDomain}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
      />,
    );

    expect(screen.getAllByRole("img", { name: "En revue" })[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Créer dans En revue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer dans En cours" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer dans À faire" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer dans Terminé" })).not.toBeInTheDocument();
  });

  it("updates priority without opening or dragging the card", async () => {
    const user = userEvent.setup();
    const moveItemAction = vi.fn();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    renderEditableCard(moveItemAction);

    const card = screen.getByRole("button", { name: "DEMO-1 — Authentication" });
    const priority = screen.getByRole("button", { name: /Priorité.*Moyenne/i });
    expect(card).not.toContainElement(priority);
    await user.click(priority);
    await user.click(screen.getByRole("menuitem", { name: "Haute" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "task-a",
      backlogKey: "DEMO",
      priority: 3,
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(moveItemAction).not.toHaveBeenCalled();
  });

  it("updates priority with Space and Enter without activating drag or opening the card", async () => {
    const user = userEvent.setup();
    const moveItemAction = vi.fn();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    renderEditableCard(moveItemAction);

    const priority = screen.getByRole("button", { name: /Priorité.*Moyenne/i });
    expect(priority.parentElement?.closest('[role="button"]')).toBeNull();
    priority.focus();
    await user.keyboard("[Space]");

    expect(screen.getAllByText("Authentication")).toHaveLength(1);
    const highPriority = screen.getByRole("menuitem", { name: "Haute" });
    highPriority.focus();
    await user.keyboard("[Enter]");

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "task-a",
      backlogKey: "DEMO",
      priority: 3,
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(moveItemAction).not.toHaveBeenCalled();
  });

  it("exposes a dedicated keyboard-focusable drag handle", () => {
    renderEditableCard();

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    expect(handle).toHaveFocus();
  });

  it("offers a direct status menu on every writable card", () => {
    renderEditableCard();

    expect(screen.getByRole("button", { name: "Statut : Prêt" })).toBeInTheDocument();
  });

  it("keeps edit, transition, schedule, and create affordances disjoint", () => {
    const base = {
      backlogKey: "DEMO",
      items: [editableCard],
      statuses: [readyStatus],
      statusDomain: [readyStatus],
      group: null,
      groupLabels: {},
      moveItemAction: vi.fn(),
      createDialogProps,
      canCreateItems: false,
      canEditItems: false,
      canTransitionItems: false,
      canScheduleItems: false,
    };

    const scheduled = renderBoard(
      <ItemBoard
        {...base}
        planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "Déplacer DEMO-1" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Statut :/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer dans Prêt" })).not.toBeInTheDocument();
    scheduled.unmount();

    const transitioned = renderBoard(<ItemBoard {...base} canTransitionItems />);
    expect(screen.queryByRole("button", { name: "Statut : Prêt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Déplacer DEMO-1" })).not.toBeInTheDocument();
    transitioned.unmount();

    const editedAndTransitioned = renderBoard(
      <ItemBoard {...base} canEditItems canTransitionItems />,
    );
    const statusControl = screen.getByRole("button", { name: "Statut : Prêt" });
    expect(statusControl).toBeVisible();
    expect(statusControl.parentElement?.parentElement).not.toHaveClass("md:hidden");
    expect(screen.queryByRole("button", { name: "Déplacer DEMO-1" })).not.toBeInTheDocument();
    editedAndTransitioned.unmount();

    const edited = renderBoard(<ItemBoard {...base} canEditItems />);
    expect(screen.getByRole("button", { name: /Priorité.*Moyenne/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Statut :/i })).not.toBeInTheDocument();
    edited.unmount();

    renderBoard(<ItemBoard {...base} canCreateItems />);
    expect(screen.getByRole("button", { name: "Créer dans Prêt" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Statut :/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Déplacer DEMO-1" })).not.toBeInTheDocument();
  });

  it("requires scheduling permission for sprint-context task creation", () => {
    const contextualCreateDialogProps = {
      ...createDialogProps,
      sprintId: activeSprint.id,
      contextLabel: activeSprint.name,
    };
    const createOnly = renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={contextualCreateDialogProps}
        canCreateItems
        canEditItems={false}
        canTransitionItems={false}
        canScheduleItems={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Créer dans Prêt" }))
      .not.toBeInTheDocument();
    createOnly.unmount();

    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={contextualCreateDialogProps}
        canCreateItems
        canEditItems={false}
        canTransitionItems={false}
        canScheduleItems
      />,
    );
    expect(screen.getByRole("button", { name: "Créer dans Prêt" })).toBeVisible();
  });

  it("keeps cards readable but hides every mutation affordance for viewers", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[editableCard]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        canCreateItems={false}
        canEditItems={false}
        canTransitionItems={false}
        canScheduleItems={false}
      />,
    );

    expect(screen.getByRole("button", { name: "DEMO-1 — Authentication" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Créer dans Prêt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Déplacer DEMO-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Statut :/i })).not.toBeInTheDocument();
  });

  it("does not offer creation to a viewer in an empty backlog", () => {
    renderBoard(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
        statuses={[readyStatus]}
        statusDomain={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
        canCreateItems={false}
        canEditItems={false}
        canTransitionItems={false}
        canScheduleItems={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });

  it("opens a card from its separate keyboard control", async () => {
    const user = userEvent.setup();
    const moveItemAction = vi.fn();
    renderEditableCard(moveItemAction);

    const openCard = screen.getByRole("button", { name: "DEMO-1 — Authentication" });
    openCard.focus();
    await user.keyboard("[Enter]");

    // Opening the drawer only updates the URL through the History API.
    expect(currentHref()).toBe("/b/DEMO?item=DEMO-1");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(moveItemAction).not.toHaveBeenCalled();

    mocks.push.mockClear();
    await user.click(screen.getByText("Authentication"));
    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?item=DEMO-1");
  });
});
