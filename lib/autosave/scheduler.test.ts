import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutosaveScheduler,
  type AutosaveSnapshot,
  type SaveResult,
} from "@/lib/autosave/scheduler";

type Deferred = {
  promise: Promise<SaveResult>;
  resolve: (result: SaveResult) => void;
  reject: (error: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: (result: SaveResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SaveResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(options: { initial?: string; delay?: number; revision?: number } = {}) {
  const calls: { value: string; reply: Deferred }[] = [];
  const save = vi.fn((value: string) => {
    const reply = deferred();
    calls.push({ value, reply });
    return reply.promise;
  });
  const snapshots: AutosaveSnapshot[] = [];
  const scheduler = createAutosaveScheduler<string>({
    initial: options.initial ?? "",
    revision: options.revision,
    delay: options.delay ?? 800,
    save,
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  const last = () => snapshots.at(-1) ?? scheduler.snapshot();
  return { scheduler, save, calls, last };
}

/** Lets the scheduler's awaited promises settle. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosaveScheduler", () => {
  it("saves once the user stops typing for the delay", async () => {
    const { scheduler, save } = setup();
    scheduler.change("a");
    await vi.advanceTimersByTimeAsync(500);
    scheduler.change("ab");
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("ab");
  });

  it("reports saving then saved", async () => {
    const { scheduler, calls, last } = setup();
    scheduler.change("x");
    expect(last()).toMatchObject({ status: "idle", pending: true });
    await vi.advanceTimersByTimeAsync(800);
    expect(last()).toMatchObject({ status: "saving", pending: true });
    calls[0]!.reply.resolve({ ok: true });
    await settle();
    expect(last()).toMatchObject({ status: "saved", pending: false, error: null });
  });

  it("flush saves immediately and cancels the debounce", async () => {
    const { scheduler, save, calls } = setup();
    scheduler.change("now");
    const flushed = scheduler.flush();
    expect(save).toHaveBeenCalledWith("now");
    calls[0]!.reply.resolve({ ok: true });
    await flushed;
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("skips the save when the value equals the last saved one", async () => {
    const { scheduler, save, last } = setup({ initial: "same" });
    scheduler.change("other");
    scheduler.change("same");
    await vi.advanceTimersByTimeAsync(800);
    await scheduler.flush();
    expect(save).not.toHaveBeenCalled();
    expect(last().pending).toBe(false);
  });

  it("keeps one save in flight and sends only the latest value afterwards", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("v1");
    void scheduler.flush();
    scheduler.change("v2");
    void scheduler.flush();
    scheduler.change("v3");
    void scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);
    calls[0]!.reply.resolve({ ok: true });
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("v3");
    expect(last().status).toBe("saving");
    calls[1]!.reply.resolve({ ok: true });
    await settle();
    expect(last()).toMatchObject({ status: "saved", pending: false });
  });

  it("does not resend when the value changed back during the save", async () => {
    const { scheduler, save, calls } = setup({ initial: "base" });
    scheduler.change("edited");
    void scheduler.flush();
    scheduler.change("base");
    calls[0]!.reply.resolve({ ok: true });
    await settle();
    // "base" is no longer the saved value: it must be saved again.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("base");
  });

  it("keeps the value and reports the error when the save fails", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("lost?");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: false, error: "Refusé." });
    await settle();
    expect(last()).toMatchObject({ status: "error", error: "Refusé.", pending: true });
    // No automatic retry loop.
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown save as a failure", async () => {
    const { scheduler, calls, last } = setup();
    scheduler.change("boom");
    void scheduler.flush();
    calls[0]!.reply.reject(new Error("network"));
    await settle();
    expect(last()).toMatchObject({ status: "error", pending: true });
    expect(last().error).toBeTruthy();
  });

  it("retry resends the pending value after a failure", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("again");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: false, error: "Erreur" });
    await settle();
    void scheduler.retry();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("again");
    calls[1]!.reply.resolve({ ok: true });
    await settle();
    expect(last()).toMatchObject({ status: "saved", error: null, pending: false });
  });

  it("typing after a failure schedules a new save", async () => {
    const { scheduler, save, calls } = setup();
    scheduler.change("a");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: false, error: "Erreur" });
    await settle();
    scheduler.change("ab");
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("ab");
  });

  it("dispose flushes the pending change and stops notifying", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("bye");
    const before = last();
    const done = scheduler.dispose();
    expect(save).toHaveBeenCalledWith("bye");
    calls[0]!.reply.resolve({ ok: true });
    await done;
    expect(last()).toBe(before);
    scheduler.change("ignored");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("adopts an external value only when nothing is pending", async () => {
    const { scheduler, save, calls } = setup({ initial: "server" });
    expect(scheduler.adopt("server v2")).toBe(true);
    await scheduler.flush();
    expect(save).not.toHaveBeenCalled();

    scheduler.change("local");
    expect(scheduler.adopt("server v3")).toBe(false);
    void scheduler.flush();
    expect(save).toHaveBeenLastCalledWith("local");
    calls[0]!.reply.resolve({ ok: true });
    await settle();
  });

  it("ignores a server value older than the last acknowledged save", async () => {
    const { scheduler, calls } = setup({ initial: "v0", revision: 1 });
    scheduler.change("v1");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: true, revision: 2 });
    await settle();
    scheduler.change("v2");
    void scheduler.flush();
    calls[1]!.reply.resolve({ ok: true, revision: 3 });
    await settle();
    // A refresh started after the first save arrives last.
    expect(scheduler.adopt("v1", 2)).toBe(false);
    expect(scheduler.adopt("v0", 1)).toBe(false);
    expect(scheduler.adopt("v2", 3)).toBe(true);
  });

  it("treats an equal revision as the same write and keeps the acknowledged text", async () => {
    const { scheduler, calls } = setup({ initial: "A", revision: 1000 });
    scheduler.change("B");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: true, revision: 1001 });
    await settle();
    expect(scheduler.adopt("B", 1001)).toBe(true);
    // A late response carrying another text at the same revision is stale.
    expect(scheduler.adopt("A", 1001)).toBe(false);
    expect(scheduler.current()).toBe("B");
    // Out of order, older: ignored; newer: taken.
    expect(scheduler.adopt("A", 1000)).toBe(false);
    expect(scheduler.adopt("C", 1002)).toBe(true);
    expect(scheduler.current()).toBe("C");
  });

  it("adopts a newer remote revert to an earlier text", async () => {
    const { scheduler, calls } = setup({ initial: "A", revision: 1 });
    scheduler.change("B");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: true, revision: 2 });
    await settle();
    expect(scheduler.adopt("B", 2)).toBe(true);
    // Someone else restored « A » afterwards.
    expect(scheduler.adopt("A", 3)).toBe(true);
    expect(scheduler.snapshot().pending).toBe(false);
    // And a late echo of our save is now older than that.
    expect(scheduler.adopt("B", 2)).toBe(false);
  });

  it("discard drops a failed draft so nothing resends it", async () => {
    const { scheduler, save, calls, last } = setup({ initial: "base" });
    scheduler.change("rejected");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: false, error: "Erreur" });
    await settle();
    scheduler.discard();
    expect(last()).toMatchObject({ status: "idle", error: null, pending: false });
    await scheduler.retry();
    await scheduler.flush();
    await vi.advanceTimersByTimeAsync(2000);
    await scheduler.dispose();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("discard cancels a pending debounce", async () => {
    const { scheduler, save } = setup({ initial: "base" });
    scheduler.change("typed");
    scheduler.discard();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ["succeeds", { ok: true } as SaveResult],
    ["fails", { ok: false, error: "Erreur" } as SaveResult],
  ])("kill stops for good while a request is in flight that then %s", async (_, reply) => {
    const { scheduler, save, calls, last } = setup({ initial: "A" });
    scheduler.change("B");
    void scheduler.flush();
    const before = last();
    scheduler.kill();
    calls[0]!.reply.resolve(reply);
    await settle();
    scheduler.change("C");
    await scheduler.flush();
    await scheduler.retry();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(last()).toBe(before);
  });

  it("suspend holds the armed debounce, changes and flushes until resume", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("a");
    scheduler.suspend();
    scheduler.change("ab");
    await scheduler.flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ pending: true });

    scheduler.resume();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledExactlyOnceWith("ab");
    calls[0]!.reply.resolve({ ok: true });
    await settle();
    expect(last()).toMatchObject({ status: "saved", pending: false });
  });

  it("suspend lets the request in flight finish but starts no next one", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("a");
    void scheduler.flush();
    scheduler.change("ab");
    scheduler.suspend();
    calls[0]!.reply.resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ pending: true });
  });

  it("resume does not retry a failed save by itself", async () => {
    const { scheduler, save, calls, last } = setup();
    scheduler.change("a");
    void scheduler.flush();
    calls[0]!.reply.resolve({ ok: false, error: "Session expirée." });
    await settle();
    scheduler.suspend();
    scheduler.resume();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ status: "error", pending: true });
  });
});
