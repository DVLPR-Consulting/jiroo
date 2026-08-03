import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import type { ViewState } from "@/lib/items/filter";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ replace: mocks.replace }),
}));

const emptyState: ViewState = {
  filters: {
    q: "",
    types: [],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

function renderBar(state: ViewState = emptyState) {
  return render(
    <FilterBar
      state={state}
      currentParams={{ view: "board", item: "DEMO-1" }}
      statuses={[{ id: "ready", name: "Prêt" }]}
      users={[{ id: "marie", name: "Marie Lemaire" }]}
      labels={[{ id: "urgent", name: "Urgent", color: "#c00" }]}
      hierarchy={[
        { id: "component-1", key: "DEMO-1", title: "Plateforme", type: "composant" },
        { id: "epic-1", key: "DEMO-2", title: "Refonte", type: "epic" },
        { id: "task-1", key: "DEMO-3", title: "Invisible", type: "tache" },
      ]}
      resultCount={4}
    />,
  );
}

describe("FilterBar", () => {
  it("renders each inactive facet as a plus-prefixed chip", () => {
    renderBar();

    for (const label of ["Type", "Statut", "Priorité", "Label", "Assigné", "Nature", "Sous"]) {
      expect(screen.getByRole("button", { name: `+ ${label}` })).toHaveAttribute("data-active", "false");
    }
    expect(screen.queryByRole("combobox", { name: "Grouper par" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Trier par" })).not.toBeInTheDocument();
  });

  it("shows the selected facet value and clears only that facet", async () => {
    const user = userEvent.setup();
    renderBar({
      ...emptyState,
      filters: { ...emptyState.filters, types: ["tache"] },
    });

    const typeChip = screen.getByRole("button", { name: /Type.*Tâche.*1/i });
    expect(typeChip).toHaveAttribute("data-active", "true");

    await user.click(screen.getByRole("button", { name: "Effacer le filtre Type" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=board&item=DEMO-1", { scroll: false }),
    );
  });

  it("writes selected component and epic facets to the under URL parameter", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "+ Sous" }));
    await user.click(screen.getByLabelText("DEMO-2 — Refonte"));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&item=DEMO-1&under=epic-1",
        { scroll: false },
      ),
    );
    expect(screen.queryByLabelText("DEMO-3 — Invisible")).not.toBeInTheDocument();
  });
});
