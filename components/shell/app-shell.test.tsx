import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "CASS" }),
  usePathname: () => "/b/CASS",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

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

function renderShell() {
  return render(
    <AppShell sidebar={<nav aria-label="Vues du projet">barre</nav>} topbar={<header>haut</header>}>
      <p>contenu</p>
    </AppShell>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.sidebar;
});

describe("AppShell", () => {
  it("lays out the phone column and hides the inline sidebar in CSS before the media query answers (JIR-127)", () => {
    // The server snapshot and the first client render both say "desktop".
    installMatchMedia(false);
    const { container } = renderShell();
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(frame.className).toContain("md:grid-cols-[248px_minmax(0,1fr)]");
    expect(frame.style.gridTemplateColumns).toBe("");
    const inlineSidebar = screen.getByRole("navigation", { name: "Vues du projet" }).parentElement as HTMLElement;
    expect(inlineSidebar.className).toBe("hidden md:contents");
    expect(screen.getByRole("main")).toHaveTextContent("contenu");
  });

  it("positions the frame and the main area so hidden absolute text cannot lengthen the page (JIR-162)", () => {
    // A row's visually hidden label is absolutely positioned: without a positioned
    // ancestor its containing block is the page, which then scrolls the whole shell.
    installMatchMedia(false);
    const { container } = renderShell();
    expect((container.firstElementChild as HTMLElement).className.split(" ")).toContain("relative");
    expect(screen.getByRole("main").className.split(" ")).toContain("relative");
  });

  it("narrows the desktop column to the saved collapsed width", () => {
    installMatchMedia(false);
    document.documentElement.dataset.sidebar = "collapsed";
    const { container } = renderShell();
    expect((container.firstElementChild as HTMLElement).className).toContain("md:grid-cols-[64px_minmax(0,1fr)]");
  });

  it("keeps the sidebar out of the flow on a phone until its drawer opens", () => {
    installMatchMedia(true);
    renderShell();
    expect(screen.queryByRole("navigation", { name: "Vues du projet" })).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("contenu");
  });
});
