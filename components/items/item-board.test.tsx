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

const readyStatus = { id: "ready", name: "Prêt", color: "#00a", category: "todo" };

const createDialogProps = {
  backlogId: "backlog-id",
  items: [],
  statuses: [
    { id: "ready", name: "Prêt" },
    { id: "doing", name: "En cours" },
  ],
};

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
          { id: "doing", name: "En cours", color: "#fa0", category: "in_progress" },
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

  it("updates priority without opening or dragging the card", async () => {
    const user = userEvent.setup();
    const moveItemAction = vi.fn();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
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
        ]}
        statuses={[readyStatus]}
        group={null}
        groupLabels={{}}
        moveItemAction={moveItemAction}
        createDialogProps={createDialogProps}
      />,
    );

    const card = screen.getByRole("button", { name: "DEMO-1 — Authentication" });
    await user.click(within(card).getByRole("button", { name: /Priorité.*Moyenne/i }));
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
});
