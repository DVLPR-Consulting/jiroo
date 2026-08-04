import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
