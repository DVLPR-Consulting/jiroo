import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { SidebarTrigger } from "@/components/shell/sidebar-trigger";

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

function installMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

describe("SidebarStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.sidebar;
    installMatchMedia(false);
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

  it("does not place the collapse control on the sidebar boundary", () => {
    render(
      <AppShell sidebar={<Probe />} topbar={<header>Topbar</header>}>
        Contenu
      </AppShell>,
    );

    expect(
      screen.queryByRole("button", { name: "Replier la barre latérale" }),
    ).not.toBeInTheDocument();
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

  it("uses one content column and opens the sidebar as a modal drawer on mobile", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();
    const { container } = render(
      <AppShell
        sidebar={<aside>Navigation mobile</aside>}
        topbar={<SidebarTrigger />}
      >
        Contenu
      </AppShell>,
    );

    expect(container.firstElementChild).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr)",
    });
    expect(screen.queryByText("Navigation mobile")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ouvrir la navigation" }));
    expect(
      screen.getByRole("dialog", { name: "Navigation principale" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Navigation principale" }),
    ).not.toBeInTheDocument();
  });

  it("closes the mobile drawer after ordinary navigation but preserves modified clicks", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();
    render(
      <AppShell
        sidebar={
          <Link href="/b/CASS" onClick={(event) => event.preventDefault()}>
            Tous les items
          </Link>
        }
        topbar={<SidebarTrigger />}
      >
        Contenu
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Ouvrir la navigation" }));
    fireEvent.click(screen.getByRole("link", { name: "Tous les items" }), {
      ctrlKey: true,
    });
    expect(screen.getByRole("dialog", { name: "Navigation principale" })).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "Tous les items" }));
    expect(
      screen.queryByRole("dialog", { name: "Navigation principale" }),
    ).not.toBeInTheDocument();
  });
});
