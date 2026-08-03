import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupControl } from "@/components/shell/group-control";
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

describe("GroupControl", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
  });

  it("sets component grouping while preserving the item, saved view, filters, and display mode", async () => {
    const user = userEvent.setup();
    render(
      <GroupControl
        view="board"
        state={emptyState}
        currentParams={{
          item: "DEMO-42",
          v: "saved-view",
          q: "auth",
          type: "tache",
          status: "ready",
          view: "board",
        }}
      />,
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
    render(
      <GroupControl
        view="board"
        state={emptyState}
        currentParams={{ view: "board" }}
      />,
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
    render(
      <GroupControl
        view="list"
        state={{ ...emptyState, group: "status" }}
        currentParams={{ item: "DEMO-42", view: "list", group: "status" }}
      />,
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
    render(
      <GroupControl
        view="tree"
        state={{ ...emptyState, group: "component" }}
        currentParams={{ view: "tree", group: "component" }}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Grouper par" })).not.toBeInTheDocument();
  });
});
