import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalShortcuts } from "@/components/shortcuts/global-shortcuts";
import { KeyboardShortcutsProvider } from "@/components/shortcuts/keyboard-shortcuts-provider";
import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";

const mocks = vi.hoisted(() => ({ pathname: "/b/CASS", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function SidebarProbe() {
  const { collapsed } = useSidebarState();
  return <output aria-label="Barre latérale">{collapsed ? "repliée" : "ouverte"}</output>;
}

function renderShortcuts() {
  return render(
    <SidebarStateProvider>
      <KeyboardShortcutsProvider>
        <GlobalShortcuts />
        <SidebarProbe />
      </KeyboardShortcutsProvider>
    </SidebarStateProvider>,
  );
}

function press(...keys: string[]) {
  for (const key of keys) fireEvent.keyDown(document.body, { key });
}

describe("GlobalShortcuts", () => {
  beforeEach(() => {
    mocks.pathname = "/b/CASS";
    mocks.push.mockReset();
    localStorage.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it.each([
    [["g", "b"], "/b/CASS?view=backlog"],
    [["g", "a"], "/b/CASS?view=board"],
    [["g", "i"], "/b/CASS?view=list"],
    [["g", "t"], "/b/CASS?view=tree"],
    [["g", "v"], "/b/CASS/releases"],
    [["g", "r"], "/b/CASS/reports"],
    [["g", "u"], "/aide"],
  ])("navigates with %s", (keys, href) => {
    renderShortcuts();
    press(...keys);
    expect(mocks.push).toHaveBeenCalledWith(href);
  });

  it("uses the last backlog visited outside a backlog", () => {
    const { unmount } = renderShortcuts();
    unmount();
    mocks.pathname = "/aide";
    renderShortcuts();

    press("g", "a");

    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=board");
  });

  it("does nothing for a backlog destination when no backlog is known", () => {
    mocks.pathname = "/mine";
    renderShortcuts();
    press("g", "b");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("asks the search palette to open with /", () => {
    const listener = vi.fn();
    window.addEventListener("jiroo:open-search", listener);
    renderShortcuts();

    const notCancelled = fireEvent.keyDown(document.body, { key: "/", cancelable: true });

    expect(listener).toHaveBeenCalledTimes(1);
    // Firefox would otherwise open its quick find bar.
    expect(notCancelled).toBe(false);
    window.removeEventListener("jiroo:open-search", listener);
  });

  it("moves through the view's items with j / k and opens one with o", () => {
    const opened = vi.fn();
    render(
      <SidebarStateProvider>
        <KeyboardShortcutsProvider>
          <GlobalShortcuts />
          <main>
            {["CASS-1", "CASS-2"].map((itemKey) => (
              <button
                key={itemKey}
                type="button"
                data-shortcut-item={itemKey}
                onClick={() => opened(itemKey)}
              >
                {itemKey}
              </button>
            ))}
          </main>
        </KeyboardShortcutsProvider>
      </SidebarStateProvider>,
    );

    press("j");
    expect(screen.getByRole("button", { name: "CASS-1" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "j" });
    expect(screen.getByRole("button", { name: "CASS-2" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "k" });
    expect(screen.getByRole("button", { name: "CASS-1" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "o" });
    expect(opened).toHaveBeenCalledWith("CASS-1");
  });

  it("toggles the sidebar with [", () => {
    renderShortcuts();
    expect(screen.getByLabelText("Barre latérale")).toHaveTextContent("ouverte");
    press("[");
    expect(screen.getByLabelText("Barre latérale")).toHaveTextContent("repliée");
  });
});
