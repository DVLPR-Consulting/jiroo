import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BacklogSelector } from "@/components/shell/backlog-selector";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: "/b/CASS",
  routeKey: "CASS" as string | undefined,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: mocks.routeKey }),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

const backlogs = [
  { id: "backlog-1", key: "CASS", name: "Pôle civil", color: "#2563eb" },
  { id: "backlog-2", key: "DEMO", name: "Démo", color: "#16a34a" },
];

function renderSelector() {
  return render(
    <ViewUrlStateProvider
      initialEntries={[
        ["view", "list"],
        ["item", "CASS-1"],
        ["q", "obsolete"],
        ["tag", "a"],
        ["tag", "b"],
      ]}
    >
      <BacklogSelector backlogs={backlogs} activeKey="CASS" />
    </ViewUrlStateProvider>,
  );
}

describe("BacklogSelector URL authority", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.pathname = "/b/CASS";
    mocks.routeKey = "CASS";
  });

  it("resets the active backlog through the provider authority", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole("button", { name: /Backlog CASS/ }));
    await user.click(screen.getByRole("menuitem", { name: /CASS.*Pôle civil/ }));

    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?tag=a&tag=b");
  });

  it("keeps another backlog as direct cross-page navigation", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole("button", { name: /Backlog CASS/ }));
    await user.click(screen.getByRole("menuitem", { name: /DEMO.*Démo/ }));

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO");
  });

  it("keeps Le point when switching project from it (JIR-107)", async () => {
    const user = userEvent.setup();
    mocks.pathname = "/b/CASS/le-point";
    renderSelector();

    await user.click(screen.getByRole("button", { name: /Backlog CASS/ }));
    await user.click(screen.getByRole("menuitem", { name: /DEMO.*Démo/ }));

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO/le-point");
  });

  it("navigates to the highlighted backlog directly from a global route", async () => {
    const user = userEvent.setup();
    mocks.pathname = "/mine";
    mocks.routeKey = undefined;
    renderSelector();

    await user.click(screen.getByRole("button", { name: /Backlog CASS/ }));
    await user.click(screen.getByRole("menuitem", { name: /CASS.*Pôle civil/ }));

    expect(mocks.push).toHaveBeenCalledWith("/b/CASS");
  });

  it("lists backlogs in the given order and marks favourites (JIR-82)", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[]}>
        <BacklogSelector
          backlogs={[
            { ...backlogs[1]!, starred: true },
            { ...backlogs[0]!, starred: false },
          ]}
          activeKey="CASS"
        />
      </ViewUrlStateProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Backlog CASS/ }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["DEMODémo", "CASSPôle civil"]);
    expect(within(items[0]!).getByRole("img", { name: "Favori" })).toBeInTheDocument();
    expect(within(items[1]!).queryByRole("img", { name: "Favori" })).not.toBeInTheDocument();
  });
});
