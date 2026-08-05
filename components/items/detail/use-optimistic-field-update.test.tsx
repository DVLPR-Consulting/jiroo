import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOptimisticFieldUpdate } from "@/components/items/detail/use-optimistic-field-update";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/actions/items", () => ({
  updateItemAction: mocks.updateItemAction,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useOptimisticFieldUpdate", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("keeps the optimistic revision when a stale prop arrives during the request", async () => {
    const request = deferred<{ ok: true; item: object }>();
    mocks.updateItemAction.mockReturnValueOnce(request.promise);
    const { result, rerender } = renderHook(
      ({ value }) =>
        useOptimisticFieldUpdate({
          value,
          itemId: "item-1",
          backlogKey: "DEMO",
          toPatch: (next: string) => ({ reporterId: next }),
        }),
      { initialProps: { value: "u1" } },
    );

    act(() => result.current.update("u2"));
    expect(result.current.value).toBe("u2");
    expect(result.current.pending).toBe(true);

    rerender({ value: "stale-server-value" });
    expect(result.current.value).toBe("u2");

    request.resolve({ ok: true, item: {} });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.value).toBe("u2");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("rolls back and exposes a safe error when the request throws", async () => {
    mocks.updateItemAction.mockRejectedValueOnce(new Error("database details"));
    const { result } = renderHook(() =>
      useOptimisticFieldUpdate({
        value: 1,
        itemId: "item-1",
        backlogKey: "DEMO",
        toPatch: (next: number) => ({ priority: next }),
      }),
    );

    act(() => result.current.update(3));
    expect(result.current.value).toBe(3);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.value).toBe(1);
    expect(result.current.error).toBe("Mise à jour impossible.");
  });
});
