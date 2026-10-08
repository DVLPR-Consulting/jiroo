import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KeyboardShortcutsProvider,
  useShortcutHandler,
} from "@/components/shortcuts/keyboard-shortcuts-provider";
import { SEQUENCE_TIMEOUT_MS } from "@/lib/shortcuts/engine";
import type { SequenceShortcutId } from "@/lib/shortcuts/registry";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

function Bind({ id, handler }: { id: SequenceShortcutId; handler: (() => void) | null }) {
  useShortcutHandler(id, handler);
  return null;
}

function press(key: string, target: Element | Document = document.body, init: KeyboardEventInit = {}) {
  return fireEvent.keyDown(target, { key, bubbles: true, cancelable: true, ...init });
}

describe("KeyboardShortcutsProvider", () => {
  it("opens the « Raccourcis clavier » dialog with ? and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcutsProvider>{null}</KeyboardShortcutsProvider>);

    press("?", document.body, { shiftKey: true });

    const dialog = await screen.findByRole("dialog", { name: "Raccourcis clavier" });
    expect(dialog).toBeVisible();
    // Grouped list straight from the registry.
    expect(screen.getByRole("heading", { name: "Ticket ouvert" })).toBeVisible();
    expect(screen.getByText("M’assigner le ticket")).toBeVisible();
    expect(screen.getByText("G puis B")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("runs the latest handler registered for a matched sequence", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <KeyboardShortcutsProvider>
        <Bind id="go.backlog" handler={first} />
        <Bind id="go.backlog" handler={second} />
      </KeyboardShortcutsProvider>,
    );

    press("g");
    const notCancelled = press("b");

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(notCancelled).toBe(false);

    rerender(
      <KeyboardShortcutsProvider>
        <Bind id="go.backlog" handler={first} />
        <Bind id="go.backlog" handler={null} />
      </KeyboardShortcutsProvider>,
    );
    press("g");
    press("b");
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("drops a g sequence after the timeout", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const handler = vi.fn();
    render(
      <KeyboardShortcutsProvider>
        <Bind id="go.board" handler={handler} />
      </KeyboardShortcutsProvider>,
    );

    press("g");
    vi.setSystemTime(Date.now() + SEQUENCE_TIMEOUT_MS + 50);
    press("a");

    expect(handler).not.toHaveBeenCalled();
  });

  it("leaves keys alone without a handler (e.g. no permission)", () => {
    render(
      <KeyboardShortcutsProvider>
        <Bind id="item.assignToMe" handler={null} />
      </KeyboardShortcutsProvider>,
    );
    expect(press("i")).toBe(true);
  });

  it("never fires while typing in a field", () => {
    const handler = vi.fn();
    render(
      <KeyboardShortcutsProvider>
        <Bind id="list.next" handler={handler} />
        <input aria-label="Champ" />
        <textarea aria-label="Zone" />
        <div aria-label="Éditeur" contentEditable className="ProseMirror" />
      </KeyboardShortcutsProvider>,
    );

    press("j", screen.getByLabelText("Champ"));
    press("j", screen.getByLabelText("Zone"));
    press("j", screen.getByLabelText("Éditeur"));
    press("?", screen.getByLabelText("Champ"), { shiftKey: true });

    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps list keys on the page and item keys in the item drawer", () => {
    const next = vi.fn();
    const comment = vi.fn();
    render(
      <KeyboardShortcutsProvider>
        <Bind id="list.next" handler={next} />
        <Bind id="item.comment" handler={comment} />
        <div role="dialog" data-shortcut-scope="item">
          <button type="button">Dans le tiroir</button>
        </div>
        <div role="dialog">
          <button type="button">Autre dialogue</button>
        </div>
      </KeyboardShortcutsProvider>,
    );
    const inDrawer = screen.getByRole("button", { name: "Dans le tiroir" });
    const inOtherDialog = screen.getByRole("button", { name: "Autre dialogue" });

    press("m");
    press("j", inDrawer);
    expect(comment).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();

    press("m", inDrawer);
    press("j");
    expect(comment).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);

    press("m", inOtherDialog);
    press("j", inOtherDialog);
    expect(comment).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does nothing once single-key shortcuts are turned off, and can turn them back on", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(
      <KeyboardShortcutsProvider>
        <Bind id="list.next" handler={handler} />
      </KeyboardShortcutsProvider>,
    );

    press("?", document.body, { shiftKey: true });
    const toggle = await screen.findByRole("switch", { name: /Raccourcis à une touche/ });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem("jiroo-shortcuts-enabled")).toBe("false");
    await user.keyboard("{Escape}");

    press("j");
    press("?", document.body, { shiftKey: true });
    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => {
      window.localStorage.setItem("jiroo-shortcuts-enabled", "true");
      window.dispatchEvent(new StorageEvent("storage", { key: "jiroo-shortcuts-enabled" }));
    });
    press("j");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("is a no-op outside the provider", () => {
    const handler = vi.fn();
    render(<Bind id="list.next" handler={handler} />);
    press("j");
    expect(handler).not.toHaveBeenCalled();
  });
});
