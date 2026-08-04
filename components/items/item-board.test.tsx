import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemBoard } from "@/components/items/item-board";

const mocks = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
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

function renderEditableCard(moveItemAction = vi.fn()) {
  return render(
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
    mocks.updateItemAction.mockReset();
  });

  it("places cards in their component lane and uses the unassigned fallback lane", () => {
    render(
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
    render(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
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

    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("doing");
  });

  it("maps UUID status metadata to canonical column-header icons", () => {
    render(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
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
      expect(screen.getByRole("img", { name: label })).toBeVisible();
    }
  });

  it("keeps a filtered review column canonical using the complete status domain", () => {
    const statusDomain = [
      { id: "11111111-1111-4111-8111-111111111111", name: "À faire", color: "#999", category: "todo" as const, order: 0 },
      { id: "22222222-2222-4222-8222-222222222222", name: "En cours", color: "#f90", category: "in_progress" as const, order: 1 },
      { id: "33333333-3333-4333-8333-333333333333", name: "En revue", color: "#86f", category: "in_progress" as const, order: 2 },
      { id: "44444444-4444-4444-8444-444444444444", name: "Terminé", color: "#3a7", category: "done" as const, order: 3 },
    ];

    render(
      <ItemBoard
        backlogKey="DEMO"
        items={[]}
        statuses={[statusDomain[2]!]}
        statusDomain={statusDomain}
        group={null}
        groupLabels={{}}
        moveItemAction={vi.fn()}
        createDialogProps={createDialogProps}
      />,
    );

    expect(screen.getByRole("img", { name: "En revue" })).toBeVisible();
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

  it("opens a card from its separate keyboard control", async () => {
    const user = userEvent.setup();
    const moveItemAction = vi.fn();
    renderEditableCard(moveItemAction);

    const openCard = screen.getByRole("button", { name: "DEMO-1 — Authentication" });
    openCard.focus();
    await user.keyboard("[Enter]");

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?item=DEMO-1");
    expect(moveItemAction).not.toHaveBeenCalled();

    mocks.push.mockClear();
    await user.click(screen.getByText("Authentication"));
    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?item=DEMO-1");
  });
});
