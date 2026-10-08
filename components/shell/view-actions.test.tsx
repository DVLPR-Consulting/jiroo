import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { ViewActions } from "@/components/shell/view-actions";
import { requestSaveView } from "@/components/shell/save-view-event";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import type { Filters, ViewState } from "@/lib/items/filter";

const mocks = vi.hoisted(() => ({
  createView: vi.fn(),
  deleteView: vi.fn(),
  renameView: vi.fn(),
  setSharedView: vi.fn(),
  updateView: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/actions/views", () => ({
  createViewAction: mocks.createView,
  deleteViewAction: mocks.deleteView,
  renameViewAction: mocks.renameView,
  setSharedViewAction: mocks.setSharedView,
  updateViewAction: mocks.updateView,
}));

vi.mock("@/components/shell/view-save-dialog", () => ({
  ViewSaveDialog: ({
    open,
    mode,
    onSubmit,
  }: {
    open: boolean;
    mode: "create" | "rename";
    onSubmit: (values: { name: string; shared: boolean }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onSubmit({ name: "Ma vue", shared: false })}
      >
        Confirmer {mode}
      </button>
    ) : null,
}));

const filters: Filters = {
  q: "",
  types: [],
  statusIds: [],
  priorities: [],
  assignees: [],
  labels: [],
  releaseIds: [],
  kind: [],
  underIds: [],
};

const state: ViewState = { filters, group: null, sort: null };

function renderActions({
  currentParams = { view: "list", v: "saved-old" },
  activeView = { id: "saved-old", name: "Ma vue", shared: false },
  dirty = true,
}: {
  currentParams?: Record<string, string>;
  activeView?: { id: string; name: string; shared: boolean } | null;
  dirty?: boolean;
} = {}) {
  return render(
    <ViewUrlStateProvider initialEntries={Object.entries(currentParams)}>
      <ViewActions
        backlogKey="DEMO"
        backlogId="backlog-1"
        activeView={activeView}
        isOwner
        dirty={dirty}
        displayMode="list"
        filters={filters}
        group={null}
        sort={null}
      />
    </ViewUrlStateProvider>,
  );
}

describe("ViewActions URL navigation", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createView.mockResolvedValue({ ok: true, view: { id: "saved-new" } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a saved-view navigation and an already armed query", async () => {
    const user = userEvent.setup();
    const currentParams = { view: "board", item: "DEMO-1" };
    render(
      <ViewUrlStateProvider initialEntries={Object.entries(currentParams)}>
        <FilterBar
          state={state}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={[]}
          hierarchy={[]}
          resultCount={1}
        />
        <ViewActions
          backlogKey="DEMO"
          backlogId="backlog-1"
          activeView={null}
          isOwner
          dirty={false}
          displayMode="board"
          filters={filters}
          group={null}
          sort={null}
        />
      </ViewUrlStateProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Enregistrer la vue/ }));
    await user.click(screen.getByRole("menuitem", { name: "Enregistrer sous…" }));

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("searchbox", { hidden: true }), {
      target: { value: "auth" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmer create" }));
      await Promise.resolve();
    });

    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=board&item=DEMO-1&v=saved-new",
    );

    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&item=DEMO-1&v=saved-new&q=auth",
      { scroll: false },
    );
  });

  it("keeps a delete navigation when an armed query finishes", async () => {
    const user = userEvent.setup();
    mocks.deleteView.mockResolvedValue({ ok: true });
    const currentParams = { view: "list", v: "saved-old" };
    render(
      <ViewUrlStateProvider initialEntries={Object.entries(currentParams)}>
        <FilterBar
          state={state}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={[]}
          hierarchy={[]}
          resultCount={1}
        />
        <ViewActions
          backlogKey="DEMO"
          backlogId="backlog-1"
          activeView={{ id: "saved-old", name: "Ma vue", shared: false }}
          isOwner
          dirty={false}
          displayMode="list"
          filters={filters}
          group={null}
          sort={null}
        />
      </ViewUrlStateProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Ma vue/ }));
    await user.click(screen.getByRole("menuitem", { name: "Supprimer" }));

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("searchbox", { hidden: true }), {
      target: { value: "auth" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
      await Promise.resolve();
    });

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list");

    await act(async () => vi.advanceTimersByTime(300));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&q=auth",
      { scroll: false },
    );
  });

  it("keeps save in place refresh-only", async () => {
    const user = userEvent.setup();
    mocks.updateView.mockResolvedValue({ ok: true });
    renderActions();

    await user.click(screen.getByRole("button", { name: /Ma vue/ }));
    await user.click(screen.getByRole("menuitem", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.updateView).toHaveBeenCalledWith(
      expect.objectContaining({ id: "saved-old", backlogKey: "DEMO" }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps rename refresh-only", async () => {
    const user = userEvent.setup();
    mocks.renameView.mockResolvedValue({ ok: true });
    renderActions();

    await user.click(screen.getByRole("button", { name: /Ma vue/ }));
    await user.click(screen.getByRole("menuitem", { name: "Renommer…" }));
    await user.click(screen.getByRole("button", { name: "Confirmer rename" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.renameView).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      id: "saved-old",
      name: "Ma vue",
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps sharing refresh-only", async () => {
    const user = userEvent.setup();
    mocks.setSharedView.mockResolvedValue({ ok: true });
    renderActions();

    await user.click(screen.getByRole("button", { name: /Ma vue/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Partagée" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.setSharedView).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      id: "saved-old",
      shared: true,
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("opens the save-as dialog when the sidebar requests a saved view", () => {
    renderActions({ activeView: null, dirty: false });

    expect(screen.queryByRole("button", { name: "Confirmer create" })).not.toBeInTheDocument();
    act(() => requestSaveView());
    expect(screen.getByRole("button", { name: "Confirmer create" })).toBeInTheDocument();
  });

  it("hides its button until there is something to save but keeps the save dialog reachable", () => {
    render(
      <ViewUrlStateProvider initialEntries={[["view", "list"]]}>
        <ViewActions
          backlogKey="DEMO"
          backlogId="backlog-1"
          activeView={null}
          isOwner
          dirty={false}
          displayMode="list"
          filters={filters}
          group={null}
          sort={null}
          showTrigger={false}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.queryByRole("button", { name: /Enregistrer la vue/ })).not.toBeInTheDocument();
    act(() => requestSaveView());
    expect(screen.getByRole("button", { name: "Confirmer create" })).toBeInTheDocument();
  });

  it("opens the save-as dialog for a sidebar request made before it mounted", () => {
    requestSaveView();
    renderActions({ activeView: null, dirty: false });

    expect(screen.getByRole("button", { name: "Confirmer create" })).toBeInTheDocument();
  });
});
