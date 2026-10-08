import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayMenu } from "@/components/shell/display-menu";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import { DensityProvider } from "@/components/theme/density-provider";
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
    releaseIds: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

function renderMenu(
  view: "backlog" | "board" | "list" | "tree",
  currentParams: Record<string, string>,
  state: ViewState = emptyState,
) {
  return render(
    <ViewUrlStateProvider initialEntries={Object.entries(currentParams)}>
      <DensityProvider>
        <DisplayMenu view={view} state={state} />
      </DensityProvider>
    </ViewUrlStateProvider>,
  );
}

/** Opens « Affichage » the way a pointer does. */
function openDisplayMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /^Affichage/ }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
}

function groupOptions() {
  return within(screen.getByRole("group", { name: "Grouper par" }))
    .getAllByRole("menuitemradio")
    .map((item) => item.textContent);
}

describe("DisplayMenu", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    localStorage.clear();
    document.documentElement.setAttribute("data-density", "comfy");
  });

  it("recalls the current density on its trigger", () => {
    renderMenu("board", { view: "board" });

    expect(screen.getByRole("button", { name: "Affichage · Confort" })).toBeInTheDocument();
  });

  it("sets component grouping while preserving the item, saved view, filters, and display mode", async () => {
    const user = userEvent.setup();
    renderMenu("board", {
      item: "DEMO-42",
      v: "saved-view",
      q: "auth",
      type: "tache",
      status: "ready",
      view: "board",
    });

    await user.click(screen.getByRole("button", { name: /^Affichage/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Composant" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?item=DEMO-42&v=saved-view&q=auth&type=tache&status=ready&view=board&group=component",
        { scroll: false },
      ),
    );
  });

  it("offers every supported board group except status", () => {
    renderMenu("board", { view: "board" });
    openDisplayMenu();

    expect(groupOptions()).toEqual(["Priorité", "Assigné", "Composant", "Aucun"]);
  });

  it("offers status grouping in list view and deletes group when none is selected", async () => {
    const user = userEvent.setup();
    renderMenu(
      "list",
      { item: "DEMO-42", view: "list", group: "status" },
      { ...emptyState, group: "status" },
    );

    await user.click(screen.getByRole("button", { name: /^Affichage/ }));
    expect(screen.getByRole("menuitemradio", { name: "Statut" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Aucun" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?item=DEMO-42&view=list", {
        scroll: false,
      }),
    );
  });

  it("offers the complete grouping in backlog view", () => {
    renderMenu("backlog", { view: "backlog" });
    openDisplayMenu();

    expect(groupOptions()).toEqual(["Statut", "Priorité", "Assigné", "Composant", "Aucun"]);
  });

  it("offers only the density for the tree view", () => {
    renderMenu("tree", { view: "tree", group: "component" }, { ...emptyState, group: "component" });
    openDisplayMenu();

    expect(screen.queryByRole("group", { name: "Grouper par" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Confort" })).toBeInTheDocument();
  });

  it("switches to Compact and shows it on the trigger", async () => {
    const user = userEvent.setup();
    renderMenu("list", { view: "list" });

    await user.click(screen.getByRole("button", { name: /^Affichage/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Compact" }));

    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(screen.getByRole("button", { name: "Affichage · Compact" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
