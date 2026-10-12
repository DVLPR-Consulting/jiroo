import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { TopbarCreate } from "@/components/shell/topbar-create";
import { CreateItemTrigger } from "@/components/shell/create-item-trigger";
import { ThemeProvider } from "@/components/theme/theme-provider";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "CASS" }),
  usePathname: () => "/b/CASS",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Topbar", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.sidebar = "open";
  });

  it("leads with one compact sidebar trigger and leaves the breadcrumb to the page", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AppShell
          sidebar={<aside>Navigation</aside>}
          topbar={
            <Topbar
              notifications={[]}
              unreadCount={0}
            />
          }
        >
          Contenu
        </AppShell>
      </ThemeProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Replier la barre latérale",
    });
    const topbar = trigger.closest('[data-slot="shell-topbar"]');

    expect(trigger).toHaveClass("size-8");
    expect(trigger).not.toHaveClass("absolute", "border", "shadow-sm");
    expect(trigger).toHaveClass("focus-visible:ring-[var(--ring)]");
    expect(trigger.querySelector(".lucide-panel-left")).toBeInTheDocument();
    expect(topbar?.children[0]).toBe(trigger);
    expect(topbar?.children[1]).toHaveAttribute("data-slot", "topbar-center");
    expect(screen.queryByRole("navigation", { name: "Fil d’Ariane" })).not.toBeInTheDocument();

    await user.click(trigger);

    expect(
      screen.getByRole("button", { name: "Déplier la barre latérale" }),
    ).toBeVisible();
  });

  it("shows the help link next to the notifications and theme controls", () => {
    render(
      <ThemeProvider>
        <AppShell
          sidebar={<aside>Navigation</aside>}
          topbar={
            <Topbar notifications={[]} unreadCount={0} />
          }
        >
          Contenu
        </AppShell>
      </ThemeProvider>,
    );

    const help = screen.getByRole("link", { name: "Aide" });
    expect(help).toHaveAttribute("href", "/aide");
    const actions = help.parentElement;
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "Notifications" }),
    );
    expect(actions).toContainElement(
      screen.getByRole("button", { name: /Activer le thème/ }),
    );
  });

  it("centres the search field and lands the page's create action beside it", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <ThemeProvider>
        <AppShell
          sidebar={<aside>Navigation</aside>}
          topbar={<Topbar notifications={[]} unreadCount={0} />}
        >
          <TopbarCreate>
            <CreateItemTrigger onClick={onCreate} />
          </TopbarCreate>
        </AppShell>
      </ThemeProvider>,
    );

    const search = screen.getByRole("button", { name: "Rechercher un item" });
    const create = await screen.findByRole("button", { name: "Créer" });
    const centre = search.closest('[data-slot="topbar-center"]');
    expect(centre).toContainElement(create);
    expect(search.compareDocumentPosition(create)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(create).toHaveAttribute("title", "Créer un item (C)");
    await user.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("shows no create action on pages that do not provide one", () => {
    render(
      <ThemeProvider>
        <AppShell
          sidebar={<aside>Navigation</aside>}
          topbar={<Topbar notifications={[]} unreadCount={0} />}
        >
          Contenu
        </AppShell>
      </ThemeProvider>,
    );

    expect(screen.queryByRole("button", { name: "Créer" })).not.toBeInTheDocument();
  });
});
