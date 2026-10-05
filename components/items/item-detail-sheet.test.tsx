import { Suspense, use } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ItemDetailNotFound,
  ItemDetailSheet,
} from "@/components/items/item-detail-sheet";
import { DetailPanelSkeleton } from "@/components/items/view-skeletons";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import { DialogTitle } from "@/components/ui/dialog";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/CASS",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: vi.fn() }),
}));

function renderSheet(children: React.ReactNode, itemKey = "CASS-4") {
  return render(
    <ViewUrlStateProvider initialEntries={[["view", "backlog"], ["item", itemKey]]}>
      <ItemDetailSheet itemKey={itemKey}>{children}</ItemDetailSheet>
    </ViewUrlStateProvider>,
  );
}

function Loaded({ ready }: { ready: Promise<string> }) {
  const title = use(ready);
  return <DialogTitle>{title}</DialogTitle>;
}

describe("ItemDetailSheet", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    window.history.replaceState({}, "", "/b/CASS?view=backlog&item=CASS-4");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("slides the drawer from the right on Radix data-state, with no motion when reduced", () => {
    renderSheet(<DialogTitle>CASS-4 — Titre</DialogTitle>);

    const dialog = screen.getByRole("dialog", { name: "CASS-4 — Titre" });
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog).toHaveClass(
      "data-[state=open]:animate-in",
      "data-[state=open]:slide-in-from-right",
      "data-[state=closed]:animate-out",
      "data-[state=closed]:slide-out-to-right",
      "duration-[220ms]",
      "ease-[cubic-bezier(.32,.72,0,1)]",
      "motion-reduce:data-[state=open]:animate-none",
      "motion-reduce:data-[state=closed]:animate-none",
    );
  });

  it("fades a dimmed, unblurred overlay in step with the drawer", () => {
    renderSheet(<DialogTitle>CASS-4 — Titre</DialogTitle>);

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).toHaveClass(
      "data-[state=open]:fade-in-0",
      "data-[state=closed]:fade-out-0",
      "supports-backdrop-filter:backdrop-blur-none",
      "motion-reduce:data-[state=open]:animate-none",
    );
    expect(overlay).not.toHaveClass("supports-backdrop-filter:backdrop-blur-xs");
  });

  it("keeps the same drawer mounted while the streamed detail replaces its skeleton", async () => {
    let resolve!: (title: string) => void;
    const ready = new Promise<string>((done) => {
      resolve = done;
    });
    // An async act lets React track the suspended promise and retry on resolve.
    await act(async () => {
      renderSheet(
        <Suspense fallback={<DetailPanelSkeleton />}>
          <Loaded ready={ready} />
        </Suspense>,
      );
    });

    const loadingDialog = screen.getByRole("dialog", {
      name: "Chargement du panneau de détail",
    });
    expect(screen.getByRole("status", { name: "Chargement du panneau de détail" }))
      .toBeInTheDocument();

    await act(async () => {
      resolve("CASS-4 — Titre");
      await ready;
    });

    const loadedDialog = await screen.findByRole("dialog", { name: "CASS-4 — Titre" });
    expect(loadedDialog).toBe(loadingDialog);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lets the exit slide finish before dropping the item from the URL", async () => {
    const user = userEvent.setup();
    renderSheet(<DialogTitle>CASS-4 — Titre</DialogTitle>);

    await user.keyboard("{Escape}");

    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=backlog"));
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("drops the item immediately when the user prefers reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    renderSheet(<DialogTitle>CASS-4 — Titre</DialogTitle>);

    await user.keyboard("{Escape}");

    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=backlog");
  });

  it("explains a key that no longer resolves inside the open drawer", async () => {
    const user = userEvent.setup();
    renderSheet(<ItemDetailNotFound itemKey="CASS-404" />, "CASS-404");

    expect(screen.getByRole("dialog", { name: "Item CASS-404 introuvable" }))
      .toHaveTextContent("Cet item est introuvable ou a été supprimé.");
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=backlog"));
  });
});
