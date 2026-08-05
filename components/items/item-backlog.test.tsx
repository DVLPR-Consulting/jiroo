import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ItemBacklog,
  type BacklogItem,
} from "@/components/items/item-backlog";

const mocks = vi.hoisted(() => ({
  bulkUpdateItemsAction: vi.fn(),
  push: vi.fn(),
  rankBacklogItemAction: vi.fn(),
  refresh: vi.fn(),
  moveSprintItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/shell/view-url-state", () => ({
  useViewUrlState: () => ({ push: mocks.push }),
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: mocks.bulkUpdateItemsAction,
  rankBacklogItemAction: mocks.rankBacklogItemAction,
  updateItemAction: vi.fn(),
}));
vi.mock("@/app/actions/sprints", () => ({
  moveSprintItemAction: mocks.moveSprintItemAction,
  reorderSprintAction: vi.fn(),
}));

const todoId = "11111111-1111-4111-8111-111111111111";
const doingId = "22222222-2222-4222-8222-222222222222";

const statuses = [
  {
    id: todoId,
    name: "À faire",
    color: "#9aa0a6",
    category: "todo" as const,
    order: 0,
  },
  {
    id: doingId,
    name: "En cours",
    color: "#d99a2b",
    category: "in_progress" as const,
    order: 1,
  },
];

const users = [
  { id: "marie", name: "Marie Lemaire" },
  { id: "nora", name: "Nora Benali" },
];

function task(
  id: string,
  key: string,
  title: string,
  overrides: Partial<BacklogItem> = {},
): BacklogItem {
  return {
    id,
    key,
    title,
    type: "tache",
    kind: "feature",
    statusId: todoId,
    priority: 2,
    estimatePoints: null,
    assigneeId: "marie",
    assigneeName: "Marie Lemaire",
    rank: "a0",
    blocked: false,
    ...overrides,
  };
}

const items = [
  task("item-1", "DEMO-1", "Authentification", {
    rank: "a0",
    priority: 4,
    estimatePoints: 3,
  }),
  task("item-2", "DEMO-2", "Session", {
    rank: "b0",
    statusId: doingId,
    priority: 2,
    estimatePoints: 5,
    assigneeId: "nora",
    assigneeName: "Nora Benali",
  }),
  task("item-3", "DEMO-3", "Déconnexion", {
    rank: "c0",
    priority: 1,
    assigneeId: null,
    assigneeName: null,
  }),
];

function props(): React.ComponentProps<typeof ItemBacklog> {
  return {
    groups: [{ key: "", label: "", items }],
    grouped: false,
    statuses,
    users,
    backlogKey: "DEMO",
    backlogId: "11111111-1111-4111-8111-111111111111",
    manualOrder: true,
    rankItemAction: mocks.rankBacklogItemAction,
    filtersActive: false,
    hasItems: true,
    clearFiltersHref: "/b/DEMO?view=backlog",
    canWrite: true,
  };
}

function sprintProps(): React.ComponentProps<typeof ItemBacklog> {
  const active = {
    id: "sprint-active",
    name: "Sprint actif",
    goal: "Livrer l’authentification",
    state: "active" as const,
    rank: "a0",
    capacityPoints: 8,
    plannedStartAt: new Date("2026-08-01T09:00:00.000Z"),
    plannedEndAt: new Date("2026-08-15T09:00:00.000Z"),
    startedAt: new Date("2026-08-01T09:00:00.000Z"),
    completedAt: null,
  };
  const future = {
    ...active,
    id: "sprint-future",
    name: "Sprint futur",
    goal: null,
    state: "planned" as const,
    rank: "b0",
    startedAt: null,
  };
  return {
    sections: [
      {
        id: active.id,
        kind: "active" as const,
        sprint: active,
        metrics: {
          itemCount: 1,
          estimatedPoints: 3,
          completedPoints: 0,
          remainingPoints: 3,
          unestimatedCount: 0,
          capacityPoints: 8,
          overCapacityPoints: 0,
        },
        items: [items[0]!],
        groups: [{ key: "", label: "", items: [items[0]!] }],
      },
      {
        id: future.id,
        kind: "planned" as const,
        sprint: future,
        metrics: {
          itemCount: 1,
          estimatedPoints: 5,
          completedPoints: 0,
          remainingPoints: 5,
          unestimatedCount: 0,
          capacityPoints: 8,
          overCapacityPoints: 0,
        },
        items: [items[1]!],
        groups: [{ key: "", label: "", items: [items[1]!] }],
      },
      {
        id: "backlog",
        kind: "backlog" as const,
        sprint: null,
        metrics: {
          itemCount: 1,
          estimatedPoints: 0,
          completedPoints: 0,
          remainingPoints: 0,
          unestimatedCount: 1,
          capacityPoints: null,
          overCapacityPoints: 0,
        },
        items: [items[2]!],
        groups: [{ key: "", label: "", items: [items[2]!] }],
      },
    ],
    sprints: [active, future],
    grouped: false,
    statuses,
    users,
    backlogKey: "DEMO",
    backlogId: "11111111-1111-4111-8111-111111111111",
    manualOrder: true,
    rankItemAction: mocks.rankBacklogItemAction,
    moveSprintItemAction: mocks.moveSprintItemAction,
    filtersActive: false,
    hasItems: true,
    clearFiltersHref: "/b/DEMO?view=backlog",
    canWrite: true,
  };
}

