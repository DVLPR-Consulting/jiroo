import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAutosaveRegistry, useAutosave } from "@/lib/autosave/use-autosave";

beforeEach(() => {
  resetAutosaveRegistry();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("saves after the debounce and exposes the status", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAutosave({ key: "k", initial: "", save, delay: 900 }));
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
      ({ save }) => useAutosave({ key: "k", initial: "", save, delay: 900 }),
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
    const { result, unmount } = renderHook(() => useAutosave({ key: "k", initial: "", save, delay: 900 }));
    act(() => result.current.change("pas perdu"));
    unmount();
    expect(save).toHaveBeenCalledWith("pas perdu");
  });

  it("reports a failure and retries on demand", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Refusé." })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useAutosave({ key: "k", initial: "", save, delay: 900 }));
    act(() => result.current.change("v"));
    await act(() => result.current.flush());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Refusé.");
    await act(() => result.current.retry());
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });
});
