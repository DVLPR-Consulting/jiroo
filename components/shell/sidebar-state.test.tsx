import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";
import { useViewUrlState } from "@/components/shell/view-url-state";

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/CASS",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("view=board&tag=a&tag=b"),
}));

function Probe() {
  const { collapsed, toggle } = useSidebarState();
  return <button onClick={toggle}>{collapsed ? "collapsed" : "open"}</button>;
}

function UrlProbe({ label, value }: { label: string; value: string }) {
  const viewUrl = useViewUrlState();
  return (
    <a href={viewUrl.href((params) => params.set("probe", value))}>
      {label}
    </a>
  );
}

describe("SidebarStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.sidebar;
  });

  it("hydrates from the anti-flash attribute and persists toggles", async () => {
    const user = userEvent.setup();
    localStorage.setItem("jiroo-sidebar-collapsed", "true");
    document.documentElement.dataset.sidebar = "collapsed";
    render(
      <SidebarStateProvider>
        <Probe />
      </SidebarStateProvider>,
    );

    expect(screen.getByRole("button", { name: "collapsed" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "collapsed" }));

    expect(screen.getByRole("button", { name: "open" })).toBeVisible();
    expect(localStorage.getItem("jiroo-sidebar-collapsed")).toBe("false");
    expect(document.documentElement.dataset.sidebar).toBe("open");
  });

  it("changes the actual shell column when the shared state toggles", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppShell sidebar={<Probe />} topbar={<header>Topbar</header>}>
        Contenu
      </AppShell>,
    );
    const shell = container.firstElementChild;

    expect(shell).toHaveStyle({
      gridTemplateColumns: "248px minmax(0,1fr)",
    });

    await user.click(screen.getByRole("button", { name: "open" }));

    expect(screen.getByRole("button", { name: "collapsed" })).toBeVisible();
    expect(shell).toHaveStyle({
      gridTemplateColumns: "64px minmax(0,1fr)",
    });
  });

  it("shares one repeated-parameter URL authority across shell siblings", () => {
    render(
      <AppShell
        sidebar={<UrlProbe label="Sidebar URL" value="sidebar" />}
        topbar={<header>Topbar</header>}
      >
        <UrlProbe label="Page URL" value="page" />
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Sidebar URL" })).toHaveAttribute(
      "href",
      "/b/CASS?view=board&tag=a&tag=b&probe=sidebar",
    );
    expect(screen.getByRole("link", { name: "Page URL" })).toHaveAttribute(
      "href",
      "/b/CASS?view=board&tag=a&tag=b&probe=page",
    );
  });
});
