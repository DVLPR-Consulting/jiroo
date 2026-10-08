import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaveScheduler, type SaveResult } from "@/lib/autosave/scheduler";
import { acquireDraft, clearDrafts, hasUnsavedDrafts } from "@/lib/autosave/registry";

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
