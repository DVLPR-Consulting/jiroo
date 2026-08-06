import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
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

  it("places one compact sidebar trigger before the separator and breadcrumb", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AppShell
          sidebar={<aside>Navigation</aside>}
          topbar={
            <Topbar
              notifications={[]}
              unreadCount={0}
              backlogs={[
                { id: "backlog-1", key: "CASS", name: "Cour de cassation" },
              ]}
              views={[]}
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
    expect(topbar?.children[1]).toHaveAttribute(
      "data-slot",
      "sidebar-trigger-separator",
    );
    expect(topbar?.children[2]).toHaveAttribute(
      "data-slot",
      "shell-breadcrumb",
    );

    await user.click(trigger);

    expect(
      screen.getByRole("button", { name: "Déplier la barre latérale" }),
    ).toBeVisible();
  });
});
