import { Suspense, use, useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_DETAIL_SHEET_EXIT_MS,
  ItemDetailNotFound,
  ItemDetailSheet,
} from "@/components/items/item-detail-sheet";
import { DetailPanelSkeleton } from "@/components/items/view-skeletons";
import {
  useViewUrlState,
  ViewUrlStateProvider,
} from "@/components/shell/view-url-state";
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
      "data-open:animate-in",
      "data-open:slide-in-from-right",
      "data-closed:animate-out",
      "data-closed:slide-out-to-right",
      "duration-[220ms]",
      "ease-[cubic-bezier(.32,.72,0,1)]",
      "motion-reduce:data-open:animate-none",
      "motion-reduce:data-closed:animate-none",
    );
    // The drawer only slides; it never inherits the center dialog's fade.
    expect(dialog.className).not.toMatch(/fade-(in|out)/);
  });

  it("fades a dimmed, unblurred overlay in step with the drawer", () => {
    renderSheet(<DialogTitle>CASS-4 — Titre</DialogTitle>);

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).toHaveClass(
      "data-open:fade-in-0",
      "data-closed:fade-out-0",
      "duration-[180ms]",
      "supports-backdrop-filter:backdrop-blur-none",
      "motion-reduce:data-open:animate-none",
      "motion-reduce:data-closed:animate-none",
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

  describe("deferred close under interruptions", () => {
    const viewUrl: { current: ReturnType<typeof useViewUrlState> | null } = {
      current: null,
    };
    function CaptureViewUrl() {
      const state = useViewUrlState();
      useEffect(() => {
        viewUrl.current = state;
      });
      return null;
    }
    function tree(itemKey: string, extra: [string, string][] = []) {
      return (
        <ViewUrlStateProvider
          initialEntries={[["view", "backlog"], ...extra, ["item", itemKey]]}
        >
          <CaptureViewUrl />
          <ItemDetailSheet itemKey={itemKey}>
            <DialogTitle>{itemKey} — Titre</DialogTitle>
          </ItemDetailSheet>
        </ViewUrlStateProvider>
      );
    }
    function pressEscape() {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    }

    beforeEach(() => {
      vi.useFakeTimers();
      mocks.replace.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
      viewUrl.current = null;
    });

    it("navigates exactly when the 220ms exit slide ends, not a millisecond before", () => {
      render(tree("CASS-4"));
      pressEscape();

      act(() => vi.advanceTimersByTime(ITEM_DETAIL_SHEET_EXIT_MS - 1));
      expect(ITEM_DETAIL_SHEET_EXIT_MS).toBe(220);
      expect(mocks.push).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(1));
      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=backlog");
    });

    it("never navigates after being unmounted during the exit slide", () => {
      const rendered = render(tree("CASS-4"));
      pressEscape();
      act(() => vi.advanceTimersByTime(100));

      rendered.unmount();
      act(() => vi.advanceTimersByTime(1000));

      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("does not let A's deferred close dismiss B opened during the delay", () => {
      const rendered = render(tree("CASS-4"));
      pressEscape();
      act(() => vi.advanceTimersByTime(100));

      // The server re-renders with B after a row click during A's exit.
      rendered.rerender(tree("CASS-5"));
      act(() => vi.advanceTimersByTime(1000));

      expect(mocks.push).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "CASS-5 — Titre" })).toBeVisible();
    });

    it("keeps URL params changed during the delay and only drops the item", () => {
      render(tree("CASS-4"));
      pressEscape();
      act(() => {
        viewUrl.current!.replace((params) => params.set("sort", "key"));
        vi.advanceTimersByTime(ITEM_DETAIL_SHEET_EXIT_MS);
      });

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=backlog&sort=key");
    });
  });
});

