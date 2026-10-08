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

function setup(options: { initial?: string; delay?: number } = {}) {
  const calls: { value: string; reply: Deferred }[] = [];
  const save = vi.fn((value: string) => {
    const reply = deferred();
    calls.push({ value, reply });
    return reply.promise;
  });
  const snapshots: AutosaveSnapshot[] = [];
  const scheduler = createAutosaveScheduler<string>({
    initial: options.initial ?? "",
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
});
