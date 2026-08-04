import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  subscribe,
  getSnapshot,
  push,
  dismiss,
  toast,
  __resetToastsForTest,
} from "./toast";

beforeEach(() => {
  __resetToastsForTest();
});

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

describe("push", () => {
  it("adds a toast with an incrementing id, correct variant and message", () => {
    const id1 = push("success", "Hello");
    const id2 = push("error", "Oops");

    expect(id1).toBe(1);
    expect(id2).toBe(2);

    const [t1, t2] = getSnapshot();
    expect(t1).toEqual({ id: 1, variant: "success", message: "Hello" });
    expect(t2).toEqual({ id: 2, variant: "error", message: "Oops" });
  });

  it("returns consecutive ids starting at 1 after a reset", () => {
    push("success", "a");
    push("error", "b");
    __resetToastsForTest();
    const id = push("success", "c");
    expect(id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getSnapshot — reference stability
// ---------------------------------------------------------------------------

describe("getSnapshot reference stability", () => {
  it("returns the SAME reference on consecutive reads when nothing changed", () => {
    push("success", "stable");
    const ref1 = getSnapshot();
    const ref2 = getSnapshot();
    expect(ref1).toBe(ref2);
  });

  it("returns a NEW reference after push", () => {
    const before = getSnapshot();
    push("success", "new toast");
    const after = getSnapshot();
    expect(after).not.toBe(before);
  });

  it("returns a NEW reference after dismiss", () => {
    const id = push("success", "to remove");
    const before = getSnapshot();
    dismiss(id);
    const after = getSnapshot();
    expect(after).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// dismiss
// ---------------------------------------------------------------------------

describe("dismiss", () => {
  it("removes the toast with the given id and leaves others", () => {
    push("success", "keep");
    const removeId = push("error", "remove me");
    push("success", "also keep");

    dismiss(removeId);

    const snap = getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap.find((t) => t.id === removeId)).toBeUndefined();
    expect(snap.map((t) => t.message)).toEqual(["keep", "also keep"]);
  });

  it("is an idempotent no-op for an unknown id (no new array, no notify)", () => {
    push("success", "safe");
    const listener = vi.fn();
    subscribe(listener);
    const before = getSnapshot();

    dismiss(999);

    // No state change: same reference, same length, listener untouched.
    expect(getSnapshot()).toBe(before);
    expect(getSnapshot()).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// subscribe / unsubscribe
// ---------------------------------------------------------------------------

describe("subscribe", () => {
  it("listener is called on push", () => {
    const listener = vi.fn();
    subscribe(listener);
    push("success", "hi");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listener is called on dismiss", () => {
    const listener = vi.fn();
    subscribe(listener);
    const id = push("error", "bye");
    listener.mockClear();
    dismiss(id);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further calls", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    push("success", "first");
    unsubscribe();
    push("success", "second");
    dismiss(1);
    // Listener should have been called only for the first push.
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// toast public API
// ---------------------------------------------------------------------------

describe("toast", () => {
  it("stores an optional action on a success toast", () => {
    const run = vi.fn();

    toast.success("Item créé.", { action: { label: "Annuler", run } });

    expect(getSnapshot()[0]?.action).toEqual({ label: "Annuler", run });
  });

  it("preserves the exact toast shape when called without options", () => {
    toast.success("All good");
    toast.error("Something failed");

    expect(getSnapshot()).toEqual([
      { id: 1, variant: "success", message: "All good" },
      { id: 2, variant: "error", message: "Something failed" },
    ]);
  });

  it("clears action callbacks on reset", () => {
    const run = vi.fn();
    toast.success("Item créé.", { action: { label: "Annuler", run } });

    __resetToastsForTest();
    toast.success("After reset");

    expect(getSnapshot()).toEqual([
      { id: 1, variant: "success", message: "After reset" },
    ]);
  });

  it("toast.success sets variant success", () => {
    const id = toast.success("All good");
    const t = getSnapshot().find((x) => x.id === id);
    expect(t?.variant).toBe("success");
    expect(t?.message).toBe("All good");
  });

  it("toast.error sets variant error", () => {
    const id = toast.error("Something failed");
    const t = getSnapshot().find((x) => x.id === id);
    expect(t?.variant).toBe("error");
    expect(t?.message).toBe("Something failed");
  });
});
