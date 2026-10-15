import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapView, barDescription, type RoadmapViewSprint } from "@/components/roadmap/roadmap-view";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import type { RoadmapSource } from "@/lib/roadmap/rows";
import { currentHref } from "@/test/history";

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/CASS/roadmap",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function item(overrides: Partial<RoadmapSource>): RoadmapSource {
  return {
    id: "x",
    key: "CASS-0",
    title: "Item",
    type: "tache",
    parentId: null,
    category: "todo",
    start: null,
    due: null,
    closedAt: null,
    sprintId: null,
    ...overrides,
  };
}

const ITEMS: RoadmapSource[] = [
  item({ id: "c1", key: "CASS-1", type: "composant", title: "Recherche" }),
  item({ id: "e1", key: "CASS-2", type: "epic", parentId: "c1", title: "Moteur", start: "2026-10-01", due: "2026-12-31" }),
  item({ id: "t1", key: "CASS-3", parentId: "e1", title: "Indexer", category: "done", due: "2026-10-05" }),
  item({ id: "t2", key: "CASS-4", parentId: "e1", title: "Requêter", sprintId: "s1" }),
  item({ id: "e2", key: "CASS-5", type: "epic", parentId: "c1", title: "Sans date" }),
];
const SPRINTS: RoadmapViewSprint[] = [
  { id: "s1", name: "Sprint 12", state: "active", start: "2026-10-12", end: "2026-10-25" },
];

function renderView(items = ITEMS) {
  return render(
    <ViewUrlStateProvider initialEntries={[]}>
      <RoadmapView
        backlogKey="CASS"
        canEdit
        today="2026-10-16"
        items={items}
        sprints={SPRINTS}
        releases={[{ id: "r1", name: "v2", day: "2026-11-30", released: false }]}
      />
    </ViewUrlStateProvider>,
  );
}

describe("RoadmapView", () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, "", "/b/CASS/roadmap");
    window.localStorage.clear();
    // jsdom does not scroll.
    scrollTo.mockClear();
    HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  });

  it("opens on today", () => {
    renderView();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("shows components and epics, with epics collapsed", () => {
    renderView();
    expect(screen.getByText("Recherche")).toBeInTheDocument();
    expect(screen.getByText("Moteur")).toBeInTheDocument();
    expect(screen.queryByText("Indexer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("CASS-2 — Moteur, du 1 oct. 2026 au 31 déc. 2026")).toBeInTheDocument();
    // No days set and no task to derive them from: no bar.
    expect(document.querySelector('[data-roadmap-bar="CASS-5"]')).toBeNull();
  });

  it("expands an epic to its tasks, with own and sprint days", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Déplier CASS-2" }));
    expect(screen.getByLabelText("CASS-3 — Indexer, le 5 oct. 2026")).toBeInTheDocument();
    expect(
      screen.getByLabelText("CASS-4 — Requêter, du 12 oct. 2026 au 25 oct. 2026 (déduit)"),
    ).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("folds a component's epics away", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Replier CASS-1" }));
    expect(screen.queryByText("Moteur")).not.toBeInTheDocument();
  });

  it("opens the item panel from a bar or a label", async () => {
    renderView();
    await userEvent.click(screen.getByLabelText("CASS-2 — Moteur, du 1 oct. 2026 au 31 déc. 2026"));
    expect(currentHref()).toBe("/b/CASS/roadmap?item=CASS-2");
    await userEvent.click(screen.getByText("Recherche"));
    expect(currentHref()).toBe("/b/CASS/roadmap?item=CASS-1");
  });

  it("switches and remembers the zoom", async () => {
    renderView();
    const scale = screen.getByRole("group", { name: "Échelle" });
    expect(within(scale).getByRole("button", { name: "Mois" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(scale).getByRole("button", { name: "Semaines" }));
    expect(within(scale).getByRole("button", { name: "Semaines" })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("jiroo.roadmap.zoom")).toBe("weeks");
  });

  it("restores the remembered zoom", () => {
    window.localStorage.setItem("jiroo.roadmap.zoom", "quarters");
    renderView();
    expect(screen.getByRole("button", { name: "Trimestres" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks sprints and releases on the calendar", () => {
    renderView();
    expect(screen.getByText("Sprint 12")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Release v2, 30 nov. 2026" })).toBeInTheDocument();
    expect(screen.getByTestId("roadmap-today")).toBeInTheDocument();
  });

  it("shows epics done long ago only when asked", async () => {
    renderView([
      ...ITEMS,
      item({
        id: "e3",
        key: "CASS-6",
        type: "epic",
        parentId: "c1",
        title: "Livré en été",
        category: "done",
        closedAt: new Date("2026-08-01T10:00:00Z"),
        due: "2026-07-31",
      }),
    ]);
    expect(screen.queryByText("Livré en été")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Afficher les éléments terminés"));
    expect(screen.getByText("Livré en été")).toBeInTheDocument();
  });

  it("invites to create components when the backlog is empty", () => {
    renderView([]);
    expect(screen.getByText("Rien à planifier pour l’instant")).toBeInTheDocument();
  });
});

describe("barDescription", () => {
  it("reads a one-day bar and a derived bar", () => {
    expect(barDescription({ start: "2026-10-05", end: "2026-10-05", derived: false })).toBe("le 5 oct. 2026");
    expect(barDescription({ start: "2026-10-12", end: "2026-10-25", derived: true }))
      .toBe("du 12 oct. 2026 au 25 oct. 2026 (déduit)");
  });
});
