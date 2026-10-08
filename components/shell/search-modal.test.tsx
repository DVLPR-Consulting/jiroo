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
  recentItemsAction: vi.fn(),
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
  recentItemsAction: mocks.recentItemsAction,
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
    releaseIds: [],
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
  assigneeName: null,
};

const recentResult: SearchResult = {
  ...demoResult,
  id: "item-demo-2",
  key: "DEMO-2",
  title: "Relire les récents",
  assigneeName: "Marie Dupont",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
          releases={[]}
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
    mocks.recentItemsAction.mockReset();
    mocks.recentItemsAction.mockResolvedValue({ ok: true, results: [] });
    mocks.searchAction.mockReset();
    localStorage.clear();
  });

  it("loads at most eight valid recent keys and renders their assignee", async () => {
    localStorage.setItem(
      "jiroo-recent-items",
      JSON.stringify([
        "DEMO-10",
        "DEMO-9",
        "DEMO-8",
        "DEMO-7",
        "DEMO-6",
        "DEMO-5",
        "DEMO-4",
        "DEMO-3",
        "DEMO-2",
        "DEMO-10",
        "demo-1",
        { key: "DEMO-1", title: "Private title" },
      ]),
    );
    mocks.recentItemsAction.mockResolvedValueOnce({
      ok: true,
      results: [recentResult],
    });

    renderSubject();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await act(async () => {});

    expect(mocks.recentItemsAction).toHaveBeenCalledWith([
      "DEMO-10",
      "DEMO-9",
      "DEMO-8",
      "DEMO-7",
      "DEMO-6",
      "DEMO-5",
      "DEMO-4",
      "DEMO-3",
    ]);
    expect(screen.getByRole("heading", { name: "Récents" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /DEMO-2/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Marie Dupont" })).toBeInTheDocument();
  });

  it("highlights a key-only query in the matching result", async () => {
    renderSubject();

    const option = await revealResult({
      ...demoResult,
      key: "CASS-39",
      title: "Titre sans correspondance",
    });

    expect(option.querySelector(".item-key mark")).toHaveTextContent("CASS-39");
  });

  it("opens and closes the palette with Command/Ctrl+K", () => {
    renderSubject();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeVisible();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("opens the palette when the « / » shortcut asks for it", () => {
    renderSubject();

    act(() => {
      window.dispatchEvent(new Event("jiroo:open-search"));
    });

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Rechercher" })).toHaveFocus();
  });

  it("restores recent rows after the query is cleared", async () => {
    localStorage.setItem("jiroo-recent-items", JSON.stringify(["DEMO-2"]));
    mocks.recentItemsAction.mockResolvedValue({
      ok: true,
      results: [recentResult],
    });
    mocks.searchAction.mockResolvedValueOnce({ ok: true, results: [demoResult] });

    renderSubject();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await act(async () => {});

    const input = screen.getByRole("textbox", { name: "Rechercher" });
    fireEvent.change(input, { target: { value: "DEMO-1" } });
    await act(async () => vi.advanceTimersByTime(150));
    expect(screen.getByRole("option", { name: /DEMO-1/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    await act(async () => {});

    expect(mocks.recentItemsAction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Récents" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /DEMO-2/ })).toBeInTheDocument();
  });

  it("hides old recent rows while a new blank-query request is pending", async () => {
    const pendingSearch = deferred<{ ok: true; results: SearchResult[] }>();
    const pendingRecent = deferred<{ ok: true; results: SearchResult[] }>();
    localStorage.setItem("jiroo-recent-items", JSON.stringify(["DEMO-2"]));
    mocks.recentItemsAction
      .mockResolvedValueOnce({ ok: true, results: [recentResult] })
      .mockReturnValueOnce(pendingRecent.promise);
    mocks.searchAction.mockReturnValueOnce(pendingSearch.promise);

    renderSubject();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await act(async () => {});
    expect(screen.getByRole("option", { name: /DEMO-2/ })).toBeInTheDocument();

    const input = screen.getByRole("textbox", { name: "Rechercher" });
    fireEvent.change(input, { target: { value: "DEMO-1" } });
    act(() => vi.advanceTimersByTime(150));
    expect(mocks.searchAction).toHaveBeenCalledWith("DEMO-1");

    fireEvent.change(input, { target: { value: "" } });

    expect(screen.queryByRole("option", { name: /DEMO-2/ })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => {
      pendingSearch.resolve({ ok: true, results: [demoResult] });
      pendingRecent.resolve({ ok: true, results: [] });
    });
  });

  it("hides an old A response when a new A request follows pending B", async () => {
    const pendingB = deferred<{ ok: true; results: SearchResult[] }>();
    const pendingSecondA = deferred<{ ok: true; results: SearchResult[] }>();
    mocks.searchAction
      .mockResolvedValueOnce({ ok: true, results: [demoResult] })
      .mockReturnValueOnce(pendingB.promise)
      .mockReturnValueOnce(pendingSecondA.promise);

    renderSubject();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    const input = screen.getByRole("textbox", { name: "Rechercher" });

    fireEvent.change(input, { target: { value: "A" } });
    await act(async () => vi.advanceTimersByTime(150));
    expect(screen.getByRole("option", { name: /DEMO-1/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "B" } });
    act(() => vi.advanceTimersByTime(150));
    expect(mocks.searchAction).toHaveBeenLastCalledWith("B");

    fireEvent.change(input, { target: { value: "A" } });
    act(() => vi.advanceTimersByTime(150));
    expect(mocks.searchAction).toHaveBeenLastCalledWith("A");

    expect(screen.queryByRole("option", { name: /DEMO-1/ })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => {
      pendingB.resolve({ ok: true, results: [] });
      pendingSecondA.resolve({ ok: true, results: [] });
    });
  });

  it("records a recent keyboard selection before preserving URL navigation", async () => {
    localStorage.setItem("jiroo-recent-items", JSON.stringify(["DEMO-2", "DEMO-1"]));
    mocks.recentItemsAction.mockResolvedValueOnce({
      ok: true,
      results: [recentResult],
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    renderSubject();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await act(async () => {});
    setItem.mockClear();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rechercher" }), {
      key: "Enter",
    });

    expect(localStorage.getItem("jiroo-recent-items")).toBe(
      JSON.stringify(["DEMO-2", "DEMO-1"]),
    );
    expect(setItem).toHaveBeenCalledWith(
      "jiroo-recent-items",
      JSON.stringify(["DEMO-2", "DEMO-1"]),
    );
    expect(setItem.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.push.mock.invocationCallOrder[0]!,
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-2",
    );
    setItem.mockRestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
