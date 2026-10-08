import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "@/lib/autosave/use-autosave";

function beforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("saves after the debounce and exposes the status", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAutosave({ initial: "", save, delay: 900 }));
    act(() => result.current.change("texte"));
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(save).toHaveBeenCalledWith("texte");
    expect(result.current.status).toBe("saved");
    expect(result.current.pending).toBe(false);
  });

  it("uses the latest save callback", async () => {
    const first = vi.fn().mockResolvedValue({ ok: true });
    const second = vi.fn().mockResolvedValue({ ok: true });
    const { result, rerender } = renderHook(
      ({ save }) => useAutosave({ initial: "", save, delay: 900 }),
      { initialProps: { save: first } },
    );
    rerender({ save: second });
    act(() => result.current.change("x"));
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("x");
  });

  it("flushes a pending change on unmount", () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result, unmount } = renderHook(() => useAutosave({ initial: "", save, delay: 900 }));
    act(() => result.current.change("pas perdu"));
    unmount();
    expect(save).toHaveBeenCalledWith("pas perdu");
  });

  it("guards the page unload only while a change is pending", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAutosave({ initial: "", save, delay: 900 }));
    expect(beforeUnload()).toBe(false);
    act(() => result.current.change("en cours"));
    expect(beforeUnload()).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(beforeUnload()).toBe(false);
  });

  it("flushes when the page is hidden", () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAutosave({ initial: "", save, delay: 900 }));
    act(() => result.current.change("onglet fermé"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(save).toHaveBeenCalledWith("onglet fermé");
    visibility.mockRestore();
  });

  it("reports a failure and retries on demand", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Refusé." })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useAutosave({ initial: "", save, delay: 900 }));
    act(() => result.current.change("v"));
    await act(() => result.current.flush());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Refusé.");
    await act(() => result.current.retry());
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });
});
