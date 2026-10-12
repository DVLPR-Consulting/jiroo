import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  useViewUrlState,
  ViewUrlStateProvider,
} from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  pathname: "/b/DEMO",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

function Probe() {
  const viewUrl = useViewUrlState();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          viewUrl.replace((params) => params.set("group", "component"))
        }
      >
        Internal group
      </button>
      <a href={viewUrl.href((params) => params.set("item", "TARGET-1"))}>
        Target
      </a>
    </>
  );
}

describe("ViewUrlStateProvider pathname lifecycle", () => {
  beforeEach(() => {
    mocks.pathname = "/b/DEMO";
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  it("does not carry an old pathname tombstone into the next route", () => {
    const oldEntries: [string, string][] = [
      ["view", "board"],
      ["tag", "old"],
    ];
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={oldEntries}>
        <Probe />
      </ViewUrlStateProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Internal group" }));

    mocks.pathname = "/b/OTHER";
    const boundaryEntries: [string, string][] = [
      ["view", "list"],
      ["tag", "new"],
    ];
    rerender(
      <ViewUrlStateProvider initialEntries={boundaryEntries}>
        <Probe />
      </ViewUrlStateProvider>,
    );

    mocks.pathname = "/b/DEMO";
    const returnEntries: [string, string][] = [
      ["view", "tree"],
      ["tag", "return"],
    ];
    rerender(
      <ViewUrlStateProvider initialEntries={returnEntries}>
        <Probe />
      </ViewUrlStateProvider>,
    );

    const oldQueryAfterRoundTrip: [string, string][] = [
      ["view", "board"],
      ["tag", "old"],
      ["group", "component"],
    ];
    rerender(
      <ViewUrlStateProvider initialEntries={oldQueryAfterRoundTrip}>
        <Probe />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("link", { name: "Target" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=board&tag=old&group=component&item=TARGET-1",
    );
  });
});

describe("ViewUrlStateProvider item drawer navigation", () => {
  let historyPush: MockInstance<History["pushState"]>;
  let historyReplace: MockInstance<History["replaceState"]>;

  function Controls() {
    const viewUrl = useViewUrlState();
    return (
      <>
        <button type="button" onClick={() => viewUrl.push((p) => p.set("item", "DEMO-2"))}>
          Open
        </button>
        <button type="button" onClick={() => viewUrl.replace((p) => p.set("item", "DEMO-3"))}>
          Swap
        </button>
        <button type="button" onClick={() => viewUrl.push((p) => p.delete("item"))}>
          Close
        </button>
        <button
          type="button"
          onClick={() => viewUrl.push((p) => {
            p.set("item", "DEMO-2");
            p.set("group", "priority");
          })}
        >
          Open grouped
        </button>
        <button type="button" onClick={() => viewUrl.push((p) => p.set("item", "DEMO-1"))}>
          Same
        </button>
      </>
    );
  }

  function renderControls(entries: [string, string][]) {
    render(
      <ViewUrlStateProvider initialEntries={entries}>
        <Controls />
      </ViewUrlStateProvider>,
    );
  }

  beforeEach(() => {
    mocks.pathname = "/b/DEMO";
    mocks.push.mockReset();
    mocks.replace.mockReset();
    historyPush = vi.spyOn(window.history, "pushState");
    historyReplace = vi.spyOn(window.history, "replaceState");
    return () => {
      historyPush.mockRestore();
      historyReplace.mockRestore();
    };
  });

  it("opens, switches and closes the item through the History API, not the router", () => {
    renderControls([["view", "list"], ["q", "auth"]]);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(historyPush).toHaveBeenLastCalledWith(null, "", "/b/DEMO?view=list&q=auth&item=DEMO-2");

    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(historyReplace).toHaveBeenLastCalledWith(null, "", "/b/DEMO?view=list&q=auth&item=DEMO-3");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(historyPush).toHaveBeenLastCalledWith(null, "", "/b/DEMO?view=list&q=auth");

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the router when the view state changes along with the item", () => {
    renderControls([["view", "list"]]);

    fireEvent.click(screen.getByRole("button", { name: "Open grouped" }));

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-2&group=priority");
    expect(historyPush).not.toHaveBeenCalled();
  });

  it("keeps the router when nothing changes", () => {
    renderControls([["view", "list"], ["item", "DEMO-1"]]);

    fireEvent.click(screen.getByRole("button", { name: "Same" }));

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-1");
    expect(historyPush).not.toHaveBeenCalled();
  });

  it("stays on the router while a router navigation is pending", () => {
    // A navigation that never settles keeps the provider's transition pending.
    mocks.push.mockImplementationOnce(() => {
      throw new Promise(() => {});
    });
    renderControls([["view", "list"]]);

    fireEvent.click(screen.getByRole("button", { name: "Open grouped" }));
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-3&group=priority");
    expect(historyReplace).not.toHaveBeenCalled();
  });
});
