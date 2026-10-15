import "server-only";

import { Client } from "pg";
import {
  REALTIME_CHANNEL,
  matchesSubscription,
  parseChangeEvent,
  type ChangeEvent,
  type RealtimeSubscription,
} from "@/lib/realtime/events";

/** What a subscriber receives: a change, or `resync` when events may have been missed. */
export type BusMessage = ChangeEvent | { kind: "resync" };
export type BusListener = (message: BusMessage) => void;

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
  #connecting = false;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #retryAttempt = 0;
  #missedEvents = false;

  constructor(options: RealtimeBusOptions) {
    this.#connectionString = options.connectionString;
    this.#createClient =
      options.createClient ?? ((connectionString) => new Client({ connectionString }));
    this.#minRetryDelayMs = options.minRetryDelayMs ?? 500;
    this.#maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;
    this.#log = options.log ?? ((message, error) => console.error(`[realtime] ${message}`, error));
  }

  subscribe(subscription: RealtimeSubscription, listener: BusListener): () => void {
    if (!this.#connectionString) {
      throw new Error("Realtime needs DATABASE_URL_UNPOOLED or DATABASE_URL.");
    }
    const entry: Entry = { subscription, listener };
    this.#entries.add(entry);
    if (this.#entries.size === 1) this.#open();
    return () => {
      if (this.#entries.delete(entry) && this.#entries.size === 0) this.#close();
    };
  }

  #open() {
    if (this.#client || this.#connecting || this.#retryTimer) return;
    this.#connecting = true;
    void this.#connect().finally(() => {
      this.#connecting = false;
    });
  }

  async #connect() {
    const client = this.#createClient(this.#connectionString!);
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
      this.#log("could not listen for changes", error);
      void client.end().catch(() => {});
      this.#missedEvents = true;
      if (this.#entries.size > 0) this.#scheduleRetry();
      return;
    }

    if (this.#entries.size === 0) {
      // Everyone left while the connection was opening.
      void client.end().catch(() => {});
      return;
    }
    this.#client = client;
    this.#retryAttempt = 0;
    if (this.#missedEvents) {
      this.#missedEvents = false;
      this.#broadcast({ kind: "resync" });
    }
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
    const client = this.#client;
    this.#client = null;
    if (client) void client.end().catch(() => {});
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
 * transaction mode, hence the optional unpooled URL.
 */
export function getRealtimeBus(): RealtimeBus {
  globalForRealtime.jirooRealtimeBus ??= new RealtimeBus({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  });
  return globalForRealtime.jirooRealtimeBus;
}
