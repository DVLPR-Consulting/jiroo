import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeBus, type BusMessage, type ListenClient } from "@/lib/realtime/bus";
import { REALTIME_CHANNEL, buildChangeEvent, serializeChangeEvent } from "@/lib/realtime/events";

vi.mock("server-only", () => ({}));

const BACKLOG = "6f1c1f9e-8d0a-4c55-9f3e-2b7d1c0a9e11";
const OTHER_BACKLOG = "0b6e3e5c-1d4f-4f8e-8a7d-5c9b2a1e3f22";

type ConnectMode = "ok" | "fail" | "hang";

class FakeClient extends EventEmitter implements ListenClient {
  queries: string[] = [];
  ended = false;
  #abort: ((error: Error) => void) | null = null;

  constructor(private readonly mode: ConnectMode) {
    super();
  }

  async connect(): Promise<void> {
    if (this.mode === "fail") throw new Error("connection refused");
    if (this.mode === "hang") {
      // Like pg: only end() settles a stuck attempt.
      await new Promise<void>((_resolve, reject) => {
        this.#abort = reject;
      });
    }
  }

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql);
    return {};
  }

  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.#abort?.(new Error("Connection terminated"));
    this.emit("end");
  }

  notify(payload: string, channel = REALTIME_CHANNEL) {
    this.emit("notification", { processId: 1, channel, payload });
  }

  /** The server dropped the connection, as pg reports it. */
  drop() {
    this.emit("error", new Error("Connection terminated unexpectedly"));
    this.ended = true;
    this.emit("end");
  }
}

function itemEvent(backlogId = BACKLOG) {
  return buildChangeEvent({ kind: "item", backlogId, actorId: "u1" });
}

describe("RealtimeBus", () => {
  let clients: FakeClient[];
  let failNext: number;
  let hangNext: boolean;
  let bus: RealtimeBus;

  beforeEach(() => {
    vi.useFakeTimers();
    clients = [];
    failNext = 0;
    hangNext = false;
    bus = new RealtimeBus({
      connectionString: "postgres://test",
      createClient: () => {
        const mode: ConnectMode = hangNext ? "hang" : failNext > 0 ? "fail" : "ok";
        if (failNext > 0) failNext -= 1;
        hangNext = false;
        const client = new FakeClient(mode);
        clients.push(client);
        return client;
      },
      minRetryDelayMs: 100,
      maxRetryDelayMs: 1_000,
      log: () => {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function clientAt(index: number): FakeClient {
    const client = clients[index];
    if (!client) throw new Error(`no client #${index}`);
    return client;
  }

  async function settle() {
    await vi.advanceTimersByTimeAsync(0);
  }

  it("connects only for the first subscriber and listens on the channel", async () => {
    expect(clients).toHaveLength(0);
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    bus.subscribe({ backlogId: BACKLOG, userId: "you" }, () => {});
    await settle();
    expect(clients).toHaveLength(1);
    expect(clientAt(0).queries).toEqual([`LISTEN ${REALTIME_CHANNEL}`]);
  });

  it("delivers matching events only", async () => {
    const received: BusMessage[] = [];
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, (message) => received.push(message));
    await settle();
    const mine = itemEvent();
    clientAt(0).notify(serializeChangeEvent(itemEvent(OTHER_BACKLOG)));
    clientAt(0).notify(serializeChangeEvent(mine));
    expect(received).toEqual([{ kind: "ready" }, mine]);
  });

  it("ignores malformed payloads and other channels", async () => {
    const listener = vi.fn();
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, listener);
    await settle();
    clientAt(0).notify("{not json");
    clientAt(0).notify(serializeChangeEvent(itemEvent()), "other_channel");
    expect(listener.mock.calls).toEqual([[{ kind: "ready" }]]);
  });

  it("keeps delivering when a listener throws", async () => {
    const after = vi.fn();
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {
      throw new Error("boom");
    });
    bus.subscribe({ backlogId: BACKLOG, userId: "you" }, after);
    await settle();
    clientAt(0).notify(serializeChangeEvent(itemEvent()));
    expect(after.mock.calls.map(([message]) => message.kind)).toEqual(["ready", "item"]);
  });

  it("closes the connection after the last subscriber and reopens on demand", async () => {
    const stopA = bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    const stopB = bus.subscribe({ backlogId: BACKLOG, userId: "you" }, () => {});
    await settle();
    stopA();
    stopA();
    expect(clientAt(0).ended).toBe(false);
    stopB();
    expect(clientAt(0).ended).toBe(true);

    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    await settle();
    expect(clients).toHaveLength(2);
    expect(clientAt(1).ended).toBe(false);
  });

  it("closes a connection that finishes opening after everyone left", async () => {
    const stop = bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    stop();
    await settle();
    expect(clientAt(0).ended).toBe(true);
  });

  it("reconnects with a growing delay and sends a resync after a lost connection", async () => {
    const received: BusMessage[] = [];
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, (message) => received.push(message));
    await settle();

    expect(received).toEqual([{ kind: "ready" }]);
    received.length = 0;

    failNext = 1;
    clientAt(0).drop();
    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(2);
    expect(received).toEqual([]);

    await vi.advanceTimersByTimeAsync(199);
    expect(clients).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(3);
    expect(received).toEqual([{ kind: "resync" }]);

    const event = itemEvent();
    clientAt(2).notify(serializeChangeEvent(event));
    clientAt(0).notify(serializeChangeEvent(itemEvent()));
    expect(received).toEqual([{ kind: "resync" }, event]);
  });

  it("tells a late subscriber it is ready once it holds its unsubscribe", async () => {
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    await settle();
    const received: BusMessage[] = [];
    bus.subscribe({ backlogId: BACKLOG, userId: "you" }, (message) => received.push(message));
    expect(received).toEqual([]);
    await settle();
    expect(received).toEqual([{ kind: "ready" }]);
  });

  it("is ready, not resyncing, after a first connection that needed retries", async () => {
    failNext = 1;
    const received: BusMessage[] = [];
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, (message) => received.push(message));
    await vi.advanceTimersByTimeAsync(100);
    expect(received).toEqual([{ kind: "ready" }]);
  });

  it("abandons a stuck connection when everyone leaves, then connects afresh", async () => {
    hangNext = true;
    const stop = bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    await settle();
    stop();
    expect(clientAt(0).ended).toBe(true);
    await settle();

    const received: BusMessage[] = [];
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, (message) => received.push(message));
    await settle();
    expect(clients).toHaveLength(2);
    expect(received).toEqual([{ kind: "ready" }]);
  });

  it("caps the retry delay", async () => {
    failNext = 10;
    bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    await vi.advanceTimersByTimeAsync(100 + 200 + 400 + 800 + 1_000);
    expect(clients).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(999);
    expect(clients).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(7);
  });

  it("stops retrying once everyone left", async () => {
    failNext = 1;
    const stop = bus.subscribe({ backlogId: BACKLOG, userId: "me" }, () => {});
    await settle();
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(clients).toHaveLength(1);
  });

  it("fails fast without a connection string", () => {
    const unconfigured = new RealtimeBus({ connectionString: undefined, log: () => {} });
    expect(() => unconfigured.subscribe({ backlogId: null, userId: "me" }, () => {})).toThrow(
      /DATABASE_URL/,
    );
  });
});
