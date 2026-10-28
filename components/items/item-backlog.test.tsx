import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ItemBacklog,
  type BacklogItem,
} from "@/components/items/item-backlog";
import { hierarchyStartStep } from "@/lib/tree/hierarchy";

const mocks = vi.hoisted(() => ({
  bulkUpdateItemsAction: vi.fn(),
  createItemAction: vi.fn(),
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
  useOptionalViewUrlState: () => ({ push: mocks.push }),
  useRequestedItemKey: () => null,
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: mocks.bulkUpdateItemsAction,
  createItemAction: mocks.createItemAction,
  softDeleteItemAction: vi.fn(),
  rankBacklogItemAction: mocks.rankBacklogItemAction,
  updateItemAction: vi.fn(),
}));

vi.mock("@/app/actions/item-choices", () => ({
  searchBacklogItemsAction: vi.fn(async () => ({ ok: true as const, items: [], limit: 20 })),
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
    createDialogProps: {
      structure: items.map(({ id, key, type, title }) => ({ id, key, type, title })),
      statuses: statuses.map(({ id, name }) => ({ id, name })),
    },
    canCreateItems: true,
    canEditItems: true,
    canTransitionItems: true,
    canAssignItems: true,
    canScheduleItems: true,
    canManageSprints: true,
  };
}

const epicId = "33333333-3333-4333-8333-333333333333";
const epicItems = [
  { id: epicId, key: "DEMO-9", type: "epic" as const, title: "Connexion sécurisée" },
];

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
          velocityComparison: null,
          commitmentBasis: null,
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
          velocityComparison: null,
          commitmentBasis: null,
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
          velocityComparison: null,
          commitmentBasis: null,
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
    createDialogProps: {
      structure: [...epicItems, ...items.map(({ id, key, type, title }) => ({ id, key, type, title }))],
      statuses: statuses.map(({ id, name }) => ({ id, name })),
    },
    canCreateItems: true,
    canEditItems: true,
    canTransitionItems: true,
    canAssignItems: true,
    canScheduleItems: true,
    canManageSprints: true,
  };
}

