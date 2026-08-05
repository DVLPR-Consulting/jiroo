import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ItemBacklog,
  type BacklogItem,
} from "@/components/items/item-backlog";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/shell/view-url-state", () => ({
  useViewUrlState: () => ({ push: mocks.push }),
}));

vi.mock("@/app/actions/items", () => ({
  updateItemAction: vi.fn(),
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
    filtersActive: false,
    hasItems: true,
    clearFiltersHref: "/b/DEMO?view=backlog",
    canWrite: true,
  };
}

describe("ItemBacklog", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
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
