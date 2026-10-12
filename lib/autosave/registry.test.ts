import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaveScheduler, type SaveResult } from "@/lib/autosave/scheduler";
import {
  acquireDraft,
  clearDrafts,
  flushAllDrafts,
  hasUnsavedDrafts,
  isDraftKept,
  releaseDraft,
  retainDraft,
  setActiveDraftUser,
} from "@/lib/autosave/registry";

function deferredSave() {
  const replies: ((result: SaveResult) => void)[] = [];
  const save = vi.fn(
    () => new Promise<SaveResult>((resolve) => replies.push(resolve)),
  );
  return { save, replies };
}

function draftOf(user: string, save: (value: string) => Promise<SaveResult>) {
  return acquireDraft(user, `item-description:${user}:item-1`, () =>
    createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
  ).scheduler;
}

describe("draft registry purge", () => {
  beforeEach(() => clearDrafts());

  it.each([
    ["success", { ok: true } as SaveResult],
    ["failure", { ok: false, error: "x" } as SaveResult],
  ])("clearing with a request in flight sends nothing more (%s)", async (_, reply) => {
    const { save, replies } = deferredSave();
    const alice = draftOf("alice", save);
    alice.change("B");
    void alice.flush();
    clearDrafts();
    replies[0]!(reply);
    await new Promise((res) => setTimeout(res, 0));
    expect(save).toHaveBeenCalledTimes(1);
    expect(hasUnsavedDrafts()).toBe(false);
  });

  it.each([
    ["success", { ok: true } as SaveResult],
    ["failure", { ok: false, error: "x" } as SaveResult],
  ])("another account taking over sends nothing more (%s)", async (_, reply) => {
    const { save, replies } = deferredSave();
    const alice = draftOf("alice", save);
    alice.change("B");
    void alice.flush();
    draftOf("bob", vi.fn());
    replies[0]!(reply);
    await new Promise((res) => setTimeout(res, 0));
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("active draft user", () => {
  beforeEach(() => clearDrafts());

  async function failedDraft(user: string) {
    const save = vi.fn().mockResolvedValue({ ok: false, error: "x" });
    const scheduler = draftOf(user, save);
    scheduler.change("B");
    await scheduler.flush();
    return save;
  }

  it("switching user drops the other user's drafts before anything can flush them", async () => {
    const save = await failedDraft("alice");
    setActiveDraftUser("bob");
    await flushAllDrafts();
    expect(save).toHaveBeenCalledTimes(1);
    expect(hasUnsavedDrafts()).toBe(false);
  });

  it("flushes nothing without an active user, but still reports the unsaved draft", async () => {
    const save = await failedDraft("alice");
    setActiveDraftUser(null);
    await flushAllDrafts();
    expect(save).toHaveBeenCalledTimes(1);
    expect(hasUnsavedDrafts()).toBe(true);
  });

  it("flushes the active user's drafts", async () => {
    const save = await failedDraft("alice");
    setActiveDraftUser(null);
    setActiveDraftUser("alice");
    await flushAllDrafts();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("release without an active user", () => {
  beforeEach(() => clearDrafts());

  it("keeps the draft as is: neither sent nor dropped", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const entry = acquireDraft("alice", "k", () =>
      createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
    );
    retainDraft(entry);
    entry.scheduler.change("B");
    setActiveDraftUser(null);
    releaseDraft(entry);
    await new Promise((res) => setTimeout(res, 0));
    expect(isDraftKept(entry)).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(hasUnsavedDrafts()).toBe(true);
  });

  it("does not send an armed debounce once the session is inactive", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn().mockResolvedValue({ ok: true });
      const entry = acquireDraft("alice", "k", () =>
        createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
      );
      retainDraft(entry);
      entry.scheduler.change("B");
      setActiveDraftUser(null);
      releaseDraft(entry);
      await vi.advanceTimersByTimeAsync(5000);
      expect(save).not.toHaveBeenCalled();
      expect(isDraftKept(entry)).toBe(true);
      expect(hasUnsavedDrafts()).toBe(true);

      // Its owner comes back: the kept draft is sent after the debounce.
      setActiveDraftUser("alice");
      await vi.advanceTimersByTimeAsync(899);
      expect(save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledExactlyOnceWith("B");
      expect(hasUnsavedDrafts()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts no next save after the request in flight when the session ends", async () => {
    let resolve!: (result: { ok: true }) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => (resolve = res)))
      .mockResolvedValue({ ok: true });
    const entry = acquireDraft("alice", "k", () =>
      createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
    );
    retainDraft(entry);
    entry.scheduler.change("B");
    void entry.scheduler.flush();
    entry.scheduler.change("C");
    setActiveDraftUser(null);
    resolve({ ok: true });
    await new Promise((res) => setTimeout(res, 0));
    expect(save).toHaveBeenCalledExactlyOnceWith("B");
    expect(hasUnsavedDrafts()).toBe(true);

    setActiveDraftUser("alice");
    await flushAllDrafts();
    expect(save).toHaveBeenLastCalledWith("C");
    expect(hasUnsavedDrafts()).toBe(false);
  });

  it("still kills it when another user is active", () => {
    const save = vi.fn();
    const entry = acquireDraft("alice", "k", () =>
      createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
    );
    retainDraft(entry);
    entry.scheduler.change("B");
    setActiveDraftUser("bob");
    releaseDraft(entry);
    expect(isDraftKept(entry)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
