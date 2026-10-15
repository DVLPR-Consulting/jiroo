import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusListener } from "@/lib/realtime/bus";
import { buildChangeEvent } from "@/lib/realtime/events";
import { createChangeStream } from "@/lib/realtime/stream";

vi.mock("server-only", () => ({}));

const BACKLOG = "6f1c1f9e-8d0a-4c55-9f3e-2b7d1c0a9e11";
const ITEM = "a3d2c1b0-9e8f-4a7b-8c6d-5e4f3a2b1c00";

describe("createChangeStream", () => {
  let listener: BusListener | null;
  let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
  let abort: AbortController;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder();

  beforeEach(() => {
    vi.useFakeTimers();
    listener = null;
    unsubscribe = vi.fn<() => void>();
    abort = new AbortController();
    const stream = createChangeStream({
      subscribe: (_subscription, next) => {
        listener = next;
        return unsubscribe;
      },
      subscription: { backlogId: BACKLOG, userId: "me" },
      signal: abort.signal,
      heartbeatMs: 1_000,
      lifetimeMs: 5_000,
    });
    reader = stream.getReader();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function emit(...args: Parameters<BusListener>) {
    if (!listener) throw new Error("not subscribed");
    listener(...args);
  }

  async function readText(): Promise<string> {
    const chunk = await reader.read();
    return chunk.done ? "<done>" : decoder.decode(chunk.value);
  }

  it("opens with a retry hint", async () => {
    expect(await readText()).toBe("retry: 3000\n\n");
  });

  it("sends wire events, flagging my own changes", async () => {
    await readText();
    emit(buildChangeEvent({ kind: "item", backlogId: BACKLOG, itemIds: [ITEM], actorId: "me" }));
    expect(await readText()).toBe(`data: {"kind":"item","itemIds":["${ITEM}"],"self":true}\n\n`);

    emit(buildChangeEvent({ kind: "sprint", backlogId: BACKLOG, actorId: "u2" }));
    expect(await readText()).toBe('data: {"kind":"sprint","self":false}\n\n');
  });

  it.each(["ready", "resync"] as const)("forwards %s", async (kind) => {
    await readText();
    emit({ kind });
    expect(await readText()).toBe(`data: {"kind":"${kind}","self":false}\n\n`);
  });

  it("sends a heartbeat comment", async () => {
    await readText();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await readText()).toBe(": ping\n\n");
  });

  it("ends after its lifetime so access is checked again on reconnect", async () => {
    await readText();
    await vi.advanceTimersByTimeAsync(5_000);
    let text = await readText();
    while (text === ": ping\n\n") text = await readText();
    expect(text).toBe("<done>");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("unsubscribes once when the client goes away", async () => {
    await readText();
    abort.abort();
    expect(await readText()).toBe("<done>");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("unsubscribes when the reader cancels", async () => {
    await readText();
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("ignores events after closing", async () => {
    await readText();
    abort.abort();
    await readText();
    expect(() => emit({ kind: "resync" })).not.toThrow();
  });
});

describe("createChangeStream on an aborted request", () => {
  it("does not subscribe at all", async () => {
    const abort = new AbortController();
    abort.abort();
    const subscribe = vi.fn();
    const stream = createChangeStream({
      subscribe,
      subscription: { backlogId: null, userId: "me" },
      signal: abort.signal,
    });
    expect((await stream.getReader().read()).done).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });
});
