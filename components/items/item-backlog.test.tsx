import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ItemBacklog,
  type BacklogItem,
} from "@/components/items/item-backlog";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rankBacklogItemAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/shell/view-url-state", () => ({
  useViewUrlState: () => ({ push: mocks.push }),
}));

vi.mock("@/app/actions/items", () => ({
  rankBacklogItemAction: mocks.rankBacklogItemAction,
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
    backlogId: "11111111-1111-4111-8111-111111111111",
    manualOrder: true,
    rankItemAction: mocks.rankBacklogItemAction,
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
    mocks.push.mockReset();
    mocks.rankBacklogItemAction.mockReset();
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
