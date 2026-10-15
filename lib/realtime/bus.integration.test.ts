import "dotenv/config";

import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RealtimeBus, type BusMessage } from "@/lib/realtime/bus";
import { REALTIME_CHANNEL, buildChangeEvent, serializeChangeEvent } from "@/lib/realtime/events";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("RealtimeBus against Postgres", () => {
  const backlogId = randomUUID();
  // Tags this suite's listeners so it never touches another process's.
  const applicationName = `jiroo-realtime-test-${backlogId.slice(0, 8)}`;
  let pool: Pool;
  let unsubscribe: (() => void) | null = null;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  afterAll(async () => {
    await pool.end();
  });

  function newBus() {
    return new RealtimeBus({
      connectionString: process.env.DATABASE_URL,
      createClient: (connectionString) =>
        new Client({ connectionString, application_name: applicationName }),
      minRetryDelayMs: 50,
      log: () => {},
    });
  }

  async function publish() {
    const event = buildChangeEvent({ kind: "item", backlogId, actorId: "integration" });
    await pool.query("SELECT pg_notify($1, $2)", [REALTIME_CHANNEL, serializeChangeEvent(event)]);
  }

  /** LISTEN starts asynchronously: publish until the subscriber hears one. */
  async function publishUntilHeard(received: BusMessage[]) {
    const heard = () => received.some((message) => message.kind === "item");
    await vi.waitFor(
      async () => {
        if (!heard()) await publish();
        expect(heard()).toBe(true);
      },
      { timeout: 5_000, interval: 100 },
    );
  }

  async function listenerPids(): Promise<number[]> {
    const { rows } = await pool.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND query = $2",
      [applicationName, `LISTEN ${REALTIME_CHANNEL}`],
    );
    return rows.map((row) => row.pid);
  }

  it("delivers a NOTIFY published through the pool", async () => {
    const received: BusMessage[] = [];
    unsubscribe = newBus().subscribe({ backlogId, userId: "me" }, (message) =>
      received.push(message),
    );
    await publishUntilHeard(received);
    expect(received.at(-1)).toMatchObject({ kind: "item", backlogId, actorId: "integration" });
  });

  it("hears notifications published by notifyUsers", async () => {
    const { notifyUsers } = await import("@/lib/realtime/publish");
    const userId = `integration-${backlogId}`;
    const received: BusMessage[] = [];
    unsubscribe = newBus().subscribe({ backlogId: null, userId }, (message) =>
      received.push(message),
    );
    await vi.waitFor(
      async () => {
        if (received.length === 0) await notifyUsers([userId, "someone-else"], "integration");
        expect(received.filter((message) => message.kind === "notification")).toEqual([
          expect.objectContaining({ kind: "notification", userId }),
        ]);
      },
      { timeout: 5_000, interval: 100 },
    );
  });

  it("tells the subscriber once its LISTEN is ready", async () => {
    const received: BusMessage[] = [];
    unsubscribe = newBus().subscribe({ backlogId, userId: "me" }, (message) =>
      received.push(message),
    );
    await vi.waitFor(() => expect(received).toEqual([{ kind: "ready" }]), {
      timeout: 5_000,
      interval: 50,
    });
  });

  it("resyncs and keeps listening after the connection is killed", async () => {
    const received: BusMessage[] = [];
    unsubscribe = newBus().subscribe({ backlogId, userId: "me" }, (message) =>
      received.push(message),
    );
    await publishUntilHeard(received);

    const listeners = await listenerPids();
    expect(listeners.length).toBeGreaterThan(0);
    await pool.query("SELECT pg_terminate_backend(pid) FROM unnest($1::int[]) AS pid", [listeners]);

    await vi.waitFor(() => expect(received).toContainEqual({ kind: "resync" }), {
      timeout: 5_000,
      interval: 50,
    });
    received.length = 0;
    await publishUntilHeard(received);
  });

  it("releases its connection once the last subscriber leaves", async () => {
    const before = (await listenerPids()).length;
    const received: BusMessage[] = [];
    const stop = newBus().subscribe({ backlogId, userId: "me" }, (message) =>
      received.push(message),
    );
    await publishUntilHeard(received);
    expect(await listenerPids()).toHaveLength(before + 1);

    stop();
    await vi.waitFor(async () => expect(await listenerPids()).toHaveLength(before), {
      timeout: 5_000,
      interval: 50,
    });
  });
});