function mockBacklogGeometry() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function getBacklogRect(this: HTMLElement) {
      const labelledRow = this.closest('[role="row"][aria-label]') as HTMLElement | null;
      const row = labelledRow ?? (this.matches('[role="row"][aria-label]') ? this : null);
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
    mocks.createItemAction.mockReset();
  });

  it("shows fix versions as compact chips with a remainder, only when present", () => {
    const input = sprintProps();
    if (!("sections" in input)) throw new Error("Sprint props expected");
    const versions = [
      { id: "release-1", name: "2026.10", released: false, archived: false },
      { id: "release-2", name: "2026.09", released: true, archived: false },
      { id: "release-3", name: "Legacy", released: true, archived: true },
    ];
    const firstSection = input.sections[0]!;
    const versionedItem = { ...firstSection.items[0]!, fixVersions: versions };
    render(
      <ItemBacklog
        {...input}
        sections={[
          {
            ...firstSection,
            items: [versionedItem],
            groups: [{ key: "", label: "", items: [versionedItem] }],
          },
          input.sections[2]!,
        ]}
      />,
    );

    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /DEMO-1 — Authentification/ });
    expect(within(row).getByText("2026.10")).toBeVisible();
    expect(within(row).getByText("2026.09")).toBeVisible();
    expect(within(row).getByText("+1")).toBeVisible();
    expect(within(row).queryByText("Legacy")).not.toBeInTheDocument();
    const bare = screen.getByRole("row", { name: /DEMO-3 — Déconnexion/ });
    expect(within(bare).queryByText("—")).not.toBeInTheDocument();
  });

  it("renders compact rows without a table width floor so phones never scroll sideways", () => {
    render(<ItemBacklog {...sprintProps()} />);

    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(3);
    for (const table of tables) expect(table.getAttribute("style")).toBeNull();
    for (const row of screen.getAllByRole("row", { name: /DEMO-/ })) {
      expect(row.className).toContain("min-h-[var(--row-h)]");
      expect(row.className).toContain("flex-wrap");
    }
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
    expect(screen.getByText("3 / 8 pts")).toBeVisible();
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

  it("keeps the recent velocity context and the frozen start commitment while optimistically moving a task", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    let resolveMove: (value: { ok: true; item: unknown }) => void = () => undefined;
    mocks.moveSprintItemAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMove = resolve;
      }),
    );
    const base = sprintProps() as Extract<
      React.ComponentProps<typeof ItemBacklog>,
      { sections: unknown }
    >;
    const recentVelocity = { population: 2, averageCompletedPoints: 4 };
    const { container } = render(
      <ItemBacklog
        {...base}
        recentVelocity={recentVelocity}
        activeSprintCommitment={{ sprintId: "sprint-active", commitmentPoints: 3 }}
      />,
    );
    const futureSection = container.querySelector(
      '[data-sprint-section="sprint-future"]',
    ) as HTMLElement;
    const activeSection = container.querySelector(
      '[data-sprint-section="sprint-active"]',
    ) as HTMLElement;
    const backlogSection = container.querySelector(
      '[data-sprint-section="backlog"]',
    ) as HTMLElement;

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-1" });
    handle.focus();
    await user.keyboard("[Space][ArrowDown][Space]");

    await waitFor(() => expect(mocks.moveSprintItemAction).toHaveBeenCalledOnce());
    expect(
      within(futureSection).getByText(
        "Engagement 8 pts · moyenne des sprints précédents 4 pts · écart +4 pts",
      ),
    ).toBeVisible();
    expect(
      within(futureSection).getByText(
        "Engagement supérieur à la moyenne des sprints précédents : avertissement non bloquant.",
      ),
    ).toBeVisible();
    // The active sprint keeps its commitment frozen at start; only the live scope moves.
    expect(
      within(activeSection).getByText(
        "Engagement 3 pts · moyenne des sprints précédents 4 pts · écart -1 pt",
      ),
    ).toBeVisible();
    expect(within(activeSection).getByText("Périmètre actuel 0 pt")).toBeVisible();
    expect(within(futureSection).queryByText(/Périmètre actuel/)).not.toBeInTheDocument();
    expect(within(backlogSection).queryByText(/moyenne des sprints précédents|vélocité/))
      .not.toBeInTheDocument();

    resolveMove({ ok: true, item: { ...items[0], rank: "aV" } });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    geometry.mockRestore();
  });

  it("gives each sprint one primary lifecycle action and its points per status", () => {
    const { container } = render(<ItemBacklog {...sprintProps()} />);

    expect(screen.getByRole("button", { name: "Terminer le sprint Sprint actif" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Démarrer le sprint Sprint futur" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Démarrer le sprint Sprint actif" }))
      .not.toBeInTheDocument();
    const future = container.querySelector('[data-sprint-section="sprint-future"]') as HTMLElement;
    // DEMO-2 (5 pts) is in progress.
    expect(
      within(future).getByText("Points par statut : À faire 0, En cours 5, Terminé 0"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions de Sprint futur" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Actions de Backlog" })).not.toBeInTheDocument();
  });

  it("invites dropping backlog items into an empty sprint and plans them there", async () => {
    const user = userEvent.setup();
    const geometry = mockBacklogGeometry();
    mocks.moveSprintItemAction.mockResolvedValueOnce({ ok: true, item: items[2] });
    const input = sprintProps() as Extract<
      React.ComponentProps<typeof ItemBacklog>,
      { sections: unknown }
    >;
    const [active, future, backlog] = input.sections;
    const emptyFuture = {
      ...future!,
      items: [],
      groups: [{ key: "", label: "", items: [] }],
    };
    const { container } = render(
      <ItemBacklog {...input} sections={[active!, emptyFuture, backlog!]} />,
    );
    const futureSection = container.querySelector(
      '[data-sprint-section="sprint-future"]',
    ) as HTMLElement;
    expect(
      within(futureSection).getByText("Glissez des items du backlog ici pour planifier le sprint"),
    ).toBeVisible();
    const backlogSection = container.querySelector('[data-sprint-section="backlog"]') as HTMLElement;
    expect(within(backlogSection).queryByText(/Glissez des items/)).not.toBeInTheDocument();

    const handle = screen.getByRole("button", { name: "Déplacer DEMO-3" });
    handle.focus();
    await user.keyboard("[Space][ArrowUp][Space]");
    await waitFor(() =>
      expect(mocks.moveSprintItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-3" }),
      ),
    );
    geometry.mockRestore();
  });

  it("heads the Backlog section with its counts, points per status and a secondary Créer un sprint", () => {
    render(<ItemBacklog {...sprintProps()} />);

    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(within(backlog).getByRole("heading", { name: "Backlog" })).toBeVisible();
    expect(within(backlog).getByText("1 item · 1 non estimé")).toBeVisible();
    expect(
      within(backlog).getByText("Points par statut : À faire 0, En cours 0, Terminé 0"),
    ).toBeInTheDocument();
    expect(within(backlog).getByRole("button", { name: "Créer un sprint" }))
      .toHaveAttribute("data-variant", "outline");
    expect(screen.getAllByRole("button", { name: "Créer un sprint" })).toHaveLength(1);
  });

  it("creates an item inline at the bottom of a sprint with Entrée and keeps the field open", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({
      ok: true,
      item: { id: "new-item", key: "DEMO-10" },
    });
    render(<ItemBacklog {...sprintProps()} />);
    expect(screen.queryByRole("button", { name: /\+ Tâche/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Créer un item dans Sprint futur" }));
    const field = screen.getByRole("textbox", { name: "Titre du nouvel item dans Sprint futur" });
    expect(field).toHaveFocus();
    // The only epic is pre-selected as the required parent.
    expect(screen.getByRole("combobox", { name: "Epic parent" })).toHaveTextContent("DEMO-9 — Connexion sécurisée");
    await user.type(field, "  Écran de vérification  {Enter}");

    await waitFor(() =>
      expect(mocks.createItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId: "11111111-1111-4111-8111-111111111111",
        type: "tache",
        kind: "feature",
        parentId: epicId,
        title: "Écran de vérification",
        sprintId: "sprint-future",
      }),
    );
    await waitFor(() => expect(field).toHaveValue(""));
    expect(field).toHaveFocus();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("creates in the Backlog section without a sprint and shows server errors inline", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Données invalides.",
      fieldErrors: { title: ["Le titre est trop long."] },
    });
    render(<ItemBacklog {...sprintProps()} />);

    await user.click(screen.getByRole("button", { name: "Créer un item dans Backlog" }));
    const field = screen.getByRole("textbox", { name: "Titre du nouvel item dans Backlog" });
    await user.type(field, "Titre{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Le titre est trop long.");
    expect(mocks.createItemAction).toHaveBeenCalledWith(
      expect.objectContaining({ sprintId: null, title: "Titre" }),
    );
    expect(field).toHaveValue("Titre");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("asks for the parent epic and cancels inline creation with Escape", async () => {
    const user = userEvent.setup();
    const input = sprintProps() as Extract<
      React.ComponentProps<typeof ItemBacklog>,
      { sections: unknown }
    >;
    const twoEpics = [
      ...epicItems,
      { id: "44444444-4444-4444-8444-444444444444", key: "DEMO-8", type: "epic" as const, title: "Paiement" },
    ];
    render(
      <ItemBacklog
        {...input}
        createDialogProps={{ ...input.createDialogProps!, structure: twoEpics }}
      />,
    );

    const opener = screen.getByRole("button", { name: "Créer un item dans Backlog" });
    await user.click(opener);
    const field = screen.getByRole("textbox", { name: "Titre du nouvel item dans Backlog" });
    // What the picker says at the moment it receives focus (JIR-69).
    const picker = screen.getByRole("combobox", { name: "Epic parent" });
    const atFocus: (string | null)[] = [];
    picker.addEventListener("focus", () => atFocus.push(picker.getAttribute("aria-invalid")));
    await user.type(field, "Sans parent{Enter}");
    expect(picker).toHaveFocus();
    expect(atFocus).toEqual(["true"]);
    expect(picker).toHaveAttribute("aria-required", "true");
    // The error belongs to the picker, not to the title.
    expect(picker).toHaveAccessibleDescription("Choisissez l’epic parent.");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.createItemAction).not.toHaveBeenCalled();

    await user.click(picker);
    await user.click(screen.getByRole("option", { name: /^DEMO-8 — / }));
    expect(picker).not.toHaveAttribute("aria-invalid");
    expect(picker).not.toHaveAccessibleDescription();
    field.focus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Titre du nouvel item dans Backlog" }))
      .not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Créer un item dans Backlog" })).toHaveFocus(),
    );
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
    expect(within(activeSection as HTMLElement).getByText("3 / 8 pts")).toBeVisible();
    expect(within(futureSection as HTMLElement).getByText("5 / 8 pts")).toBeVisible();
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
        .map((row) => row.getAttribute("aria-label")),
    ).toEqual([
      "DEMO-1 — Authentification",
      "DEMO-2 — Session",
      "DEMO-3 — Déconnexion",
    ]);
  });

  it("puts the row fields on the right and hides empty values", () => {
    const parented = [
      { ...items[0]!, kind: "bug" as const, parent: { key: "DEMO-9", title: "Connexion sécurisée" } },
      items[1]!,
      { ...items[2]!, priority: 0 },
    ];
    render(<ItemBacklog {...props()} groups={[{ key: "", label: "", items: parented }]} />);

    const first = screen.getByRole("row", { name: "DEMO-1 — Authentification" });
    expect(within(first).getByText("Bug")).toBeVisible();
    expect(within(first).getByText("Connexion sécurisée")).toBeVisible();
    expect(within(first).getByRole("button", { name: "Statut : À faire" })).toBeVisible();
    expect(within(first).getByRole("button", { name: "Priorité : Urgent" })).toBeVisible();
    expect(within(first).getByRole("button", { name: "Estimation : 3 pts" })).toHaveTextContent("3");
    expect(within(first).getByRole("button", { name: "Assigné : Marie Lemaire" })).toBeVisible();

    const second = screen.getByRole("row", { name: "DEMO-2 — Session" });
    expect(within(second).queryByText("Bug")).not.toBeInTheDocument();
    expect(within(second).getByRole("button", { name: "Statut : En cours" })).toBeVisible();
    expect(within(second).getByRole("button", { name: "Assigné : Nora Benali" })).toBeVisible();

    // No priority and no estimate: the editors only show on hover or focus.
    const third = screen.getByRole("row", { name: "DEMO-3 — Déconnexion" });
    const priority = within(third).getByRole("button", { name: "Priorité : Aucune" });
    expect(priority.parentElement?.parentElement?.className).toContain("opacity-0");
    const estimate = within(third).getByRole("button", { name: "Estimation : Non estimé" });
    expect(estimate.closest(".opacity-0")).not.toBeNull();
    expect(within(third).queryByText("Non estimé")).not.toBeInTheDocument();
    expect(within(third).queryByText("Non assigné")).not.toBeInTheDocument();
    expect(within(third).getByRole("button", { name: "Assigné : Non assigné" })).toBeVisible();
  });

  it("keeps viewer rows readable without edit or drag controls", () => {
    const viewerItems = [items[0]!, { ...items[2]!, priority: 0 }];
    render(
      <ItemBacklog
        {...props()}
        groups={[{ key: "", label: "", items: viewerItems }]}
        canCreateItems={false}
        canEditItems={false}
        canTransitionItems={false}
        canAssignItems={false}
        canScheduleItems={false}
        canManageSprints={false}
      />,
    );

    const first = screen.getByRole("row", {
      name: "DEMO-1 — Authentification",
    });
    expect(within(first).getByText("À faire")).toBeVisible();
    expect(within(first).getByRole("img", { name: "Urgent" })).toBeVisible();
    expect(within(first).getByText("3 pts")).toBeInTheDocument();
    expect(within(first).getByRole("img", { name: "Marie Lemaire" })).toBeVisible();
    expect(within(first).queryByRole("button")).not.toBeInTheDocument();

    const bare = screen.getByRole("row", { name: "DEMO-3 — Déconnexion" });
    expect(within(bare).queryByRole("img", { name: "Aucune" })).not.toBeInTheDocument();
    expect(within(bare).queryByText(/estimé/)).not.toBeInTheDocument();
    expect(within(bare).getByRole("img", { name: "Non assigné" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Déplacer DEMO-/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("separates sprint management, task scheduling, and item creation", () => {
    const denied = {
      canCreateItems: false,
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
      canScheduleItems: false,
      canManageSprints: false,
    } as const;

    const manager = render(
      <ItemBacklog
        {...sprintProps()}
        {...denied}
        planningCapabilities={{ rank: false, reparent: false, assignSprint: false, manageSprints: true }}
      />,
    );
    expect(screen.getByRole("button", { name: "Créer un sprint" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Créer un item dans Sprint actif" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Déplacer DEMO-/ }),
    ).not.toBeInTheDocument();
    manager.unmount();

    const scheduler = render(
      <ItemBacklog
        {...sprintProps()}
        {...denied}
        planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "Déplacer DEMO-1" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Créer un sprint" }),
    ).not.toBeInTheDocument();
    scheduler.unmount();

    // Inline creation makes a task under an epic: without the scheduling
    // right it could only fail, so no section offers it.
    const creator = render(<ItemBacklog {...sprintProps()} {...denied} canCreateItems />);
    expect(
      screen.queryByRole("button", { name: "Créer un item dans Backlog" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer un item dans Sprint actif" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer un item dans Sprint futur" }),
    ).not.toBeInTheDocument();
    creator.unmount();

    render(
      <ItemBacklog
        {...sprintProps()}
        {...denied}
        canCreateItems
        canScheduleItems
      />,
    );
    expect(
      screen.getByRole("button", { name: "Créer un item dans Sprint actif" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Créer un sprint" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Déplacer DEMO-1" }),
    ).toBeVisible();
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

    const estimate = within(firstRow).getByRole("button", { name: "Estimation : 3 pts" });
    estimate.focus();
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument();
  });

  it("keeps the selection when Escape only closes a bulk toolbar menu", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...props()} />);

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-3" }));
    await user.click(screen.getByRole("button", { name: "Modifier la priorité" }));
    expect(screen.getByRole("menu")).toBeVisible();
    // The portaled menu bubbles through React, not through the backlog's DOM.
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByText("1 item sélectionné")).toBeVisible();
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

describe("ItemBacklog first steps (JIR-88)", () => {
  const composant = { id: "comp-1", key: "DEMO-1", type: "composant" as const, title: "Portail" };
  const firstEpic = { id: epicId, key: "DEMO-2", type: "epic" as const, title: "Connexion" };
  const emptyMetrics = {
    itemCount: 0,
    estimatedPoints: 0,
    completedPoints: 0,
    remainingPoints: 0,
    unestimatedCount: 0,
    capacityPoints: null,
    overCapacityPoints: 0,
    velocityComparison: null,
    commitmentBasis: null,
  };

  /** A new backlog: one empty planned sprint and an empty Backlog section. */
  function newBacklogProps(
    dialogItems: { id: string; key: string; type: "composant" | "epic"; title: string }[],
    overrides: Partial<Extract<React.ComponentProps<typeof ItemBacklog>, { sections: unknown }>> = {},
  ): React.ComponentProps<typeof ItemBacklog> {
    const sprint = {
      id: "sprint-1",
      name: "Sprint 1",
      goal: null,
      state: "planned" as const,
      rank: "a0",
      capacityPoints: null,
      plannedStartAt: null,
      plannedEndAt: null,
      startedAt: null,
      completedAt: null,
    };
    return {
      sections: [
        { id: sprint.id, kind: "planned" as const, sprint, metrics: emptyMetrics, items: [], groups: [] },
        { id: "backlog", kind: "backlog" as const, sprint: null, metrics: emptyMetrics, items: [], groups: [] },
      ],
      sprints: [sprint],
      grouped: false,
      statuses,
      users,
      backlogKey: "DEMO",
      backlogId: "11111111-1111-4111-8111-111111111111",
      manualOrder: true,
      filtersActive: false,
      hasItems: false,
      // The server reads the live backlog; here the candidates are all of it.
      startStep: hierarchyStartStep(dialogItems),
      createDialogProps: {
        structure: dialogItems,
        statuses: statuses.map(({ id, name }) => ({ id, name })),
      },
      canCreateItems: true,
      canEditItems: true,
      canTransitionItems: true,
      canAssignItems: true,
      canScheduleItems: true,
      canManageSprints: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    mocks.createItemAction.mockReset();
  });

  it("starts an empty backlog with a Composant in place of « Créer un item »", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...newBacklogProps([])} />);

    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(
      within(backlog).getByRole("note", {
        name: "Commencez par créer un Composant (un domaine ou un produit)",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Créer un item/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau Composant (Sprint 1)" })).toBeVisible();

    await user.click(within(backlog).getByRole("button", { name: "Nouveau Composant (Backlog)" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Composant");
  });

  it("asks for an Epic under the only Composant before any task", async () => {
    const user = userEvent.setup();
    render(<ItemBacklog {...newBacklogProps([composant])} />);

    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(within(backlog).getByRole("note", { name: "Créez une Epic dans un Composant" })).toBeVisible();
    expect(within(backlog).getByText("Pour créer un item, créez d’abord une Epic.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Créer un item/ })).not.toBeInTheDocument();

    await user.click(within(backlog).getByRole("button", { name: "Nouvelle Epic (Backlog)" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
    expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveValue(
      "DEMO-1 — Portail",
    );
  });

  it("brings back inline creation under the first Epic once it exists", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ItemBacklog {...newBacklogProps([composant])} />);
    rerender(<ItemBacklog {...newBacklogProps([composant, firstEpic])} />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Créer un item dans Backlog" }));
    expect(screen.getByRole("combobox", { name: "Epic parent" })).toHaveTextContent(
      "DEMO-2 — Connexion",
    );
  });

  it("keeps « Créer un item » when filters hide the live backlog's Epics", () => {
    // A Version filter can empty the candidates: the server's live step rules.
    render(<ItemBacklog {...newBacklogProps([], { filtersActive: true, startStep: null })} />);

    expect(screen.getByRole("button", { name: "Créer un item dans Backlog" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Nouveau Composant/ })).not.toBeInTheDocument();
  });

  it("points to the unfiltered view while filters hide the missing level's parents", () => {
    // The live backlog lacks an Epic, but the filtered candidates hold no
    // Composant: an Epic dialog could not be completed here.
    render(
      <ItemBacklog
        {...newBacklogProps([], {
          filtersActive: true,
          startStep: "epic",
          clearFiltersHref: "/b/DEMO?view=backlog",
        })}
      />,
    );

    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(
      within(backlog).getByText("Pour créer un item, il faut d’abord une Epic : effacez les filtres pour la créer."),
    ).toBeVisible();
    expect(within(backlog).getByRole("link", { name: "Effacer les filtres" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=backlog",
    );
    expect(screen.queryByRole("button", { name: /Nouvelle Epic|Créer un item/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("keeps the Composant button for a creator who may not schedule", () => {
    const { unmount } = render(
      <ItemBacklog
        {...newBacklogProps([], {
          canScheduleItems: false,
          createDialogProps: { structure: [], statuses: [], canScheduleItems: false },
        })}
      />,
    );
    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(within(backlog).getByRole("button", { name: "Nouveau Composant" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Sprint 1\)/ })).not.toBeInTheDocument();
    unmount();

    // An Epic has a parent: without the scheduling right only the text remains.
    render(
      <ItemBacklog
        {...newBacklogProps([composant], {
          canScheduleItems: false,
          createDialogProps: { structure: [composant], statuses: [], canScheduleItems: false },
        })}
      />,
    );
    expect(screen.getByRole("note", { name: "Aucune Epic pour l’instant" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Nouvelle Epic/ })).not.toBeInTheDocument();
  });

  it("only states that the backlog is empty to a viewer", () => {
    render(
      <ItemBacklog
        {...newBacklogProps([], {
          canCreateItems: false,
          canScheduleItems: false,
          canManageSprints: false,
        })}
      />,
    );

    expect(screen.getByRole("note", { name: "Ce backlog est vide" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Nouveau Composant/ })).not.toBeInTheDocument();
  });
});

it.each(["legacy", "sprints"])("passes denied directory access through %s backlog rows", async (mode) => {
  const user = userEvent.setup();
  render(<ItemBacklog {...(mode === "legacy" ? props() : sprintProps())} users={[]} canBrowseUsers={false} />);
  await user.click(screen.getAllByRole("button", { name: /^Assigné :/ })[0]!);
  expect(screen.getByText(/Il vous manque la permission globale/)).toBeVisible();
});