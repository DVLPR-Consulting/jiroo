import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { __resetToastsForTest, toast } from "@/lib/toast";

beforeEach(() => {
  __resetToastsForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toaster actions", () => {
  it("awaits the action, disables it while pending, and dismisses on success", async () => {
    let resolveAction!: () => void;
    const actionPromise = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    const run = vi.fn(() => actionPromise);
    toast.success("Item créé.", { action: { label: "Annuler", run } });
    const user = userEvent.setup();
    render(<Toaster />);

    const action = screen.getByRole("button", { name: "Annuler" });
    await user.click(action);

    expect(run).toHaveBeenCalledOnce();
    expect(action).toBeDisabled();
    expect(screen.getByText("Item créé.")).toBeVisible();

    resolveAction();

    await waitFor(() => {
      expect(screen.queryByText("Item créé.")).not.toBeInTheDocument();
    });
  });

  it("keeps the original toast and reports a safe error when the action rejects", async () => {
    const run = vi.fn().mockRejectedValue(new Error("sensitive service failure"));
    toast.success("Item supprimé.", { action: { label: "Annuler", run } });
    const user = userEvent.setup();
    render(<Toaster />);

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(await screen.findByText("Annulation impossible.")).toBeVisible();
    expect(screen.getByText("Item supprimé.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeEnabled();
  });

  it("pauses auto-dismiss while the action is pending and resumes it after failure", async () => {
    vi.useFakeTimers();
    let rejectAction!: (reason: Error) => void;
    const actionPromise = new Promise<void>((_resolve, reject) => {
      rejectAction = reject;
    });
    toast.success("Item supprimé.", {
      action: { label: "Annuler", run: () => actionPromise },
    });
    render(<Toaster />);

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    act(() => vi.advanceTimersByTime(4000));

    expect(screen.getByText("Item supprimé.")).toBeVisible();

    await act(async () => {
      rejectAction(new Error("restore failed"));
      await actionPromise.catch(() => undefined);
    });

    expect(screen.getByText("Item supprimé.")).toBeVisible();
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText("Item supprimé.")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Item supprimé.")).not.toBeInTheDocument();
  });
});

describe("Toaster motion", () => {
  it("slides toasts in, but not for users who prefer reduced motion", () => {
    toast.success("Item créé.");
    render(<Toaster />);

    const card = screen.getByText("Item créé.").parentElement;
    expect(card).toHaveClass(
      "animate-in",
      "fade-in",
      "slide-in-from-bottom-2",
      "motion-reduce:animate-none",
    );
  });
});
