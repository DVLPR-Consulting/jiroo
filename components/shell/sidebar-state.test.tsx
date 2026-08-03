import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";

function Probe() {
  const { collapsed, toggle } = useSidebarState();
  return <button onClick={toggle}>{collapsed ? "collapsed" : "open"}</button>;
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

  it("uses a 64px shell column when the sidebar is collapsed", () => {
    document.documentElement.dataset.sidebar = "collapsed";
    const { container } = render(
      <AppShell sidebar={<aside>Sidebar</aside>} topbar={<header>Topbar</header>}>
        Contenu
      </AppShell>,
    );

    expect(container.firstElementChild).toHaveStyle({
      gridTemplateColumns: "64px minmax(0,1fr)",
    });
  });
});
