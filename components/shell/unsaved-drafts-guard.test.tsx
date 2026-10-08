import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnsavedDraftsGuard } from "@/components/shell/unsaved-drafts-guard";
import { resetAutosaveRegistry, useAutosave } from "@/lib/autosave/use-autosave";

function beforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function editorWith(save: (value: string) => Promise<unknown>) {
  return renderHook(() =>
    useAutosave({
      user: "u1",
      key: "item-description:u1:item-1",
      initial: "A",
      save: save as never,
      delay: 900,
    }),
  );
}

describe("UnsavedDraftsGuard", () => {
  beforeEach(() => {
    resetAutosaveRegistry();
    render(<UnsavedDraftsGuard />);
  });
  afterEach(() => {
    resetAutosaveRegistry();
  });

  it("guards the unload only while a draft is unsaved", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result } = editorWith(save);
    expect(beforeUnload()).toBe(false);
    act(() => result.current.change("B"));
    expect(beforeUnload()).toBe(true);
    await act(() => result.current.flush());
    expect(beforeUnload()).toBe(false);
  });

  it("keeps guarding after the editor unmounted with a failed draft", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, error: "Indisponible" });
    const first = editorWith(save);
    act(() => first.result.current.change("B"));
    first.unmount();
    await act(async () => {});
    expect(beforeUnload()).toBe(true);
  });

  it("stops guarding once the draft is retried successfully", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Indisponible" })
      .mockResolvedValue({ ok: true });
    const first = editorWith(save);
    act(() => first.result.current.change("B"));
    first.unmount();
    await act(async () => {});
    const again = editorWith(save);
    await act(() => again.result.current.retry());
    again.unmount();
    await act(async () => {});
    expect(beforeUnload()).toBe(false);
  });

  it("stops guarding once the draft is discarded", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, error: "Indisponible" });
    const first = editorWith(save);
    act(() => first.result.current.change("B"));
    await act(() => first.result.current.flush());
    act(() => first.result.current.discard());
    first.unmount();
    await act(async () => {});
    expect(beforeUnload()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves every pending draft when the page is hidden, editor closed or not", async () => {
    let finish!: (value: unknown) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => (finish = res)))
      .mockResolvedValue({ ok: true });
    const { result } = editorWith(save);
    act(() => result.current.change("B"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    visibility.mockRestore();
    expect(save).toHaveBeenCalledWith("B");
    await act(async () => finish({ ok: true }));
  });
});
