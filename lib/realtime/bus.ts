import "server-only";

import { Client } from "pg";
import {
  REALTIME_CHANNEL,
  matchesSubscription,
  parseChangeEvent,
  type ChangeEvent,
  type RealtimeSubscription,
} from "@/lib/realtime/events";

/**
 * What a subscriber receives: a change; `ready` once its LISTEN is active, so
 * it can catch up on what happened before; `resync` when an established
 * listener was lost and changes may have been missed.
 */
export type BusMessage = ChangeEvent | { kind: "ready" } | { kind: "resync" };
export type BusListener = (message: BusMessage) => void;

/** Bounds a connection attempt that would otherwise hang (pg waits forever by default). */
const CONNECT_TIMEOUT_MS = 10_000;

/** The slice of `pg.Client` the bus relies on, so tests can stand in for it. */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
  on(event: "notification", listener: (message: { channel: string; payload?: string }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
}

export type RealtimeBusOptions = {
  connectionString: string | undefined;
  createClient?: (connectionString: string) => ListenClient;
  minRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  log?: (message: string, error?: unknown) => void;
};

type Entry = { subscription: RealtimeSubscription; listener: BusListener };

/**
 * Fans Postgres NOTIFY messages out to the SSE streams of this process.
 *
 * One dedicated connection, outside the pool, that is open only while someone
 * is subscribed so an idle database can suspend. A lost connection is retried
 * with a growing delay; subscribers then get a `resync` because notifications
 * sent in the meantime are gone.
 */
export class RealtimeBus {
  readonly #connectionString: string | undefined;
  readonly #createClient: (connectionString: string) => ListenClient;
  readonly #minRetryDelayMs: number;
  readonly #maxRetryDelayMs: number;
  readonly #log: (message: string, error?: unknown) => void;

  readonly #entries = new Set<Entry>();
  #client: ListenClient | null = null;
  /** The connection being opened; replaced or cleared to abandon it. */
  #pending: ListenClient | null = null;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #retryAttempt = 0;
  #missedEvents = false;

  constructor(options: RealtimeBusOptions) {
    this.#connectionString = options.connectionString;
    this.#createClient =
      options.createClient
      ?? ((connectionString) =>
        new Client({
          connectionString,
          connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
          query_timeout: CONNECT_TIMEOUT_MS,
        }));
    this.#minRetryDelayMs = options.minRetryDelayMs ?? 500;
    this.#maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;
    this.#log = options.log ?? ((message, error) => console.error(`[realtime] ${message}`, error));
  }

  subscribe(subscription: RealtimeSubscription, listener: BusListener): () => void {
    if (!this.#connectionString) {
      throw new Error("Realtime needs DIRECT_DATABASE_URL or DATABASE_URL.");
    }
    const entry: Entry = { subscription, listener };
    this.#entries.add(entry);
    if (this.#entries.size === 1) this.#open();
    else if (this.#client) {
      // Already listening: ready once the caller holds its unsubscribe.
      queueMicrotask(() => {
        if (this.#entries.has(entry) && this.#client) this.#call(entry, { kind: "ready" });
      });
    }
    return () => {
      if (this.#entries.delete(entry) && this.#entries.size === 0) this.#close();
    };
  }

  #open() {
    if (this.#client || this.#pending || this.#retryTimer) return;
    const client = this.#createClient(this.#connectionString!);
    this.#pending = client;
    void this.#connect(client);
  }

  async #connect(client: ListenClient) {
    client.on("notification", (message) => {
      if (this.#client === client && message.channel === REALTIME_CHANNEL && message.payload) {
        this.#deliver(message.payload);
      }
    });
    // pg emits `error` then `end` on a dropped connection; either one is enough.
    client.on("error", (error) => this.#lose(client, error));
    client.on("end", () => this.#lose(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${REALTIME_CHANNEL}`);
    } catch (error) {
      // Abandoned attempts were already closed by #close.
      if (this.#pending !== client) return;
      this.#pending = null;
      this.#log("could not listen for changes", error);
      void client.end().catch(() => {});
      if (this.#entries.size > 0) this.#scheduleRetry();
      return;
    }

    if (this.#pending !== client) {
      // Everyone left while the connection was opening.
      void client.end().catch(() => {});
      return;
    }
    this.#pending = null;
    this.#client = client;
    this.#retryAttempt = 0;
    const missed = this.#missedEvents;
    this.#missedEvents = false;
    this.#broadcast({ kind: missed ? "resync" : "ready" });
  }

  #lose(client: ListenClient, error?: unknown) {
    if (this.#client !== client) return;
    this.#client = null;
    this.#missedEvents = true;
    this.#log("lost the change listener, reconnecting", error);
    void client.end().catch(() => {});
    if (this.#entries.size > 0) this.#scheduleRetry();
  }

  #scheduleRetry() {
    const delay = Math.min(this.#maxRetryDelayMs, this.#minRetryDelayMs * 2 ** this.#retryAttempt);
    this.#retryAttempt += 1;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      if (this.#entries.size > 0) this.#open();
    }, delay);
    this.#retryTimer.unref?.();
  }

  #close() {
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#retryAttempt = 0;
    // Nobody is left to resync; the next subscriber loads fresh data anyway.
    this.#missedEvents = false;
    for (const client of [this.#client, this.#pending]) {
      if (client) void client.end().catch(() => {});
    }
    this.#client = null;
    this.#pending = null;
  }

  #deliver(payload: string) {
    const event = parseChangeEvent(payload);
    if (!event) {
      this.#log("ignored a malformed change payload");
      return;
    }
    for (const entry of this.#entries) {
      if (matchesSubscription(event, entry.subscription)) this.#call(entry, event);
    }
  }

  #broadcast(message: BusMessage) {
    for (const entry of this.#entries) this.#call(entry, message);
  }

  #call(entry: Entry, message: BusMessage) {
    try {
      entry.listener(message);
    } catch (error) {
      this.#log("a change listener failed", error);
    }
  }
}

const globalForRealtime = globalThis as typeof globalThis & { jirooRealtimeBus?: RealtimeBus };

/**
 * The process-wide bus. LISTEN needs a direct connection: Neon's pooler runs in
 * transaction mode, so the unpooled URL used by migrations wins when set.
 */
export function getRealtimeBus(): RealtimeBus {
  globalForRealtime.jirooRealtimeBus ??= new RealtimeBus({
    connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  });
  return globalForRealtime.jirooRealtimeBus;
}
