import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupControl } from "@/components/shell/group-control";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
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

function renderControl(
  control: React.ReactElement,
  currentParams: Record<string, string>,
) {
  return render(
    <ViewUrlStateProvider currentParams={currentParams}>
      {control}
    </ViewUrlStateProvider>,
  );
}

describe("GroupControl", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
  });

  it("sets component grouping while preserving the item, saved view, filters, and display mode", async () => {
    const user = userEvent.setup();
    const currentParams = {
      item: "DEMO-42",
      v: "saved-view",
      q: "auth",
      type: "tache",
      status: "ready",
      view: "board",
    };
    renderControl(
      <GroupControl
        view="board"
        state={emptyState}
        currentParams={currentParams}
      />,
      currentParams,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Grouper par" }),
      "component",
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?item=DEMO-42&v=saved-view&q=auth&type=tache&status=ready&view=board&group=component",
        { scroll: false },
      ),
    );
  });

  it("offers every supported board group except status", () => {
    const currentParams = { view: "board" };
    renderControl(
      <GroupControl
        view="board"
        state={emptyState}
        currentParams={currentParams}
      />,
      currentParams,
    );

    const options = screen.getAllByRole("option").map((option) => ({
      label: option.textContent,
      value: (option as HTMLOptionElement).value,
    }));
    expect(options).toEqual([
      { label: "Priorité", value: "priority" },
      { label: "Assigné", value: "assignee" },
      { label: "Composant", value: "component" },
      { label: "Aucun", value: "" },
    ]);
    expect(screen.queryByRole("option", { name: "Statut" })).not.toBeInTheDocument();
  });

  it("offers status grouping in list view and deletes group when none is selected", async () => {
    const user = userEvent.setup();
    const currentParams = { item: "DEMO-42", view: "list", group: "status" };
    renderControl(
      <GroupControl
        view="list"
        state={{ ...emptyState, group: "status" }}
        currentParams={currentParams}
      />,
      currentParams,
    );

    expect(screen.getByRole("option", { name: "Statut" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Grouper par" }), "");

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?item=DEMO-42&view=list",
        { scroll: false },
      ),
    );
  });

  it("renders no grouping control for tree view", () => {
    const currentParams = { view: "tree", group: "component" };
    renderControl(
      <GroupControl
        view="tree"
        state={{ ...emptyState, group: "component" }}
        currentParams={currentParams}
      />,
      currentParams,
    );

    expect(screen.queryByRole("combobox", { name: "Grouper par" })).not.toBeInTheDocument();
  });
});
