import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchModal } from "@/components/shell/search-modal";
import { FilterBar } from "@/components/shell/filter-bar";
import {
  useViewUrlState,
  ViewUrlStateProvider,
} from "@/components/shell/view-url-state";
import type { ViewState } from "@/lib/items/filter";
import type { SearchResult } from "@/lib/services/search";

const mocks = vi.hoisted(() => ({
  pathname: "/b/DEMO",
  params: { key: "DEMO" } as { key?: string },
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  searchAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/actions/search", () => ({
  searchAction: mocks.searchAction,
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

const demoResult: SearchResult = {
  id: "item-demo-1",
  key: "DEMO-1",
  type: "tache",
  title: "Corriger la recherche",
  backlogKey: "demo",
  statusId: "ready",
  statusName: "Prêt",
  statusColor: "#999999",
};

const initialEntries: [string, string][] = [
  ["view", "board"],
  ["v", "saved"],
  ["group", "component"],
  ["type", "tache"],
  ["tag", "a"],
  ["tag", "b"],
];

function NavigationProbe() {
  const viewUrl = useViewUrlState();
  return (
    <>
      <button
        type="button"
        onClick={() => viewUrl.push((params) => params.set("item", "DEMO-1"))}
      >
        Open old item
      </button>
      <button
        type="button"
        onClick={() => viewUrl.push((params) => params.set("item", "DEMO-2"))}
      >
        Open new item
      </button>
    </>
  );
}

function renderSubject({
  withFilter = false,
  withProbe = false,
}: {
  withFilter?: boolean;
  withProbe?: boolean;
} = {}) {
  return render(
    <ViewUrlStateProvider initialEntries={initialEntries}>
      {withFilter && (
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          hierarchy={[]}
          resultCount={1}
        />
      )}
      {withProbe && <NavigationProbe />}
      <SearchModal />
    </ViewUrlStateProvider>,
  );
}

async function revealResult(result: SearchResult = demoResult) {
  mocks.searchAction.mockResolvedValueOnce({ ok: true, results: [result] });
  fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher" }), {
    target: { value: result.key },
  });
  await act(async () => vi.advanceTimersByTime(150));
  return screen.getByRole("option", { name: new RegExp(result.key) });
}

describe("SearchModal item navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.pathname = "/b/DEMO";
    mocks.params = { key: "DEMO" };
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.searchAction.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("composes same-backlog selection with current state, repeats, and an armed q", async () => {
    renderSubject({ withFilter: true });
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "urgent" },
    });

    fireEvent.click(await revealResult());

    expect(mocks.push).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(150));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1&q=urgent",
      { scroll: false },
    );

    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    expect(screen.getByRole("textbox", { name: "Rechercher" })).toHaveValue("");
  });

  it("reopens a previously tombstoned item through the provider", async () => {
    renderSubject({ withProbe: true });
    fireEvent.click(screen.getByRole("button", { name: "Open old item" }));
    fireEvent.click(screen.getByRole("button", { name: "Open new item" }));

    fireEvent.click(await revealResult());

    expect(mocks.push).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1",
    );
    expect(mocks.push).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      name: "another backlog",
      pathname: "/b/DEMO",
      params: { key: "DEMO" },
      result: { ...demoResult, backlogKey: "OTHER", key: "OTHER-1" },
      expected: "/b/OTHER?item=OTHER-1",
    },
    {
      name: "the mine route",
      pathname: "/mine",
      params: { key: "DEMO" },
      result: demoResult,
      expected: "/b/demo?item=DEMO-1",
    },
    {
      name: "a stale route param",
      pathname: "/b/DEMO",
      params: { key: "OTHER" },
      result: demoResult,
      expected: "/b/demo?item=DEMO-1",
    },
    {
      name: "a nested backlog path",
      pathname: "/b/DEMO/items",
      params: { key: "DEMO" },
      result: demoResult,
      expected: "/b/demo?item=DEMO-1",
    },
  ])("uses direct navigation from $name", async ({ pathname, params, result, expected }) => {
    mocks.pathname = pathname;
    mocks.params = params;
    renderSubject();

    fireEvent.click(await revealResult(result));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(expected);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
