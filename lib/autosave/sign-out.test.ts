import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaveScheduler } from "@/lib/autosave/scheduler";
import { acquireDraft, clearDrafts, hasUnsavedDrafts } from "@/lib/autosave/registry";
import { UNSAVED_DRAFTS_SIGN_OUT_MESSAGE, prepareSignOut } from "@/lib/autosave/sign-out";

function draft(save: (value: string) => Promise<{ ok: true } | { ok: false; error: string }>) {
  const entry = acquireDraft("user-1", "item-description:item-1", () =>
    createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
  );
  return entry.scheduler;
}

describe("prepareSignOut", () => {
  beforeEach(() => clearDrafts());
  afterEach(() => vi.restoreAllMocks());

  it("signs out at once without drafts", async () => {
    const confirm = vi.spyOn(window, "confirm");
    expect(await prepareSignOut()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("saves pending drafts first, then signs out without asking", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    draft(save).change("B");
    const confirm = vi.spyOn(window, "confirm");
    expect(await prepareSignOut()).toBe(true);
    expect(save).toHaveBeenCalledWith("B");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before dropping drafts that could not be saved", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, error: "Indisponible" });
    draft(save).change("B");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(await prepareSignOut()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_DRAFTS_SIGN_OUT_MESSAGE);
    expect(hasUnsavedDrafts()).toBe(true);

    confirm.mockReturnValue(true);
    expect(await prepareSignOut()).toBe(true);
    expect(hasUnsavedDrafts()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("draft owner", () => {
  beforeEach(() => clearDrafts());

  it("forgets the drafts of another account", () => {
    const save = vi.fn().mockResolvedValue({ ok: false, error: "x" });
    const alice = acquireDraft("alice", "k", () =>
      createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
    );
    alice.scheduler.change("B");
    const bob = acquireDraft("bob", "k", () =>
      createAutosaveScheduler<string>({ initial: "A", delay: 900, save }) as never,
    );
    expect(bob).not.toBe(alice);
    expect(bob.scheduler.current()).toBe("A");
    expect(hasUnsavedDrafts()).toBe(false);
  });
});
