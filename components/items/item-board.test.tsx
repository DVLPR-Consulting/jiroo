import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemBoard } from "@/components/items/item-board";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ItemBoard component swimlanes", () => {
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
        statuses={[{ id: "ready", name: "Prêt", color: "#00a", category: "todo" }]}
        group="component"
        groupLabels={{
          "component-platform": "Plateforme",
          "component-billing": "Facturation",
          none: "Sans composant",
        }}
        moveItemAction={vi.fn()}
      />,
    );

    const platformLane = screen.getByText("Plateforme").parentElement!;
    const billingLane = screen.getByText("Facturation").parentElement!;
    const fallbackLane = screen.getByText("Sans composant").parentElement!;

    expect(within(platformLane).getByRole("button", { name: "DEMO-1 — Authentication" })).toBeInTheDocument();
    expect(within(billingLane).getByRole("button", { name: "DEMO-2 — Invoices" })).toBeInTheDocument();
    expect(within(fallbackLane).getByRole("button", { name: "DEMO-3 — Orphan task" })).toBeInTheDocument();
  });
});