function mockBacklogGeometry() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function getBacklogRect(this: HTMLElement) {
      const labelledRow = this.closest("tr[aria-label]") as HTMLElement | null;
      const row = labelledRow ?? (this.matches("tr[aria-label]") ? this : null);
      const key = row?.getAttribute("aria-label")?.split(" — ")[0];
      const index = key ? ["DEMO-1", "DEMO-2", "DEMO-3"].indexOf(key) : 0;
      const top = Math.max(index, 0) * 40;
      return {
        x: 0,
        y: top,
        width: 800,
        height: 40,
        top,
        right: 800,
        bottom: top + 40,
        left: 0,
        toJSON: () => undefined,
      };
    });
}

describe("ItemBacklog", () => {
  beforeEach(() => {
    mocks.bulkUpdateItemsAction.mockReset();
    mocks.push.mockReset();
    mocks.rankBacklogItemAction.mockReset();
    mocks.refresh.mockReset();
    mocks.moveSprintItemAction.mockReset();
  });

  it("renders active, planned, and unscheduled sections in Jira planning order", () => {
    render(<ItemBacklog {...sprintProps()} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent))
      .toEqual(["Sprint actif", "Sprint futur", "Backlog"]);
    expect(screen.getAllByRole("row", { name: /DEMO-/ }).map((row) => row.getAttribute("aria-label")))
      .toEqual([
        "DEMO-1 — Authentification",
        "DEMO-2 — Session",
        "DEMO-3 — Déconnexion",
      ]);
  });

  it("renders a task added to an existing sprint after server props refresh", async () => {
    const next = sprintProps();
    if (!("sections" in next)) throw new Error("Sections de sprint attendues.");
    const withoutFutureSprint = {
      ...next,
      sections: next.sections.filter((section) => section.id !== "sprint-future"),
    };
    const { rerender } = render(<ItemBacklog {...withoutFutureSprint} />);
    expect(screen.queryByRole("row", { name: "DEMO-2 — Session" }))
      .not.toBeInTheDocument();

    rerender(<ItemBacklog {...next} />);

    expect(
      await screen.findByRole("row", { name: "DEMO-2 — Session" }),
    ).toBeVisible();
  });

  it("removes hidden selections when a sprint section is collapsed", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...sprintProps()} />);
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    expect(screen.getByText("1 item sélectionné")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Replier Sprint actif" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Actions groupées" }))
        .not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("row", { name: "DEMO-1 — Authentification" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("3 / 8 pt")).toBeVisible();
  });

  it("moves a task across sprint sections with target-section neighbors", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    mocks.moveSprintItemAction.mockResolvedValueOnce({
      ok: true,
      item: { ...items[0], rank: "aV" },
    });
    render(<ItemBacklog {...sprintProps()} />);

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    await user.keyboard("[Space][ArrowDown][Space]");

    await waitFor(() =>
      expect(mocks.moveSprintItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId: "11111111-1111-4111-8111-111111111111",
        itemId: "item-1",
        sprintId: "sprint-future",
        beforeId: null,
        afterId: "item-2",
      }),
    );
    expect(mocks.rankBacklogItemAction).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    geometry.mockRestore();
  });

  it("keeps the global Backlog selection name and contextualizes sprint headers", () => {
    render(<ItemBacklog {...sprintProps()} />);

    expect(
      screen.getByRole("checkbox", { name: "Sélectionner toutes les tâches visibles" }),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "Sélectionner toutes les tâches de Sprint actif" }),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "Sélectionner toutes les tâches de Sprint futur" }),
    ).toBeVisible();
  });

  it("restores section, aggregates, selection, and focus after a rejected cross-section move", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    mocks.moveSprintItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Le voisin n’appartient pas à la section cible.",
    });
    const { container } = render(<ItemBacklog {...sprintProps()} />);
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    await user.keyboard("[Space][ArrowDown][Space]");

    expect(await screen.findByRole("alert")).toHaveTextContent("Planification impossible.");
    const activeSection = container.querySelector('[data-sprint-section="sprint-active"]')!;
    const futureSection = container.querySelector('[data-sprint-section="sprint-future"]')!;
    expect(within(activeSection as HTMLElement).getByRole("row", { name: "DEMO-1 — Authentification" }))
      .toBeVisible();
    expect(within(futureSection as HTMLElement).queryByRole("row", { name: "DEMO-1 — Authentification" }))
      .not.toBeInTheDocument();
    expect(within(activeSection as HTMLElement).getByText("3 / 8 pt")).toBeVisible();
    expect(within(futureSection as HTMLElement).getByText("5 / 8 pt")).toBeVisible();
    expect(screen.getByText("1 item sélectionné")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Déplacer DEMO-1" })).toHaveFocus(),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    geometry.mockRestore();
  });

  it("summarizes visible work and keeps the supplied rank order", () => {
    render(<ItemBacklog {...props()} />);

    expect(screen.getByRole("heading", { name: "Backlog" })).toBeVisible();
    expect(screen.getByText("3 items")).toBeVisible();
    expect(screen.getByText("8 points")).toBeVisible();
    expect(screen.getByText("1 non estimé")).toBeVisible();
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.getAttribute("aria-label")),
    ).toEqual([
      "DEMO-1 — Authentification",
      "DEMO-2 — Session",
      "DEMO-3 — Déconnexion",
    ]);
  });

  it("shows the compact planning fields on every row", () => {
    render(<ItemBacklog {...props()} />);

    const first = screen.getByRole("row", {
      name: "DEMO-1 — Authentification",
    });
    expect(within(first).getByText("À faire")).toBeVisible();
    expect(within(first).getByText("Urgent")).toBeVisible();
    expect(within(first).getByText("3 pt")).toBeVisible();
    expect(within(first).getByText("Marie Lemaire")).toBeVisible();

    const second = screen.getByRole("row", { name: "DEMO-2 — Session" });
    expect(within(second).getByText("En cours")).toBeVisible();
    expect(within(second).getByText("Nora Benali")).toBeVisible();

    const third = screen.getByRole("row", { name: "DEMO-3 — Déconnexion" });
    expect(within(third).getByText("Non estimé")).toBeVisible();
    expect(within(third).getByText("Non assigné")).toBeVisible();
  });

  it("keeps viewer rows readable without edit or drag controls", () => {
    render(<ItemBacklog {...props()} canWrite={false} />);

    const first = screen.getByRole("row", {
      name: "DEMO-1 — Authentification",
    });
    expect(within(first).getByText("À faire")).toBeVisible();
    expect(within(first).getByText("Urgent")).toBeVisible();
    expect(within(first).getByText("Marie Lemaire")).toBeVisible();
    expect(within(first).queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Déplacer DEMO-/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("selects one row, extends a range and exposes an indeterminate header", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...props()} />);

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    const header = screen.getByRole("checkbox", { name: "Sélectionner toutes les tâches visibles" });
    expect(header).toBePartiallyChecked();
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-3" }));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("3 items sélectionnés")).toBeVisible();
    expect(header).toBeChecked();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("selects all through the header and clears with the explicit control", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...props()} />);

    const header = screen.getByRole("checkbox", { name: "Sélectionner toutes les tâches visibles" });
    await user.click(header);
    expect(screen.getByText("3 items sélectionnés")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Effacer la sélection" }));

    expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument();
    expect(header).not.toBeChecked();
  });

  it("guards the select-all shortcut and clears selection with Escape", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...props()} />);

    const firstRow = screen.getByRole("row", { name: "DEMO-1 — Authentification" });
    firstRow.focus();
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.getByText("3 items sélectionnés")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument();

    const estimate = within(firstRow).getByRole("button", { name: "Estimation : 3 pt" });
    estimate.focus();
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument();
  });

  it("reconciles selection when filtering removes a selected row", async () => {
    const user = userEvent.setup();
    const input = props();
    const { rerender } = render(<ItemBacklog {...input} />);

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-3" }));
    expect(screen.getByText("1 item sélectionné")).toBeVisible();

    rerender(
      <ItemBacklog
        {...input}
        groups={[{ key: "", label: "", items: items.slice(0, 2) }]}
        filtersActive
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument(),
    );
  });

  it("exposes one labelled drag handle per writable row", () => {
    render(<ItemBacklog {...props()} />);

    expect(
      screen.getAllByRole("button", { name: /Déplacer DEMO-/ }),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "Déplacer DEMO-1" }),
    ).toBeVisible();
  });

  it("moves a row with the keyboard and submits server-derived neighbors", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    mocks.rankBacklogItemAction.mockResolvedValueOnce({
      ok: true,
      item: { ...items[0], rank: "bV" },
    });
    render(<ItemBacklog {...props()} />);

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    await user.keyboard("[Space][ArrowDown][Space]");

    await waitFor(() =>
      expect(mocks.rankBacklogItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId: "11111111-1111-4111-8111-111111111111",
        id: "item-1",
        beforeId: "item-2",
        afterId: "item-3",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    geometry.mockRestore();
  });

  it("cancels a keyboard drag without submitting or changing order", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    render(<ItemBacklog {...props()} />);

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    await user.keyboard("[Space][ArrowDown][Escape]");

    expect(mocks.rankBacklogItemAction).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("row")
        .filter((row) => row.hasAttribute("aria-label"))
        .map((row) => row.getAttribute("aria-label")),
    ).toEqual([
      "DEMO-1 — Authentification",
      "DEMO-2 — Session",
      "DEMO-3 — Déconnexion",
    ]);
    geometry.mockRestore();
  });

  it("blocks a second ranking while the first request is pending", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    let resolveRank!: (value: { ok: true; item: BacklogItem }) => void;
    mocks.rankBacklogItemAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRank = resolve;
        }),
    );
    render(<ItemBacklog {...props()} />);

    const firstHandle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    firstHandle.focus();
    await user.keyboard("[Space][ArrowDown][Space]");
    await waitFor(() => expect(mocks.rankBacklogItemAction).toHaveBeenCalledOnce());
    for (const handle of screen.getAllByRole("button", { name: /Déplacer DEMO-/ })) {
      expect(handle).toBeDisabled();
    }

    resolveRank({ ok: true, item: { ...items[0]!, rank: "bV" } });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.rankBacklogItemAction).toHaveBeenCalledOnce();
    geometry.mockRestore();
  });

  it("rolls back a rejected rank, restores focus and announces the failure", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    mocks.rankBacklogItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Voisin invalide pour ce backlog.",
    });
    render(<ItemBacklog {...props()} />);

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    await user.keyboard("[Space][ArrowDown][Space]");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Classement impossible.",
    );
    expect(
      screen.getByRole("button", { name: "Déplacer DEMO-1" }),
    ).toHaveFocus();
    expect(mocks.refresh).not.toHaveBeenCalled();
    geometry.mockRestore();
  });

  it("disables manual ranking when a sort or group is active", () => {
    render(<ItemBacklog {...props()} manualOrder={false} />);

    expect(
      screen.queryByRole("button", { name: /Déplacer DEMO-/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Effacez le tri ou le groupement pour modifier l’ordre manuel.",
      ),
    ).toBeVisible();
  });

  it("distinguishes an empty backlog from an empty filtered result", () => {
    const empty = props();
    const { rerender } = render(
      <ItemBacklog
        {...empty}
        groups={[{ key: "", label: "", items: [] }]}
        hasItems={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Backlog vide" })).toBeVisible();
    expect(
      screen.getByText("Créez une tâche pour commencer à planifier ce backlog."),
    ).toBeVisible();

    rerender(
      <ItemBacklog
        {...empty}
        groups={[{ key: "", label: "", items: [] }]}
        filtersActive
        hasItems
      />,
    );

    expect(screen.getByRole("heading", { name: "Aucun résultat" })).toBeVisible();
    expect(
      screen.getByText("Aucune tâche du backlog ne correspond aux filtres actifs."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Effacer les filtres" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=backlog",
    );
  });
});
